import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Enquanto o PR da 08b está aberto, o workflow tem o gatilho `push` temporário (ADR 0021);
// a tarefa 6 vira esta constante para false e remove o gatilho.
const BOOTSTRAP = true;

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const update = read('.github/workflows/visual-update.yml');

test('workflow_dispatch com as entradas branch e reason', () => {
  assert.match(update, /workflow_dispatch:/);
  assert.match(update, /\n {6}branch:\n/);
  assert.match(update, /\n {6}reason:\n/);
});

test('a guarda recusa main e os protegidos', () => {
  const protection = JSON.parse(read('.github/branch-protection.json'));
  assert.ok(protection.required_status_checks);
  assert.match(update, /case "\$TARGET_BRANCH" in\n\s+main\|/);
  assert.match(update, /exit 1/);
});

test('branch e motivo chegam por env, nunca interpolados no script', () => {
  const runs = update.split('\n').filter((l) => /^\s+run:/.test(l));
  assert.ok(!runs.some((l) => l.includes('${{')));
  assert.match(
    update,
    /TARGET_BRANCH: \$\{\{ inputs\.branch \|\| github\.ref_name \}\}/,
  );
});

test('contents: write só neste workflow e no release.yml', () => {
  const dir = '.github/workflows';
  const writers = readdirSync(dir)
    .filter((f) => f.endsWith('.yml'))
    .filter((f) => /contents:\s*write/.test(read(`${dir}/${f}`)))
    .sort();
  assert.deepEqual(writers, ['release.yml', 'visual-update.yml']);
});

test('apaga as capturas, regrava tudo, comita e sobe o artefato', () => {
  const rm = update.indexOf('rm -rf e2e/visual/__screenshots__');
  const run = update.indexOf('--update-snapshots=all');
  assert.ok(rm > 0 && run > rm);
  assert.match(
    update,
    /git commit -m "test\(visual\): atualiza capturas \(\$REASON\)"/,
  );
  assert.match(update, /upload-artifact@v4/);
  assert.match(update, /playwright:v\d+\.\d+\.\d+-noble/);
});

test('gatilho push temporário só em branches de trabalho (nunca main)', () => {
  const push = /\n {2}push:\n {4}branches:\n((?: {6}- .*\n)+)/.exec(update);
  if (!BOOTSTRAP) {
    assert.equal(push, null, 'estado de release sem gatilho push');
    return;
  }
  assert.ok(push);
  assert.ok(!/\bmain\b/.test(push[1].replace(/spec-08b/, '')));
});
