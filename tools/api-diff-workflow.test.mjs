import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O passo do api-diff (spec 09c, AP9) só roda em PR, depois de um checkout com histórico completo,
// e a base chega por `env` (nunca interpolada no script).
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const wf = read('.github/workflows/ci.yml');
const verify = wf.slice(wf.indexOf('\n  verify:'));
const step = verify.slice(verify.indexOf('- name: Guarda de mudança de API'));

test('api-diff roda só em pull_request', () => {
  assert.ok(step.length > 0, 'passo ausente');
  assert.match(step, /if: github\.event_name == 'pull_request'/);
});

test('a base vem de github.base_ref por env, não interpolada no run', () => {
  const run = /\n\s+run: (.*)\n/.exec(step)[1];
  assert.ok(!run.includes('${{'));
  assert.match(step, /BASE_REF: \$\{\{ github\.base_ref \}\}/);
  assert.match(run, /api-diff -- --base "origin\/\$BASE_REF"/);
});

test('o job tem fetch-depth 0 antes do passo', () => {
  const head = verify.slice(
    0,
    verify.indexOf('- name: Guarda de mudança de API'),
  );
  assert.match(head, /fetch-depth: 0/);
});

test('o script api-diff existe no package.json', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['api-diff'], 'node tools/api-diff.mjs');
});

test('release-plan cria o main local antes de rodar (checkout de PR é detached)', () => {
  const iBranch = verify.indexOf('git branch main origin/main');
  const iPlan = verify.indexOf('run: npm run release-plan');
  assert.ok(iBranch > 0, 'passo que cria o main local ausente');
  assert.ok(iBranch < iPlan, 'o main local deve vir antes do release-plan');
  assert.match(verify, /git show-ref --verify --quiet refs\/heads\/main/);
  assert.ok(!verify.includes('--since=origin/main'));
});
