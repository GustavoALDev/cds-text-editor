import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  checkDocumentation,
  checkPrefixConvention,
  checkReportSet,
  extractPackageDoc,
  internalLeaks,
  listEntries,
  main,
  reportFileName,
  sourceEntryFile,
} from './api-report.mjs';

function fixture(files, exportsField, name = '@cds/rte-demo') {
  const dir = mkdtempSync(join(tmpdir(), 'api-report-test-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '0.0.0', exports: exportsField }),
  );
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), c);
  }
  return dir;
}
const EXPORTS = {
  '.': { types: './dist/index.d.ts', default: './dist/index.js' },
  './html': {
    types: './dist/html/index.d.ts',
    default: './dist/html/index.js',
  },
  './styles/x.css': './styles/x.css',
  './package.json': { default: './package.json' },
};

test('reportFileName: sem escopo, subcaminho com hífen', () => {
  assert.equal(reportFileName('@cds/rte-core', '.'), 'rte-core.api.md');
  assert.equal(
    reportFileName('@cds/rte-core', './html'),
    'rte-core-html.api.md',
  );
  assert.equal(
    reportFileName('@cds/rte-angular', './a/b'),
    'rte-angular-a-b.api.md',
  );
});

test('listEntries: só subcaminhos com types', () => {
  const dir = fixture({}, EXPORTS);
  const e = listEntries(dir);
  assert.deepEqual(
    e.map((x) => [x.subpath, x.name]),
    [
      ['.', 'rte-demo.api.md'],
      ['./html', 'rte-demo-html.api.md'],
    ],
  );
});

test('checkReportSet: entry sem relatório e relatório órfão falham', () => {
  const dir = fixture(
    { 'api/rte-demo.api.md': '', 'api/velho.api.md': '' },
    EXPORTS,
  );
  const errs = checkReportSet(listEntries(dir), join(dir, 'api'));
  assert.equal(errs.length, 2);
  assert.match(errs[0], /sem relatório.*rte-demo-html\.api\.md/);
  assert.match(errs[1], /órfão.*velho\.api\.md/);
});

const DTS = (extra = '') =>
  `export declare function a(x: string): number;\n${extra}`;
const BASE = {
  './dist/index.d.ts': DTS(),
  './dist/html/index.d.ts': 'export declare const h: 1;\n',
};
const files = (m) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k.slice(2), v]));

test('main: UPDATE_API escreve, comparação passa, mudança no .d.ts falha', async () => {
  const dir = fixture(files(BASE), EXPORTS);
  const opts = { root: dir };
  assert.deepEqual(await main(dir, { ...opts, update: true }), []);
  const rep = readFileSync(join(dir, 'api', 'rte-demo.api.md'), 'utf8');
  assert.match(rep, /export function a\(x: string\): number;/);
  assert.deepEqual(await main(dir, opts), []);
  writeFileSync(
    join(dir, 'dist/index.d.ts'),
    DTS('export declare function b(): void;\n'),
  );
  const errs = await main(dir, opts);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /desatualizado/);
  assert.deepEqual(await main(dir, { ...opts, update: true }), []);
  assert.deepEqual(await main(dir, opts), []);
  rmSync(dir, { recursive: true, force: true });
});

test('main: chunks com nomes diferentes dão o mesmo relatório', async () => {
  const a = fixture(
    files({
      './dist/index.d.ts': `export { T } from './chunk-AAA.js';\n`,
      './dist/chunk-AAA.d.ts': 'export interface T { a: 1 }\n',
      './dist/html/index.d.ts': 'export declare const h: 1;\n',
    }),
    EXPORTS,
  );
  const b = fixture(
    files({
      './dist/index.d.ts': `export { T } from './chunk-ZZZ.js';\n`,
      './dist/chunk-ZZZ.d.ts': 'export interface T { a: 1 }\n',
      './dist/html/index.d.ts': 'export declare const h: 1;\n',
    }),
    EXPORTS,
  );
  await main(a, { root: a, update: true });
  await main(b, { root: b, update: true });
  const r = (d) => readFileSync(join(d, 'api', 'rte-demo.api.md'), 'utf8');
  assert.equal(r(a), r(b));
});

test('main: tipo usado e não exportado vira ae-forgotten-export', async () => {
  const dir = fixture(
    files({
      './dist/index.d.ts':
        'interface Hidden { a: 1 }\ndeclare function f(): Hidden;\nexport { f };\n',
      './dist/html/index.d.ts': 'export declare const h: 1;\n',
    }),
    EXPORTS,
  );
  const errs = await main(dir, { root: dir, update: true });
  assert.ok(
    errs.some((e) => e.includes('ae-forgotten-export')),
    JSON.stringify(errs),
  );
});

test('main: @internal fica fora do relatório', async () => {
  const dir = fixture(
    files({
      './dist/index.d.ts':
        '/** @internal */\nexport declare function ɵx(): void;\nexport declare function ok(): void;\n',
      './dist/html/index.d.ts': 'export declare const h: 1;\n',
    }),
    EXPORTS,
  );
  assert.deepEqual(await main(dir, { root: dir, update: true }), []);
  const rep = readFileSync(join(dir, 'api', 'rte-demo.api.md'), 'utf8');
  assert.ok(!rep.includes('ɵx') && rep.includes('ok'));
});

test('internalLeaks: só os static ɵ do compilador do Angular passam', () => {
  const ok =
    'class A {\n    static ɵcmp: X<A>;\n    protected static ɵfac: Y;\n    static ɵprov: Z;\n}\n';
  assert.deepEqual(internalLeaks(ok), []);
  assert.equal(
    internalLeaks(
      'class A {\n    protected static readonly ɵdialogKit: 1;\n}\n',
    ).length,
    1,
  );
});

test('main: ɵ público fora do permitido falha; com @internal passa', async () => {
  const bad = fixture(
    files({
      './dist/index.d.ts': 'export declare function ɵx(): void;\n',
      './dist/html/index.d.ts': 'export declare const h: 1;\n',
    }),
    EXPORTS,
  );
  const errs = await main(bad, { root: bad, update: true });
  assert.ok(
    errs.some((e) => e.includes('ɵ')),
    JSON.stringify(errs),
  );
});

test('main: com modelDir grava .api.json por entry e o relatório não muda', async () => {
  const dir = fixture(files(BASE), EXPORTS);
  const modelDir = join(dir, 'model');
  await main(dir, { root: dir, update: true });
  const antes = readFileSync(join(dir, 'api', 'rte-demo.api.md'), 'utf8');
  const errs = await main(dir, { root: dir, modelDir });
  assert.deepEqual(errs, []);
  assert.equal(
    readFileSync(join(dir, 'api', 'rte-demo.api.md'), 'utf8'),
    antes,
  );
  const model = JSON.parse(
    readFileSync(join(modelDir, 'rte-demo.api.json'), 'utf8'),
  );
  assert.equal(model.name, 'rte-demo');
  assert.equal(model.kind, 'Package');
  const sub = JSON.parse(
    readFileSync(join(modelDir, 'rte-demo-html.api.json'), 'utf8'),
  );
  assert.equal(sub.name, 'rte-demo-html');
  rmSync(dir, { recursive: true, force: true });
});

test('main: com modelDir e UPDATE_API o relatório fica byte a byte igual ao sem modelo', async () => {
  const a = fixture(files(BASE), EXPORTS);
  const b = fixture(files(BASE), EXPORTS);
  await main(a, { root: a, update: true });
  await main(b, { root: b, update: true, modelDir: join(b, 'model') });
  for (const f of ['rte-demo.api.md', 'rte-demo-html.api.md'])
    assert.equal(
      readFileSync(join(a, 'api', f), 'utf8'),
      readFileSync(join(b, 'api', f), 'utf8'),
    );
});

test('runExtractor: sem modelDir o docModel segue desligado (nenhum .api.json)', async () => {
  const dir = fixture(files(BASE), EXPORTS);
  await main(dir, { root: dir, update: true });
  assert.equal(existsSync(join(dir, 'model')), false);
});

const DOC_TAIL = '\n// (No @packageDocumentation comment for this package)\n';
const rep = (body, { packageDoc = true } = {}) =>
  '```ts\n\n' + body + '\n' + (packageDoc ? '' : DOC_TAIL) + '\n```\n';

test('checkPrefixConvention: classe, interface, const e type sem prefixo reprovam', () => {
  const text = rep(
    [
      '// @public',
      'export class Foo {',
      '}',
      '',
      '// @public',
      'export interface Bar {',
      '    a: 1;',
      '}',
      '',
      '// @public',
      'export const baz: 1;',
      '',
      '// @public',
      "export type Qux = 'a';",
    ].join('\n'),
  );
  const errs = checkPrefixConvention(text, { entryName: 'rte-demo.api.md' });
  assert.equal(errs.length, 4);
  for (const n of ['Foo', 'Bar', 'baz', 'Qux'])
    assert.ok(
      errs.some((e) => e.includes(`"${n}"`) && e.includes('rte-demo.api.md')),
      errs.join('\n'),
    );
});

test('checkPrefixConvention: Rte/RTE_ e funções (slugify, provideRichText) passam', () => {
  const text = rep(
    [
      '// @public',
      'export class RteFoo {',
      '}',
      '',
      '// @public',
      'export const RTE_X: 1;',
      '',
      '// @public',
      'export function slugify(s: string): string;',
      '',
      '// @public',
      'export function provideRichText(): void;',
      '',
      'export { clearLocalDrafts }',
    ].join('\n'),
  );
  assert.deepEqual(checkPrefixConvention(text), []);
});

test('checkPrefixConvention: exceção listada com motivo passa; sem motivo reprova; CRLF tolerado', () => {
  const text = rep('// @public\nexport class Foo {\n}').replaceAll('\n', '\r\n');
  assert.deepEqual(
    checkPrefixConvention(text, {
      allow: [{ name: 'Foo', reason: 'nome legado exigido pelo Tiptap' }],
    }),
    [],
  );
  const errs = checkPrefixConvention(text, { allow: [{ name: 'Foo' }] });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /motivo/);
});

test('checkDocumentation: (undocumented) fora de Rte*Labels reprova; em membro de RteDialogLabels passa', () => {
  const bad = rep(
    '// @public (undocumented)\nexport interface RteFoo {\n    a: string;\n}',
  );
  const errs = checkDocumentation(bad, 'rte-demo.api.md');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /RteFoo/);
  assert.match(errs[0], /rte-demo\.api\.md/);

  const member = rep(
    '// @public\nexport interface RteFoo {\n    // (undocumented)\n    a: string;\n}',
  );
  assert.equal(checkDocumentation(member, 'x.api.md').length, 1);

  const labels = rep(
    '// @public\nexport interface RteDialogLabels {\n    // (undocumented)\n    title: string;\n    // (undocumented)\n    ok: string;\n}',
  );
  assert.deepEqual(checkDocumentation(labels, 'x.api.md'), []);
});

test('checkDocumentation: a própria interface Rte*Labels precisa de documentação', () => {
  const labels = rep(
    '// @public (undocumented)\nexport interface RteDialogLabels {\n    // (undocumented)\n    title: string;\n}',
  );
  const errs = checkDocumentation(labels, 'x.api.md');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /RteDialogLabels/);
});

test('checkDocumentation: static ɵ gerados pelo compilador do Angular não exigem JSDoc', () => {
  const ng = rep(
    '// @public\nexport class RteToc {\n    // (undocumented)\n    static ɵcmp: i0.ɵɵComponentDeclaration<RteToc, "rte-toc", never, {}, {}, never, never, true, never>;\n    // (undocumented)\n    static ɵfac: i0.ɵɵFactoryDeclaration<RteToc, never>;\n}',
  );
  assert.deepEqual(checkDocumentation(ng, 'x.api.md'), []);
});

test('checkDocumentation: relatório sem @packageDocumentation reprova; com ele passa', () => {
  const without = rep('// @public\nexport function f(): void;', {
    packageDoc: false,
  });
  const errs = checkDocumentation(without, 'rte-demo.api.md');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /packageDocumentation/);
  assert.deepEqual(
    checkDocumentation(rep('// @public\nexport function f(): void;'), 'x'),
    [],
  );
});

test('main: com checkConventions, entry sem @packageDocumentation e const sem prefixo reprovam', async () => {
  const dir = fixture(files(BASE), EXPORTS);
  const errs = await main(dir, {
    root: dir,
    update: true,
    checkConventions: true,
  });
  assert.ok(
    errs.some((e) => e.includes('packageDocumentation')),
    JSON.stringify(errs),
  );
});

test('main: com checkConventions e entries documentados e com prefixo passa', async () => {
  const dir = fixture(
    files({
      './dist/index.d.ts':
        '/**\n * Entry de teste.\n * @packageDocumentation\n */\n/** Documentada. */\nexport declare function f(): void;\n',
      './dist/html/index.d.ts':
        '/**\n * Entry html.\n * @packageDocumentation\n */\n/** Documentada. */\nexport declare const RTE_H: 1;\n',
    }),
    EXPORTS,
  );
  assert.deepEqual(
    await main(dir, { root: dir, update: true, checkConventions: true }),
    [],
  );
});

test('sourceEntryFile e extractPackageDoc: convenção <pacote>[/<sub>]/src/index.ts', () => {
  assert.equal(sourceEntryFile('p', '.'), join('p', 'src', 'index.ts'));
  assert.equal(
    sourceEntryFile('p', './html'),
    join('p', 'html', 'src', 'index.ts'),
  );
  const src = '/**\r\n * Frase.\r\n *\r\n * @packageDocumentation\r\n */\r\n\r\nexport {};\r\n';
  assert.match(extractPackageDoc(src), /^\/\*\*\n \* Frase\./);
  assert.equal(extractPackageDoc('/** só item */\nexport {};'), null);
});

test('main: o @packageDocumentation vem do fonte do entry quando o .d.ts empacotado o perde', async () => {
  const doc = (t) => `/**\n * ${t}\n *\n * @packageDocumentation\n */\n\nexport {};\n`;
  const dir = fixture(
    files({
      './dist/index.d.ts': '/** Documentada. */\nexport declare function f(): void;\n',
      './dist/html/index.d.ts': '/** Documentada. */\nexport declare const RTE_H: 1;\n',
      './src/index.ts': doc('Entry de teste.'),
      './html/src/index.ts': doc('Entry html.'),
    }),
    EXPORTS,
  );
  assert.deepEqual(
    await main(dir, { root: dir, update: true, checkConventions: true }),
    [],
  );
  assert.equal(existsSync(join(dir, 'dist', 'index.pkgdoc.d.ts')), false);
  // sem o comentário no fonte, o entry reprova
  writeFileSync(join(dir, 'html', 'src', 'index.ts'), 'export {};\n');
  const errs = await main(dir, { root: dir, update: true, checkConventions: true });
  assert.equal(errs.length, 1, JSON.stringify(errs));
  assert.match(errs[0], /rte-demo-html\.api\.md/);
});
