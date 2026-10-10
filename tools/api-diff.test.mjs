import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReport,
  diffReports,
  requiredBump,
  checkApiDiff,
  parseChangeset,
  packageOfReport,
  collectChanges,
} from './api-diff.mjs';

const wrap = (body) =>
  `## Public API Report File for "@comodeviaser/rte-core"\n\n> Do not edit.\n\n\`\`\`ts\n\n${body}\n\n\`\`\`\n`;

const BASE = wrap(`import { Foo } from 'x';

// @public
export function slugify(text: string): string;

// @public
export interface RteOptions {
    a?: string;
    b: number;
}

// @public
export class RteBox {
    constructor();
    // (undocumented)
    run(x: number): void;
}`);

test('parseReport indexa por declaração e membro, sem comentários', () => {
  const map = parseReport(BASE);
  assert.ok(map.has('function slugify'));
  assert.ok(map.has('interface RteOptions'));
  assert.ok(map.has('interface RteOptions::a'));
  assert.ok(map.has('class RteBox::run'));
  assert.equal(map.get('interface RteOptions::b'), 'b: number;');
  assert.ok(![...map.keys()].some((k) => k.startsWith('import')));
});

test('reformatação e CRLF não são mudança (Review Focus 3)', () => {
  const crlf = BASE.replace(/\n/g, '\r\n');
  const spaced = BASE.replace('a?: string;', 'a?:   string ;').replace(
    '// (undocumented)',
    '// (undocumented)\n    // Warning: x',
  );
  for (const other of [crlf, spaced]) {
    assert.deepEqual(diffReports(BASE, other), {
      added: [],
      removed: [],
      changed: [],
    });
  }
});

test('só acréscimo: membro novo e declaração nova', () => {
  const next = BASE.replace(
    'b: number;',
    'b: number;\n    c?: boolean;',
  ).replace(
    'export class RteBox',
    '// @public\nexport const RTE_X: 1;\n\n// @public\nexport class RteBox',
  );
  const d = diffReports(BASE, next);
  assert.deepEqual(d.removed, []);
  assert.deepEqual(d.changed, []);
  assert.deepEqual(d.added.sort(), ['const RTE_X', 'interface RteOptions::c']);
});

test('remoção e alteração são distintas', () => {
  const removed = diffReports(BASE, BASE.replace('    a?: string;\n', ''));
  assert.deepEqual(removed.removed, ['interface RteOptions::a']);
  const changed = diffReports(BASE, BASE.replace('b: number;', 'b: string;'));
  assert.deepEqual(changed.changed, ['interface RteOptions::b']);
  const gone = diffReports(
    BASE,
    wrap('// @public\nexport function slugify(text: string): string;'),
  );
  assert.ok(gone.removed.includes('class RteBox'));
  assert.ok(gone.removed.includes('class RteBox::run'));
});

test('@deprecated novo em linha existente conta como acréscimo', () => {
  const next = BASE.replace(
    '// @public\nexport function slugify',
    '// @public @deprecated\nexport function slugify',
  );
  const d = diffReports(BASE, next);
  assert.deepEqual(d, {
    added: ['function slugify@deprecated'],
    removed: [],
    changed: [],
  });
});

test('mudança para @internal conta como alteração', () => {
  const next = BASE.replace(
    '// @public\nexport function slugify',
    '// @internal\nexport function slugify',
  );
  assert.deepEqual(diffReports(BASE, next).changed, ['function slugify']);
});

test('requiredBump segue 0.x e 1.x', () => {
  const none = { added: [], removed: [], changed: [] };
  assert.equal(requiredBump({ diff: none, version: '0.0.0' }), 'none');
  assert.equal(
    requiredBump({ diff: { ...none, added: ['a'] }, version: '0.1.0' }),
    'patch',
  );
  assert.equal(
    requiredBump({ diff: { ...none, removed: ['a'] }, version: '0.3.1' }),
    'minor',
  );
  assert.equal(
    requiredBump({ diff: { ...none, changed: ['a'] }, version: '1.0.0' }),
    'major',
  );
});

const VERSIONS = { '@comodeviaser/rte-core': '0.0.0', '@comodeviaser/rte-theme': '0.0.0' };
const report = (oldText, newText, pkg = '@comodeviaser/rte-core') => ({
  file: 'packages/core/api/rte-core.api.md',
  package: pkg,
  oldText,
  newText,
});
const cs = (releases) => ({ file: '.changeset/x.md', releases });
const REMOVED = BASE.replace('    a?: string;\n', '');
const ADDED = BASE.replace('b: number;', 'b: number;\n    c?: boolean;');

test('só acréscimo + changeset patch ou minor passa', () => {
  for (const type of ['patch', 'minor']) {
    assert.deepEqual(
      checkApiDiff({
        changedReports: [report(BASE, ADDED)],
        changesets: [cs({ '@comodeviaser/rte-core': type })],
        versions: VERSIONS,
      }),
      [],
    );
  }
});

test('remoção em 0.x: patch falha, minor passa', () => {
  const run = (type) =>
    checkApiDiff({
      changedReports: [report(BASE, REMOVED)],
      changesets: [cs({ '@comodeviaser/rte-core': type })],
      versions: VERSIONS,
    });
  assert.equal(run('patch').length, 1);
  assert.match(run('patch')[0], /minor/);
  assert.deepEqual(run('minor'), []);
});

test('remoção em 1.0.0: minor falha, major passa', () => {
  const versions = { '@comodeviaser/rte-core': '1.0.0' };
  const run = (type) =>
    checkApiDiff({
      changedReports: [report(BASE, REMOVED)],
      changesets: [cs({ '@comodeviaser/rte-core': type })],
      versions,
    });
  assert.equal(run('minor').length, 1);
  assert.deepEqual(run('major'), []);
});

test('relatório mudado sem changeset do pacote falha; o de outro pacote não vale', () => {
  assert.equal(
    checkApiDiff({
      changedReports: [report(BASE, ADDED)],
      changesets: [],
      versions: VERSIONS,
    }).length,
    1,
  );
  const errors = checkApiDiff({
    changedReports: [report(BASE, ADDED)],
    changesets: [cs({ '@comodeviaser/rte-theme': 'major' })],
    versions: VERSIONS,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@comodeviaser\/rte-core/);
});

test('relatório só reformatado/CRLF não exige changeset', () => {
  assert.deepEqual(
    checkApiDiff({
      changedReports: [report(BASE, BASE.replace(/\n/g, '\r\n'))],
      changesets: [],
      versions: VERSIONS,
    }),
    [],
  );
});

test('relatório novo (sem versão antiga) conta como só acréscimo', () => {
  assert.deepEqual(
    checkApiDiff({
      changedReports: [report(undefined, BASE)],
      changesets: [cs({ '@comodeviaser/rte-core': 'patch' })],
      versions: VERSIONS,
    }),
    [],
  );
});

const SCHEMA = (rows) =>
  `# Esquema de HTML aceito\n\nVersão do esquema: 1.\n\n## Base\n\n| Tag | Atributos |\n| --- | --- |\n${rows}\n`;

test('remoção no esquema HTML conta como remoção de API', () => {
  const oldSchema = SCHEMA('| `<p>` | — |\n| `<hr>` | — |');
  const newSchema = SCHEMA('| `<p>` | — |');
  const d = diffReports(oldSchema, newSchema);
  assert.deepEqual(d.removed, ['Base::<hr>']);
  const errors = checkApiDiff({
    changedReports: [
      {
        file: 'docs/html-schema.md',
        package: '@comodeviaser/rte-core',
        oldText: oldSchema,
        newText: newSchema,
      },
    ],
    changesets: [cs({ '@comodeviaser/rte-core': 'patch' })],
    versions: VERSIONS,
  });
  assert.equal(errors.length, 1);
});

const CSSR = (rows) =>
  `# Superfície CSS de \`theme.css\`\n\n## Classes\n\n${rows}\n`;

test('CSS: remover item public exige minor; internal removido não exige nada', () => {
  const oldCss = CSSR('- `.rte-root` — public\n- `.rte-x` — internal');
  assert.deepEqual(diffReports(oldCss, CSSR('- `.rte-root` — public')), {
    added: [],
    removed: [],
    changed: [],
  });
  assert.deepEqual(diffReports(oldCss, CSSR('- `.rte-x` — internal')).removed, [
    'Classes::.rte-root',
  ]);
  assert.deepEqual(
    diffReports(oldCss, CSSR('- `.rte-root` — internal\n- `.rte-x` — internal'))
      .removed,
    ['Classes::.rte-root'],
  );
});

test('parseChangeset lê o frontmatter', () => {
  const text =
    '---\n"@comodeviaser/rte-core": minor\n\'@comodeviaser/rte-theme\': patch\n---\n\nTexto\n';
  assert.deepEqual(parseChangeset(text.replace(/\n/g, '\r\n')), {
    '@comodeviaser/rte-core': 'minor',
    '@comodeviaser/rte-theme': 'patch',
  });
  assert.deepEqual(parseChangeset('sem frontmatter'), {});
});

test('packageOfReport mapeia arquivo para pacote', () => {
  assert.equal(
    packageOfReport('packages/angular/api/rte-angular.api.md'),
    '@comodeviaser/rte-angular',
  );
  assert.equal(
    packageOfReport('packages/theme/api/theme.css-api.md'),
    '@comodeviaser/rte-theme',
  );
  assert.equal(packageOfReport('docs/html-schema.md'), '@comodeviaser/rte-core');
  assert.equal(packageOfReport('packages/core/src/x.ts'), null);
  assert.equal(packageOfReport('packages/core/api/css-public.json'), null);
});

test('collectChanges usa o git injetado', () => {
  const calls = [];
  const files = {
    'base:packages/core/api/rte-core.api.md': BASE,
    'disk:packages/core/api/rte-core.api.md': ADDED,
    'disk:.changeset/novo.md': '---\n"@comodeviaser/rte-core": minor\n---\n\nx\n',
    'disk:packages/core/package.json':
      '{"name":"@comodeviaser/rte-core","version":"0.0.0"}',
  };
  const git = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'merge-base') return 'abc123\n';
    if (args[0] === 'diff' && args.includes('--diff-filter=AM'))
      return '.changeset/novo.md\n.changeset/README.md\n';
    if (args[0] === 'diff')
      return 'packages/core/api/rte-core.api.md\npackages/core/src/x.ts\nREADME.md\n';
    if (args[0] === 'show')
      return (
        files['base:' + args[1].split(':')[1]] ??
        (() => {
          throw new Error('ausente');
        })()
      );
    throw new Error('inesperado ' + args.join(' '));
  };
  const read = (p) => files['disk:' + p];
  const out = collectChanges({
    base: 'origin/main',
    git,
    read,
    packageDirs: ['core'],
  });
  assert.equal(out.changedReports.length, 1);
  assert.equal(out.changedReports[0].package, '@comodeviaser/rte-core');
  assert.equal(out.changedReports[0].oldText, BASE);
  assert.equal(out.changesets.length, 1);
  assert.deepEqual(out.changesets[0].releases, { '@comodeviaser/rte-core': 'minor' });
  assert.deepEqual(out.versions, { '@comodeviaser/rte-core': '0.0.0' });
  assert.ok(calls.every((c) => !c.includes('push')));
  // Base = merge-base (não a ponta da base) e sem detecção de renomeação (M3).
  assert.ok(calls.some((c) => c === 'merge-base origin/main HEAD'));
  assert.ok(calls.some((c) => c === 'show abc123:packages/core/api/rte-core.api.md'));
  assert.ok(!calls.some((c) => c.includes('origin/main:')));
  for (const c of calls.filter((c) => c.startsWith('diff')))
    assert.ok(c.includes('--no-renames'), c);
});
