import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBranchProtection,
  jobIds,
  producedChecks,
  readRepo,
} from './branch-protection.mjs';
import { resolveLegs } from './compat.mjs';

// Nome da perna do PR, como o `compat.mjs legs --set pr` o produz (o GitHub antepõe o job chamador).
const PR_LEG = resolveLegs({
  floors: { angular: '22.2.1', tiptap: '3.31.4' },
  view: (pkg) => (pkg.startsWith('@angular') ? '22.2.1' : '3.31.4'),
  compatJson: { cap: {}, skip: [] },
  set: 'pr',
}).legs[0].name;

const CI = `name: CI
jobs:
  compat:
    uses: ./.github/workflows/compat.yml
  verify:
    runs-on: x
  demo:
    runs-on: x
`;
const COMPAT = `name: Compat
jobs:
  legs:
    runs-on: x
  compat:
    runs-on: x
`;
const GOOD = {
  required_status_checks: {
    strict: true,
    contexts: ['verify', 'demo', 'compat / compat (latest×latest)'],
  },
  enforce_admins: true,
};

test('a perna do PR se chama compat (latest×latest)', () => {
  assert.equal(PR_LEG, 'compat (latest×latest)');
});

test('jobIds lê só as chaves de jobs', () => {
  assert.deepEqual(jobIds(CI), ['compat', 'verify', 'demo']);
});

test('producedChecks antepõe o job chamador ao nome da perna', () => {
  assert.ok(
    producedChecks({ ci: CI, compat: COMPAT, prLegName: PR_LEG }).has(
      'compat / compat (latest×latest)',
    ),
  );
});

test('configuração válida passa', () => {
  assert.deepEqual(
    checkBranchProtection({
      protection: GOOD,
      ci: CI,
      compat: COMPAT,
      prLegName: PR_LEG,
    }),
    [],
  );
});

test('check inexistente, enforce_admins e strict faltando reprovam em pt-BR', () => {
  const errors = checkBranchProtection({
    protection: {
      required_status_checks: { strict: false, contexts: ['verify', 'nada'] },
      enforce_admins: false,
    },
    ci: CI,
    compat: COMPAT,
    prLegName: PR_LEG,
  });
  assert.equal(errors.length, 3);
  assert.match(errors.join('\n'), /"nada" não existe nos workflows/);
  assert.match(errors.join('\n'), /enforce_admins/);
  assert.match(errors.join('\n'), /strict/);
});

test('o branch-protection.json do repositório bate com os workflows reais', () => {
  const repo = readRepo();
  assert.deepEqual(checkBranchProtection({ ...repo, prLegName: PR_LEG }), []);
  for (const name of ['verify', 'demo', 'docs']) {
    assert.ok(repo.protection.required_status_checks.contexts.includes(name));
  }
});
