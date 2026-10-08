import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRepoRules } from './check-repo-rules.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'rules-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test('accepts a clean repo', () => {
  const root = fixture({
    'packages/core/package.json': JSON.stringify({
      name: '@cds/rte-core',
      peerDependencies: { '@tiptap/core': '^3.0.0' },
    }),
    'packages/core/tsconfig.spec.json': JSON.stringify({
      compilerOptions: { composite: false },
    }),
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('rejects @angular/* in core peerDependencies', () => {
  const root = fixture({
    'packages/core/package.json': JSON.stringify({
      name: '@cds/rte-core',
      peerDependencies: { '@angular/core': '>=22' },
    }),
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('rejects composite true in tsconfig.spec.json', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json': JSON.stringify({
      compilerOptions: { composite: true },
    }),
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('parses tsconfig.spec.json containing comments', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json':
      '// linha\n{\n  /* bloco */\n  "compilerOptions": {\n    // c\n    "composite": true\n  }\n}\n',
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('tolerates a package dir without package.json', () => {
  const root = fixture({ 'packages/core/src/index.ts': '' });
  assert.deepEqual(checkRepoRules(root), []);
});

test('accepts a repo without packages dir', () => {
  assert.deepEqual(checkRepoRules(fixture({ 'README.md': '' })), []);
});

test('globs with /* inside strings do not hide composite true', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json':
      '{\n  "include": ["src/**/*.spec.ts", "**/*.test.ts"],\n  "compilerOptions": { "composite": true },\n  "exclude": ["dist/*/x", "src/**/*.d.ts"]\n}\n',
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('comments plus URL string still detect composite true', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json':
      '// linha\n{\n  /* bloco */\n  "$schema": "https://example.com/x.json",\n  "compilerOptions": { "composite": true }\n}\n',
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('comments only with composite false is clean', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json':
      '// linha\n{\n  /* bloco */\n  "include": ["src/**/*.spec.ts"],\n  "compilerOptions": { "composite": false }\n}\n',
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('unparseable tsconfig is reported as a violation, not a crash', () => {
  const root = fixture({ 'packages/angular/tsconfig.spec.json': '{ "a": ' });
  assert.equal(checkRepoRules(root).length, 1);
});

test('rejects Angular peers outside >=22.x.y <23', () => {
  const root = fixture({
    'packages/render/package.json': JSON.stringify({
      name: '@cds/rte-render',
      peerDependencies: { '@angular/core': '>=21.0.0 <23' },
    }),
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('accepts Angular peers >=22.2.1 <23', () => {
  const root = fixture({
    'packages/angular/package.json': JSON.stringify({
      name: '@cds/rte-angular',
      peerDependencies: { '@angular/core': '>=22.2.1 <23' },
    }),
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('requires governance files in the real repo (root package.json)', () => {
  const errors = checkRepoRules(
    fixture({ 'package.json': '{}', 'packages/core/src/index.ts': '' }),
  );
  assert.ok(errors.some((e) => e.startsWith('SECURITY.md:')));
  assert.ok(errors.some((e) => e.startsWith('docs/open-core.md:')));
});

const RENDER_PKG = {
  'packages/render/package.json': JSON.stringify({ name: '@cds/rte-render' }),
  'packages/render/src/index.ts':
    "export { fb as ɵfb } from './fb';\nexport { ok } from './ok';\n",
};

test('rejects an ɵ export whose declaration lacks @internal', () => {
  const root = fixture({
    ...RENDER_PKG,
    'packages/render/src/fb.ts':
      '/** Base. */\nexport function fb(): void {}\n',
  });
  const errors = checkRepoRules(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ɵfb.*@internal/);
});

test('accepts an ɵ export marked @internal (alias and direct)', () => {
  const root = fixture({
    ...RENDER_PKG,
    'packages/render/src/index.ts':
      "export { fb as ɵfb } from './fb';\n/** @internal */\nexport const ɵdirect = 1;\n",
    'packages/render/src/fb.ts':
      '/**\n * Base.\n * @internal\n */\nexport function fb(): void {}\n',
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('ignores ɵ in spec files', () => {
  const root = fixture({
    ...RENDER_PKG,
    'packages/render/src/index.ts': "export { ok } from './ok';\n",
    'packages/render/src/x.spec.ts': 'export const ɵ_nope = 1;\n',
  });
  assert.deepEqual(checkRepoRules(root), []);
});

const CORE_PKG = {
  'packages/core/package.json': JSON.stringify({
    name: '@cds/rte-core',
    exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './html': {
        types: './dist/html/index.d.ts',
        default: './dist/html/index.js',
      },
      './styles/content.css': './styles/content.css',
    },
  }),
};

test('rejects a public entry (exports with types) missing from the README', () => {
  const root = fixture({
    ...CORE_PKG,
    'packages/core/README.md': 'Use `@cds/rte-core`.\n',
  });
  const errors = checkRepoRules(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@cds\/rte-core\/html.*não é citado/);
});

test('accepts when every public entry is cited (css export is not an entry)', () => {
  const root = fixture({
    ...CORE_PKG,
    'packages/core/README.md': '`@cds/rte-core` e `@cds/rte-core/html`.\n',
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('a longer subpath does not satisfy a shorter one', () => {
  const root = fixture({
    ...CORE_PKG,
    'packages/core/README.md':
      '`@cds/rte-core` e `@cds/rte-core/html-extra`.\n',
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('rejects a secondary entry (ng-package.json) missing from the README', () => {
  const files = {
    'packages/angular/package.json': JSON.stringify({
      name: '@cds/rte-angular',
    }),
    'packages/angular/upload/ng-package.json': '{}',
  };
  const errors = checkRepoRules(
    fixture({ ...files, 'packages/angular/README.md': '@cds/rte-angular\n' }),
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@cds\/rte-angular\/upload/);
  const ok = checkRepoRules(
    fixture({
      ...files,
      'packages/angular/README.md':
        '@cds/rte-angular e @cds/rte-angular/upload\n',
    }),
  );
  assert.deepEqual(ok, []);
});

// ---- Demo (spec 07b, W3/W4): apps/demo é um consumidor externo ----

const demoErrors = (root) =>
  checkRepoRules(root).filter((e) => e.startsWith('apps/demo'));

const ROOT_PKG = JSON.stringify({
  devDependencies: {
    '@angular/core': '22.2.1',
    '@tiptap/core': '3.31.4',
    lowlight: '3.3.0',
    'highlight.js': '11.11.1',
    rxjs: '^7.8.2',
    typescript: '6.0.3',
    vitest: '^4.1.11',
  },
});

const CLEAN_DEMO = {
  'package.json': ROOT_PKG,
  'apps/demo/package.json': JSON.stringify({
    dependencies: {
      '@angular/core': '22.2.1',
      '@cds/rte-core': '0.0.0',
      '@tiptap/core': '3.31.4',
      lowlight: '3.3.0',
      'highlight.js': '11.11.1',
      rxjs: '7.8.2',
    },
    devDependencies: { typescript: '6.0.3', vitest: '4.1.12' },
  }),
  'apps/demo/tsconfig.json': JSON.stringify({
    compilerOptions: { strict: true },
  }),
  'apps/demo/tsconfig.app.json': JSON.stringify({
    extends: './tsconfig.json',
  }),
  'apps/demo/src/app/app.ts':
    "import { Component } from '@angular/core';\nimport { x } from './x';\nexport const y = import('./lazy');\n",
  'apps/demo/src/app/app.html': '<p class="a">oi</p>\n',
};

test('demo: sem apps/demo as regras não fazem nada', () => {
  assert.deepEqual(demoErrors(fixture({ 'package.json': ROOT_PKG })), []);
});

test('demo: um demo limpo passa (vitest fora da lista exata)', () => {
  assert.deepEqual(demoErrors(fixture(CLEAN_DEMO)), []);
});

test('demo: componente com styleUrl ou styles é recusado', () => {
  for (const decl of [
    "styleUrl: './a.css'",
    "styles: ['p{}']",
    "styleUrls: ['./a.css']",
  ]) {
    const root = fixture({
      ...CLEAN_DEMO,
      'apps/demo/src/app/c.ts': `@Component({ selector: 'x', ${decl} })\nexport class C {}\n`,
    });
    const errors = demoErrors(root);
    assert.equal(errors.length, 1, decl);
    assert.match(errors[0], /apps\/demo\/src\/app\/c\.ts.*styleUrl/);
  }
});

test('demo: tsconfig com paths é recusado', () => {
  const root = fixture({
    ...CLEAN_DEMO,
    'apps/demo/tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@cds/rte-core': ['../../x'] } },
    }),
  });
  const errors = demoErrors(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /tsconfig\.json.*paths/);
});

test('demo: tsconfig com extends que sai de apps/demo é recusado; extends interno passa', () => {
  const bad = fixture({
    ...CLEAN_DEMO,
    'apps/demo/tsconfig.app.json': JSON.stringify({
      extends: '../../tsconfig.base.json',
    }),
  });
  const errors = demoErrors(bad);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /tsconfig\.app\.json.*extends/);
  assert.deepEqual(demoErrors(fixture(CLEAN_DEMO)), []);
});

test('demo: tsconfig com comentários é lido', () => {
  const root = fixture({
    ...CLEAN_DEMO,
    'apps/demo/tsconfig.spec.json':
      '// c\n{ /* b */ "extends": "../../tsconfig.base.json" }\n',
  });
  assert.equal(demoErrors(root).length, 1);
});

test('demo: import de packages/, dist/ ou relativo que sai do demo é recusado', () => {
  for (const spec of [
    '../../../../packages/core/src/index',
    '../../../../../dist/packages/angular',
    '../../../../outro/arquivo',
    'packages/core/src/index',
  ]) {
    const root = fixture({
      ...CLEAN_DEMO,
      'apps/demo/src/app/bad.ts': `import { a } from '${spec}';\n`,
    });
    const errors = demoErrors(root);
    assert.equal(errors.length, 1, spec);
    assert.match(errors[0], /bad\.ts/);
  }
  const dyn = fixture({
    ...CLEAN_DEMO,
    'apps/demo/src/app/dyn.ts': "const m = import('../../../../packages/x');\n",
  });
  assert.equal(demoErrors(dyn).length, 1);
});

test('demo: serve.mjs e e2e/ ficam fora da regra de import', () => {
  const root = fixture({
    ...CLEAN_DEMO,
    'apps/demo/serve.mjs':
      "import x from '../../examples/server-node/server.mjs';\n",
    'apps/demo/e2e/helpers.ts':
      "import { a } from '../../../packages/core/src';\n",
  });
  assert.deepEqual(demoErrors(root), []);
});

test('demo: versão de terceiro diferente da exata da raiz é recusada', () => {
  const root = fixture({
    ...CLEAN_DEMO,
    'apps/demo/package.json': JSON.stringify({
      dependencies: {
        '@angular/core': '^22.2.1',
        '@tiptap/core': '3.31.3',
        lowlight: '3.3.0',
        rxjs: '7.8.1',
      },
      devDependencies: { typescript: '6.0.3' },
    }),
  });
  const errors = demoErrors(root);
  assert.equal(errors.length, 3);
  assert.ok(errors.some((e) => /@angular\/core/.test(e) && /22\.2\.1/.test(e)));
  assert.ok(errors.some((e) => /@tiptap\/core/.test(e)));
  assert.ok(errors.some((e) => /rxjs/.test(e) && /7\.8\.2/.test(e)));
});

test('demo: package-lock.json em apps/demo é recusado', () => {
  const root = fixture({ ...CLEAN_DEMO, 'apps/demo/package-lock.json': '{}' });
  const errors = demoErrors(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /package-lock\.json/);
});

test('demo: style=, [style…] e [ngStyle] em templates são recusados', () => {
  for (const html of [
    '<p style="color:red">x</p>',
    '<p [style.width.px]="w">x</p>',
    '<p [style]="s">x</p>',
    '<p [ngStyle]="s">x</p>',
    '<p [attr.style]="s">x</p>',
    "<p\n  style='a:b'>x</p>",
  ]) {
    const root = fixture({ ...CLEAN_DEMO, 'apps/demo/src/app/p.html': html });
    const errors = demoErrors(root);
    assert.equal(errors.length, 1, html);
    assert.match(errors[0], /p\.html/);
  }
  const ok = fixture({
    ...CLEAN_DEMO,
    'apps/demo/src/app/p.html': '<p class="styled" data-style="x">x</p>',
  });
  assert.deepEqual(demoErrors(ok), []);
});

test('demo: style= em template inline é recusado', () => {
  const root = fixture({
    ...CLEAN_DEMO,
    'apps/demo/src/app/inline.ts':
      '@Component({ selector: \'a\', template: `<p style="x:y">a</p>` })\nexport class A {}\n',
  });
  const errors = demoErrors(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /inline\.ts/);
  const ok = fixture({
    ...CLEAN_DEMO,
    'apps/demo/src/app/inline.ts':
      '@Component({ selector: \'a\', template: `<p class="a">a</p>` })\nexport class A {}\n',
  });
  assert.deepEqual(demoErrors(ok), []);
});
