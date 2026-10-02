import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkForbiddenNames, checkLicenses, isAllowed, nameOf } from './check-licenses.mjs';

const lock = (names, extra = {}) => ({
  packages: Object.fromEntries(names.map((n) => [`node_modules/${n}`, { version: '1.0.0', ...extra }])),
});

test('rejects @tiptap-pro and @tiptap-cloud anywhere in the lockfile', () => {
  const errors = checkForbiddenNames(lock(['@tiptap-pro/extension-ai', 'foo/node_modules/@tiptap-cloud/provider']));
  assert.equal(errors.length, 2);
});

test('forbidden names are flagged even for dev-only entries', () => {
  assert.equal(checkForbiddenNames(lock(['@tiptap-pro/x'], { dev: true })).length, 1);
});

test('accepts a clean lockfile for forbidden names', () => {
  assert.deepEqual(checkForbiddenNames(lock(['@tiptap/core', 'foo'])), []);
});

test('rejects a license outside the allowlist', () => {
  const errors = checkLicenses(lock(['good', 'bad']), (n) => (n === 'good' ? 'MIT' : 'GPL-3.0'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^bad:/);
});

test('accepts allowlisted licenses, including OR expressions of allowed ones', () => {
  assert.deepEqual(checkLicenses(lock(['a', 'b']), (n) => (n === 'a' ? '(MIT OR Apache-2.0)' : 'BSD-3-Clause')), []);
});

test('ignores dev-only packages with a bad license', () => {
  const l = {
    packages: {
      'node_modules/tool': { dev: true },
      'node_modules/opt': { devOptional: true },
      'node_modules/shipped': {},
    },
  };
  const errors = checkLicenses(l, (n) => (n === 'shipped' ? 'MIT' : '0BSD'));
  assert.deepEqual(errors, []);
});

test('rejects a production package with a bad license', () => {
  const errors = checkLicenses({ packages: { 'node_modules/shipped': {} } }, () => '0BSD');
  assert.equal(errors.length, 1);
});

test('reports a missing license field', () => {
  const errors = checkLicenses(lock(['mystery']), () => undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /desconhecida/);
});

test('isAllowed handles OR, AND and parentheses', () => {
  assert.equal(isAllowed('(MIT OR Apache-2.0)'), true);
  assert.equal(isAllowed('(GPL-3.0 OR LGPL-2.1)'), false);
  assert.equal(isAllowed('MIT OR GPL-3.0'), true);
  assert.equal(isAllowed('MIT AND GPL-3.0'), false);
  assert.equal(isAllowed('MIT AND ISC'), true);
  assert.equal(isAllowed('(MIT AND GPL-3.0) OR ISC'), true);
  assert.equal(isAllowed('GPL-3.0 OR MIT AND ISC'), true);
  assert.equal(isAllowed('MIT AND (GPL-3.0 OR ISC)'), true);
  assert.equal(isAllowed('MIT AND (GPL-3.0 OR LGPL-2.1)'), false);
  assert.equal(isAllowed('MIT WITH Classpath-exception-2.0'), false);
  assert.equal(isAllowed(''), false);
  assert.equal(isAllowed('(MIT'), false);
});

test('nameOf maps scoped and nested lockfile keys to the package name', () => {
  assert.equal(nameOf('node_modules/@scope/name'), '@scope/name');
  assert.equal(nameOf('node_modules/a/node_modules/b'), 'b');
  assert.equal(nameOf('node_modules/a/node_modules/@s/b'), '@s/b');
});

test('nested and scoped keys are checked with the right name', () => {
  const l = { packages: { 'node_modules/a/node_modules/b': {}, 'node_modules/@s/c': {} } };
  const seen = [];
  checkLicenses(l, (n) => (seen.push(n), 'MIT'));
  assert.deepEqual(seen, ['b', '@s/c']);
});

test('workspace-internal packages and links are not flagged', () => {
  const l = {
    packages: {
      '': { name: 'root' },
      'packages/core': { name: '@cds/core', version: '0.0.0' },
      'node_modules/@cds/core': { resolved: 'packages/core', link: true },
    },
  };
  assert.deepEqual(checkLicenses(l, () => undefined), []);
});

test('default license lookup reads the lockfile entry', () => {
  const l = { packages: { 'node_modules/a': { license: 'MIT' }, 'node_modules/b': { license: 'GPL-3.0' } } };
  assert.equal(checkLicenses(l).length, 1);
});
