import assert from 'node:assert/strict';
import {
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
  checkReportSet,
  listEntries,
  main,
  reportFileName,
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
