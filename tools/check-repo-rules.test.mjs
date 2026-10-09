import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  checkCssReports,
  checkOldNames,
  checkRepoRules,
  checkRootReadmeNotice,
  checkRoteiro,
} from './check-repo-rules.mjs';

test('README raiz: aviso "não afiliado" antes do primeiro ## e depois do último', () => {
  const ok =
    '# T\n\nNão afiliado à Tiptap.\n\n## A\n\ntexto\n\n> não afiliado\n';
  assert.deepEqual(checkRootReadmeNotice(ok), []);
  assert.equal(
    checkRootReadmeNotice('# T\n\n## A\n\n> não afiliado\n').length,
    1,
  );
  assert.equal(
    checkRootReadmeNotice('# T\n\nnão afiliado\n\n## A\n\ntexto\n').length,
    1,
  );
  assert.equal(checkRootReadmeNotice('# T\n\n## A\n').length, 2);
});

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

test('demo: import absoluto ou file: fora de apps/demo é recusado', () => {
  for (const spec of ['/etc/passwd', 'file:///etc/passwd', 'file:relativo']) {
    const root = fixture({
      ...CLEAN_DEMO,
      'apps/demo/src/app/abs.ts': `import { a } from '${spec}';\n`,
    });
    const errors = demoErrors(root);
    assert.equal(errors.length, 1, spec);
    assert.match(errors[0], /abs\.ts/);
  }
});

test('demo: tsconfig com extends absoluto fora de apps/demo é recusado', () => {
  const outside = resolve(tmpdir(), 'fora', 'tsconfig.json');
  const root = fixture({
    ...CLEAN_DEMO,
    'apps/demo/tsconfig.app.json': JSON.stringify({ extends: outside }),
  });
  const errors = demoErrors(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /tsconfig\.app\.json.*extends/);
});

test('demo: style no host de componente ou diretiva é recusado', () => {
  for (const host of [
    "{ style: 'color: red' }",
    "{ '[style.color]': 'c()' }",
    "{ '[style]': 's()', class: 'a' }",
    "{ '[ngStyle]': 's()' }",
    "{ '[attr.style]': 's()' }",
    "{ 'style': 'x' }",
  ]) {
    const root = fixture({
      ...CLEAN_DEMO,
      'apps/demo/src/app/h.ts': `@Directive({ selector: 'x', host: ${host} })\nexport class H {}\n`,
    });
    const errors = demoErrors(root);
    assert.equal(errors.length, 1, host);
    assert.match(errors[0], /h\.ts.*host/);
  }
  const hostBinding = fixture({
    ...CLEAN_DEMO,
    'apps/demo/src/app/hb.ts':
      "class H { @HostBinding('style.color') c = 'red'; }\n",
  });
  assert.equal(demoErrors(hostBinding).length, 1);
  const ok = fixture({
    ...CLEAN_DEMO,
    'apps/demo/src/app/ok.ts':
      "@Directive({ selector: 'x', host: { class: 'a', '[class.b]': 'b()', '(click)': 'go()' } })\nexport class H {}\n",
  });
  assert.deepEqual(demoErrors(ok), []);
});

test('compat.json: teto ou skip sem reason/adr reprova', () => {
  const cap = fixture({
    'tools/compat.json': JSON.stringify({
      cap: { angular: { version: '22.4' }, tiptap: null },
      skip: [],
    }),
  });
  assert.match(
    checkRepoRules(cap).join('\n'),
    /teto de angular sem reason e adr/,
  );
  const skip = fixture({
    'tools/compat.json': JSON.stringify({
      cap: { angular: null, tiptap: null },
      skip: [{ leg: 'compat (next×latest)', reason: 'x' }],
    }),
  });
  assert.match(
    checkRepoRules(skip).join('\n'),
    /skip "compat \(next×latest\)" sem adr/,
  );
});

test('compat.json: com reason e adr passa; teto null passa; sem arquivo não faz nada', () => {
  const ok = fixture({
    'tools/compat.json': JSON.stringify({
      cap: {
        angular: { version: '22.4', reason: 'quebra', adr: '0019' },
        tiptap: null,
      },
      skip: [{ leg: 'compat (next×latest)', reason: 'x', adr: '0019' }],
    }),
  });
  assert.deepEqual(checkRepoRules(ok), []);
  const nulls = fixture({
    'tools/compat.json': JSON.stringify({
      cap: { angular: null, tiptap: null },
      skip: [],
    }),
  });
  assert.deepEqual(checkRepoRules(nulls), []);
  assert.deepEqual(checkRepoRules(fixture({ 'x.txt': '' })), []);
});

// ---- Docs (spec 07c, X2/X11): as regras do demo valem também para apps/docs ----

const docsErrors = (root) =>
  checkRepoRules(root).filter((e) => e.startsWith('apps/docs'));

const CLEAN_DOCS = Object.fromEntries(
  Object.entries(CLEAN_DEMO).map(([path, content]) => [
    path.replace('apps/demo/', 'apps/docs/'),
    content,
  ]),
);
CLEAN_DOCS['package.json'] = ROOT_PKG;

test('docs: sem apps/docs as regras não fazem nada', () => {
  assert.deepEqual(docsErrors(fixture({ 'package.json': ROOT_PKG })), []);
});

test('docs: um site limpo passa', () => {
  assert.deepEqual(docsErrors(fixture(CLEAN_DOCS)), []);
});

test('docs: lockfile, paths, import de packages/, style= e styleUrl são recusados com o nome do app', () => {
  const cases = {
    'apps/docs/package-lock.json': '{}',
    'apps/docs/tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@cds/x': ['../x'] } },
    }),
    'apps/docs/src/app/bad.ts': "import { a } from '../../../../packages/x';\n",
    'apps/docs/src/app/p.html': '<p style="color:red">x</p>',
    'apps/docs/src/app/c.ts':
      "@Component({ selector: 'x', styleUrl: './c.css' })\nexport class C {}\n",
  };
  for (const [path, content] of Object.entries(cases)) {
    const errors = docsErrors(fixture({ ...CLEAN_DOCS, [path]: content }));
    assert.ok(errors.length >= 1, path);
    assert.ok(
      errors.every((e) => e.startsWith('apps/docs')),
      path,
    );
  }
});

test('docs: bypassSecurityTrust* só em src/app/content/doc-html.ts', () => {
  const code = "const x = sanitizer.bypassSecurityTrustHtml('<b>x</b>');\n";
  const ok = fixture({
    ...CLEAN_DOCS,
    'apps/docs/src/app/content/doc-html.ts': code,
  });
  assert.deepEqual(docsErrors(ok), []);
  const bad = fixture({ ...CLEAN_DOCS, 'apps/docs/src/app/outro.ts': code });
  const errors = docsErrors(bad);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /outro\.ts.*bypassSecurityTrust/);
});

test('demo: bypassSecurityTrust* é proibido em qualquer arquivo', () => {
  const root = fixture({
    ...CLEAN_DEMO,
    'apps/demo/src/app/x.ts': "s.bypassSecurityTrustResourceUrl('x');\n",
  });
  const errors = demoErrors(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /x\.ts.*bypassSecurityTrust/);
});

test('docs: bloco cercado do conteúdo exige diretiva na linha anterior', () => {
  const F = '```';
  const bloco = `${F}ts\nconst a = 1;\n${F}\n`;
  const com = (d) => `Texto.\n\n${d}\n\n${bloco}`;
  for (const d of [
    '<!-- example: examples/a.ts#x -->',
    '<!-- generated: install-command -->',
    '<!-- no-compile: saída do terminal -->',
  ]) {
    const root = fixture({
      ...CLEAN_DOCS,
      'apps/docs/content/guia/a.md': com(d),
    });
    assert.deepEqual(docsErrors(root), [], d);
  }
  const bad = docsErrors(
    fixture({
      ...CLEAN_DOCS,
      'apps/docs/content/guia/a.md': `Texto.\n\n${bloco}`,
    }),
  );
  assert.equal(bad.length, 1);
  assert.match(
    bad[0],
    /apps\/docs\/content\/guia\/a\.md:3: bloco de código sem diretiva/,
  );
  const semMotivo = docsErrors(
    fixture({
      ...CLEAN_DOCS,
      'apps/docs/content/guia/b.md': com('<!-- no-compile: -->'),
    }),
  );
  assert.equal(semMotivo.length, 1);
  const aninhado = `<!-- no-compile: sintaxe -->\n${F}${F}md\n${F}ts\nx\n${F}\n${F}${F}\n`;
  assert.deepEqual(
    docsErrors(
      fixture({ ...CLEAN_DOCS, 'apps/docs/content/guia/c.md': aninhado }),
    ),
    [],
  );
});

test('docs: bloco cercado em lista (recuo >= 4) ou citação é recusado', () => {
  const F = '```';
  const casos = {
    lista: `- item\n\n    ${F}ts\n    x\n    ${F}\n`,
    citacao: `> ${F}ts\n> x\n> ${F}\n`,
  };
  for (const [nome, md] of Object.entries(casos)) {
    const errors = docsErrors(
      fixture({ ...CLEAN_DOCS, 'apps/docs/content/guia/a.md': md }),
    );
    assert.equal(errors.length, 1, nome);
    assert.match(errors[0], /aninhado em lista ou citação/, nome);
  }
});

// Spec 08b (O2): teto das capturas visuais (300 KB por arquivo, 20 MB no total).
function shotsErrors(files) {
  return checkRepoRules(fixture(files)).filter((e) =>
    /__screenshots__/.test(e),
  );
}
const SHOTS = 'e2e/visual/__screenshots__/visual-chromium/a.spec.ts';

test('capturas: diretório ausente não faz nada', () => {
  assert.deepEqual(shotsErrors({}), []);
});

test('capturas: dentro do teto passa', () => {
  assert.deepEqual(
    shotsErrors({ [`${SHOTS}/ok.png`]: Buffer.alloc(100 * 1024) }),
    [],
  );
});

test('capturas: arquivo de 301 KB reprova com o caminho', () => {
  const errors = shotsErrors({
    [`${SHOTS}/grande.png`]: Buffer.alloc(301 * 1024),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /grande\.png/);
  assert.match(errors[0], /300 KB/);
});

test('capturas: total acima de 20 MB reprova', () => {
  const files = {};
  for (let i = 0; i < 75; i++)
    files[`${SHOTS}/f${i}.png`] = Buffer.alloc(280 * 1024);
  const errors = shotsErrors(files);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /20 MB/);
});

// Spec 08b (O9): roteiro manual de leitor de tela.
test('roteiro: o repositório real tem o roteiro completo', () => {
  assert.deepEqual(checkRoteiro(resolve('.')), []);
});

test('roteiro: sem o arquivo reprova (pt-BR) no repositório com package.json', () => {
  const errors = checkRepoRules(
    fixture({ 'package.json': '{}', 'packages/core/src/index.ts': '' }),
  );
  assert.ok(errors.some((e) => /roteiro-leitor-de-tela\.md.*ausente/.test(e)));
});

test('roteiro: seção, campo do modelo e critério da K4 faltando reprovam', () => {
  const root = fixture({
    'docs/quality/roteiro-leitor-de-tela.md': '# Roteiro\n\n## Severidade\n',
  });
  const errors = checkRoteiro(root);
  assert.ok(errors.some((e) => e.includes('F4. Menu')));
  assert.ok(errors.some((e) => e.includes('"Executor:"')));
  assert.ok(errors.some((e) => e.includes('critério da K4')));
});

test('docs: CSS de exemplo (src/styles/exemplos*.css) não mira :root, html nem body (07d, L4)', () => {
  const ok = fixture({
    ...CLEAN_DOCS,
    'apps/docs/src/styles/exemplos.css':
      '/* :root só no comentário */\n.meu-tema { --rte-primary: #123456; }\n.meu-tema .rte-root, .outro .body { color: red; }\n',
  });
  assert.deepEqual(docsErrors(ok), []);
  for (const seletor of [
    ':root',
    'html',
    'body',
    'html.escuro',
    '.a, body > p',
  ]) {
    const bad = fixture({
      ...CLEAN_DOCS,
      'apps/docs/src/styles/exemplos-tema.css': `${seletor} { color: red; }\n`,
    });
    const errors = docsErrors(bad);
    assert.equal(errors.length, 1, seletor);
    assert.match(
      errors[0],
      /apps\/docs\/src\/styles\/exemplos-tema\.css: .*(:root|html|body).*classe envolvente/,
    );
  }
  // docs.css (o chrome do site) pode usar :root
  const chrome = fixture({
    ...CLEAN_DOCS,
    'apps/docs/src/styles/docs.css': ':root { color-scheme: light dark; }\n',
  });
  assert.deepEqual(docsErrors(chrome), []);
});

// --- 09c T1: dependências internas exatas (AP12) ---

const pkgJson = (name, extra = {}, version = '0.0.0') =>
  JSON.stringify({ name, version, ...extra });
const corePkg = pkgJson('@cds/rte-core');

function depsFixture(angularExtra, extraFiles = {}) {
  return fixture({
    'packages/core/package.json': corePkg,
    'packages/angular/package.json': pkgJson('@cds/rte-angular', angularExtra),
    'packages/angular/ng-package.json': JSON.stringify({
      allowedNonPeerDependencies: ['@cds/rte-core'],
    }),
    'packages/angular/src/index.ts': "import { x } from '@cds/rte-core';\n",
    ...extraFiles,
  });
}

test('deps internas: cenário correto passa', () => {
  const root = depsFixture({ dependencies: { '@cds/rte-core': '0.0.0' } });
  assert.deepEqual(checkRepoRules(root), []);
});

test('deps internas: faixa ^0.0.0 reprova', () => {
  const root = depsFixture({ dependencies: { '@cds/rte-core': '^0.0.0' } });
  const errors = checkRepoRules(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@cds\/rte-core.*exata/);
});

test('deps internas: versão diferente da do pacote referido reprova', () => {
  const root = depsFixture({ dependencies: { '@cds/rte-core': '0.0.1' } });
  const errors = checkRepoRules(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /0.0.0.*0.0.1/);
});

test('deps internas: peerDependencies com @cds/rte-core reprova', () => {
  const root = depsFixture({
    dependencies: { '@cds/rte-core': '0.0.0' },
    peerDependencies: { '@cds/rte-core': '0.0.0' },
  });
  const errors = checkRepoRules(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /peer/);
});

test('deps internas: peerDependenciesMeta com @cds/rte-* reprova', () => {
  const root = depsFixture({
    dependencies: { '@cds/rte-core': '0.0.0' },
    peerDependenciesMeta: { '@cds/rte-core': { optional: true } },
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('deps internas: import de @cds/rte-core em src sem dependencies reprova', () => {
  const root = depsFixture({});
  const errors = checkRepoRules(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /packages\/angular\/src\/index\.ts.*@cds\/rte-core/);
});

test('deps internas: import só em *.spec.ts não exige dependência', () => {
  const root = depsFixture(
    {},
    {
      'packages/angular/src/index.ts': 'export const a = 1;\n',
      'packages/angular/src/a.spec.ts':
        "import { x } from '@cds/rte-core/html';\n",
    },
  );
  assert.deepEqual(checkRepoRules(root), []);
});

test('deps internas: ng-package.json sem allowedNonPeerDependencies reprova', () => {
  const root = depsFixture(
    { dependencies: { '@cds/rte-core': '0.0.0' } },
    { 'packages/angular/ng-package.json': JSON.stringify({ dest: 'x' }) },
  );
  const errors = checkRepoRules(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /allowedNonPeerDependencies/);
});

// --- Nomes antigos da API pública (spec 09c, AP3) ---

const withRoot = (files) =>
  fixture({ 'package.json': JSON.stringify({ name: 'x' }), ...files });
const oldNameErrors = (files) => checkOldNames(withRoot(files));

test('nomes antigos: .ts com DEFAULT_LINK_POLICY reprova, citando arquivo, antigo e novo', () => {
  const errors = oldNameErrors({
    'packages/core/src/a.ts': 'export const x = DEFAULT_LINK_POLICY;\n',
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /packages\/core\/src\/a\.ts:1/);
  assert.match(errors[0], /DEFAULT_LINK_POLICY/);
  assert.match(errors[0], /RTE_DEFAULT_LINK_POLICY/);
});

test('nomes antigos: .md do site e bloco de código de README reprovam', () => {
  const md =
    'texto\n\n```ts\nimport { DraftStore } from "@cds/rte-core";\n```\n';
  const errors = oldNameErrors({
    'apps/docs/content/guia/x.md': md,
    'packages/core/README.md': md,
  });
  assert.equal(errors.length, 2);
  assert.ok(
    errors.every((e) => /DraftStore/.test(e) && /RteDraftStore/.test(e)),
  );
});

test('nomes antigos: nomes novos e falsos positivos passam', () => {
  assert.deepEqual(
    oldNameErrors({
      'a.ts': [
        'RTE_DEFAULT_LINK_POLICY',
        'RteDraftStoreFoo',
        'clearLocalDrafts',
        'RteDraftStore',
        'RteRgb',
        'Rgb8',
        'MyDraftStore',
        'DraftStores',
        'RTE_YOUTUBE_PROVIDER',
        'YOUTUBE_PROVIDERS_X',
      ].join('\n'),
    }),
    [],
  );
});

test('nomes antigos: "Rgb" como palavra solta reprova, mas dentro de RteRgb não', () => {
  assert.equal(oldNameErrors({ 'a.ts': 'type A = Rgb | null;\n' }).length, 1);
  assert.equal(
    oldNameErrors({ 'a.ts': 'type A = RteRgb | null;\n' }).length,
    0,
  );
});

test('nomes antigos: ADRs, specs e planos ficam de fora', () => {
  const text = 'DEFAULT_LINK_POLICY e CORE_VERSION\n';
  assert.deepEqual(
    oldNameErrors({
      'docs/decisions/x.md': text,
      'docs/specs/x.md': text,
      'docs/superpowers/plans/x.md': text,
    }),
    [],
  );
});

test('nomes antigos: nome removido (CORE_VERSION) reprova, sem substituto', () => {
  const errors = oldNameErrors({
    'a.ts': 'export const CORE_VERSION = "0";\n',
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /CORE_VERSION/);
  assert.match(errors[0], /removido/);
});

test('nomes antigos: arquivo com CRLF é lido por linha e binário é ignorado', () => {
  const root = withRoot({
    'a.ts': 'ok\r\nDEFAULT_ID_PREFIX\r\n',
  });
  writeFileSync(join(root, 'b.bin'), Buffer.from([0, 68, 114, 97, 102]));
  writeFileSync(
    join(root, 'c.bin'),
    Buffer.concat([Buffer.from([0]), Buffer.from('DraftStore')]),
  );
  const errors = checkOldNames(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\.ts:2/);
});

test('nomes antigos: checkRepoRules só varre quando há package.json na raiz', () => {
  const sem = fixture({ 'a.ts': 'DraftStore\n' });
  assert.deepEqual(checkRepoRules(sem), []);
  const com = withRoot({ 'a.ts': 'DraftStore\n' });
  assert.ok(checkRepoRules(com).some((e) => /DraftStore/.test(e)));
});

// --- Relatórios do CSS publicado (spec 09c, AP7) ---

test('CSS publicado: sem relatório nem css-public.json reprova', () => {
  const root = withRoot({ 'packages/core/styles/content.css': '.rte-root{}' });
  const errors = checkCssReports(root);
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => /content\.css-api\.md/.test(e)));
  assert.ok(errors.some((e) => /css-public\.json/.test(e)));
});

test('CSS publicado: src/*.css do tema também conta; com os dois arquivos passa', () => {
  const files = {
    'packages/theme/src/theme.css': '.rte-root{}',
  };
  assert.equal(checkCssReports(withRoot(files)).length, 2);
  assert.deepEqual(
    checkCssReports(
      withRoot({
        ...files,
        'packages/theme/api/theme.css-api.md': '# x\n',
        'packages/theme/api/css-public.json': '{}',
      }),
    ),
    [],
  );
});

test('CSS publicado: pacote sem CSS (sanitizer) não exige nada', () => {
  assert.deepEqual(
    checkCssReports(withRoot({ 'packages/sanitizer/src/index.ts': '' })),
    [],
  );
});
