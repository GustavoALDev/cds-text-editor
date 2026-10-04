import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNotices } from './generate-notices.mjs';

const lockOf = (packages) => ({
  lockfileVersion: 3,
  packages: { '': { name: 'root' }, ...packages },
});
const noText = () => undefined;

test('empty production set yields a meaningful markdown', () => {
  const out = generateNotices(
    lockOf({
      'packages/core': { dependencies: {} },
      'node_modules/d': { version: '1.0.0', license: 'MIT', dev: true },
    }),
    noText,
  );
  assert.match(out, /^# Avisos de terceiros/);
  assert.match(
    out,
    /Nenhuma dependência de produção de terceiros no momento\./,
  );
});

test('only the transitive closure of workspace production dependencies is listed', () => {
  const out = generateNotices(
    lockOf({
      'packages/core': {
        name: '@cds/rte-core',
        dependencies: { htmlparser2: '^12.0.0' },
        peerDependencies: { '@tiptap/core': '^3.0.0' },
      },
      'node_modules/@cds/rte-core': { resolved: 'packages/core', link: true },
      'node_modules/htmlparser2': {
        version: '12.0.0',
        license: 'MIT',
        dependencies: { entities: '^8.0.0' },
      },
      'node_modules/entities': { version: '8.0.0', license: 'BSD-2-Clause' },
      // peer marcado como não-dev no lockfile: não é dependência de produção
      'node_modules/@tiptap/core': { version: '3.0.0', license: 'MIT' },
      'node_modules/vitest': { version: '4.0.0', license: 'MIT', dev: true },
    }),
    (key) => `texto de ${key}`,
  );
  assert.match(out, /^# Avisos de terceiros\n\n/);
  assert.match(out, /## htmlparser2@12\.0\.0\n\nLicença: MIT/);
  assert.match(out, /texto de node_modules\/htmlparser2/);
  assert.match(out, /## entities@8\.0\.0\n\nLicença: BSD-2-Clause/);
  assert.doesNotMatch(out, /tiptap/);
  assert.doesNotMatch(out, /vitest/);
  assert.doesNotMatch(out, /rte-core/);
});

test('nested versions resolve before hoisted ones', () => {
  const out = generateNotices(
    lockOf({
      'packages/core': { dependencies: { a: '*' } },
      'node_modules/a': {
        version: '1.0.0',
        license: 'MIT',
        dependencies: { b: '*' },
      },
      'node_modules/b': { version: '1.0.0', license: 'MIT' },
      'node_modules/a/node_modules/b': { version: '2.0.0', license: 'ISC' },
    }),
    noText,
  );
  assert.match(out, /## b@2\.0\.0/);
  assert.doesNotMatch(out, /## b@1\.0\.0/);
});

test('workspace-nested dependencies and missing entries are handled', () => {
  const out = generateNotices(
    lockOf({
      'packages/core': { dependencies: { a: '*', ausente: '*' } },
      'packages/core/node_modules/a': { version: '1.0.0', license: 'ISC' },
    }),
    noText,
  );
  assert.match(out, /## a@1\.0\.0/);
  assert.match(out, /texto da licença não encontrado/);
});

test('output is sorted and deterministic regardless of lockfile order', () => {
  const a = { version: '1.0.0', license: 'MIT' };
  const ws = { 'packages/x': { dependencies: { z: '*', b: '*' } } };
  const one = generateNotices(
    lockOf({ ...ws, 'node_modules/z': a, 'node_modules/b': a }),
    noText,
  );
  const two = generateNotices(
    lockOf({ 'node_modules/b': a, 'node_modules/z': a, ...ws }),
    noText,
  );
  assert.equal(one, two);
  assert.ok(one.indexOf('## b@') < one.indexOf('## z@'));
});

test('invalid lockfile fails closed', () => {
  assert.throws(() => generateNotices({}, noText), /lockfile inválido/);
});

const lucide = {
  name: 'lucide',
  version: '1.52.0',
  license: 'ISC',
  source: 'https://lucide.dev',
  files: ['packages/angular/src/toolbar/icons.ts'],
  licenseText:
    'ISC License\r\n\r\nCopyright (c) Lucide Icons and Contributors\r\n',
};

test('embedded code gets its own section after the dependencies', () => {
  const out = generateNotices(
    lockOf({
      'packages/core': { dependencies: { a: '*' } },
      'node_modules/a': { version: '1.0.0', license: 'MIT' },
    }),
    noText,
    [lucide],
  );
  assert.match(out, /## a@1\.0\.0/);
  assert.match(
    out,
    /## Código incorporado\n\n### lucide@1\.52\.0\n\nLicença: ISC/,
  );
  assert.match(out, /Origem: https:\/\/lucide\.dev/);
  assert.match(out, /Arquivos: `packages\/angular\/src\/toolbar\/icons\.ts`/);
  assert.match(out, /```text\nISC License\n\nCopyright/);
  assert.ok(out.indexOf('## a@') < out.indexOf('## Código incorporado'));
});

test('embedded code without production dependencies does not use the empty text', () => {
  const out = generateNotices(
    lockOf({ 'packages/core': { dependencies: {} } }),
    noText,
    [lucide],
  );
  assert.doesNotMatch(out, /Nenhuma dependência de produção/);
  assert.match(out, /^# Avisos de terceiros\n\n## Código incorporado/);
  assert.match(out, /### lucide@1\.52\.0/);
  assert.match(out, /ISC/);
});
