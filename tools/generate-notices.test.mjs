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

test('non-dev lockfile entry (workspace dependency) gets a notice, dev does not', () => {
  const out = generateNotices(
    lockOf({
      'node_modules/htmlparser2': { version: '12.0.0', license: 'MIT' },
      'node_modules/entities': { version: '8.0.0', license: 'BSD-2-Clause' },
      'node_modules/vitest': { version: '4.0.0', license: 'MIT', dev: true },
      'node_modules/opt': {
        version: '1.0.0',
        license: 'MIT',
        devOptional: true,
      },
    }),
    (key) => `texto de ${key}`,
  );
  assert.match(out, /^# Avisos de terceiros\n\n/);
  assert.match(out, /## htmlparser2@12\.0\.0\n\nLicença: MIT/);
  assert.match(out, /texto de node_modules\/htmlparser2/);
  assert.match(out, /## entities@8\.0\.0\n\nLicença: BSD-2-Clause/);
  assert.doesNotMatch(out, /vitest/);
  assert.doesNotMatch(out, /## opt@/);
});

test('workspace packages and links are skipped; nested paths use the package name', () => {
  const out = generateNotices(
    lockOf({
      'packages/core': { name: '@cds/rte-core', version: '0.0.0' },
      'node_modules/@cds/rte-core': { resolved: 'packages/core', link: true },
      'packages/core/node_modules/a': { version: '1.0.0', license: 'ISC' },
    }),
    noText,
  );
  assert.doesNotMatch(out, /rte-core/);
  assert.match(out, /## a@1\.0\.0/);
  assert.match(out, /texto da licença não encontrado/);
});

test('output is sorted and deterministic regardless of lockfile order', () => {
  const a = { version: '1.0.0', license: 'MIT' };
  const one = generateNotices(
    lockOf({ 'node_modules/z': a, 'node_modules/b': a }),
    noText,
  );
  const two = generateNotices(
    lockOf({ 'node_modules/b': a, 'node_modules/z': a }),
    noText,
  );
  assert.equal(one, two);
  assert.ok(one.indexOf('## b@') < one.indexOf('## z@'));
});

test('invalid lockfile fails closed', () => {
  assert.throws(() => generateNotices({}, noText), /lockfile inválido/);
});
