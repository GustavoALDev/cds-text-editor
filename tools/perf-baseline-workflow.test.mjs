import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Enquanto o PR da 08b está aberto, o workflow tem o gatilho `push` temporário (ADR 0021);
// a tarefa 6 vira esta constante para false e remove o gatilho.
const BOOTSTRAP = true;

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const wf = read('.github/workflows/perf-baseline.yml');

test('workflow_dispatch com as entradas branch e reason', () => {
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /\n {6}branch:\n/);
  assert.match(wf, /\n {6}reason:\n/);
});

test('a guarda recusa main e os protegidos', () => {
  assert.match(wf, /case "\$BRANCH" in\n\s+main\|/);
  assert.match(wf, /exit 1/);
});

test('branch e motivo chegam por env, nunca interpolados no script', () => {
  const runs = wf.split('\n').filter((l) => /^\s+run:/.test(l));
  assert.ok(!runs.some((l) => l.includes('${{')));
  assert.match(
    wf,
    /TARGET_BRANCH: \$\{\{ inputs\.branch \|\| github\.ref_name \}\}/,
  );
});

test('mesmo tipo de máquina do verify; 10 execuções por motor com 1 worker', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(wf, /runs-on: ubuntu-latest/);
  assert.match(ci, /runs-on: ubuntu-latest/);
  assert.match(wf, /for engine in chromium firefox webkit/);
  assert.match(wf, /seq 10/);
  assert.match(wf, /--workers=1/);
  assert.match(wf, /editor-perf-budget\.spec\.ts/);
  assert.match(wf, /node tools\/perf-gate\.mjs baseline perf-runs/);
});

test('comita a baseline com a mensagem do plano', () => {
  assert.match(
    wf,
    /git commit -m "test\(perf\): atualiza baseline do N45 \(\$REASON\)"/,
  );
  assert.match(wf, /e2e\/perf\/baseline\.linux\.json/);
});

test('o ci.yml roda o perf-gate antes do resumo de qualidade', () => {
  const ci = read('.github/workflows/ci.yml');
  const gate = ci.indexOf('node tools/perf-gate.mjs');
  const summary = ci.indexOf('node tools/quality-summary.mjs\n');
  assert.ok(gate > 0 && summary > gate);
  assert.ok(!/quality-summary\.mjs\s*\|\|\s*true/.test(ci));
});

test('gatilho push temporário só em branches de trabalho (nunca main)', () => {
  const push = /\n {2}push:\n {4}branches:\n((?: {6}- .*\n)+)/.exec(wf);
  if (!BOOTSTRAP) {
    assert.equal(push, null, 'estado de release sem gatilho push');
    return;
  }
  assert.ok(push);
  assert.ok(!/\bmain\b/.test(push[1].replace(/spec-08b/, '')));
});
