import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { runBodies } from './workflow-writers.mjs';

// Estado de release: sem o gatilho `push` temporário de bootstrap (ADR 0021). Se alguém o recolocar, a
// constante precisa virar true de propósito.
const BOOTSTRAP = false;
const perf = readFileSync('.github/workflows/perf-baseline.yml', 'utf8').replace(/\r\n/g, '\n');

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
  assert.match(update, /case "\$BRANCH" in\n\s+main\|/);
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

test('contents: write só neste workflow, no perf-baseline.yml e no release.yml', () => {
  const dir = '.github/workflows';
  const writers = readdirSync(dir)
    .filter((f) => f.endsWith('.yml'))
    .filter((f) => /contents:\s*write/.test(read(`${dir}/${f}`)))
    .sort();
  assert.deepEqual(writers, ['perf-baseline.yml', 'release.yml', 'visual-update.yml']);
});

test('regrava só o que mudou, remove órfãs à parte, comita e sobe o artefato', () => {
  assert.ok(!update.includes('rm -rf'), 'não apaga as capturas antes de regerar');
  assert.ok(!update.includes('--update-snapshots=all'));
  const run = update.indexOf('--update-snapshots=changed');
  const prune = update.indexOf('node tools/visual.mjs prune');
  const commit = update.indexOf('git commit -m');
  assert.ok(run > 0 && prune > run && commit > prune);
  assert.match(update, /RTE_VISUAL_USED:/);
  assert.match(
    update,
    /git commit -m "test\(visual\): atualiza capturas \(\$REASON\)"/,
  );
  assert.match(update, /upload-artifact@v4/);
  assert.match(update, /playwright:v\d+\.\d+\.\d+-noble/);
});

test('registra o CPU no log do job', () => {
  assert.match(update, /grep -m1 'model name' \/proc\/cpuinfo/);
  assert.match(update, /avx512/);
});

for (const [nome, yaml] of [
  ['visual-update.yml', update],
  ['perf-baseline.yml', perf],
]) {
  test(`${nome}: nenhum ${{ }} dentro de run:`, () => {
    const bodies = runBodies(yaml);
    assert.ok(bodies.length > 3);
    for (const { line, body } of bodies) {
      assert.ok(!body.includes('${{'), `run: da linha ${line} interpola expressão`);
    }
  });

  test(`${nome}: checkout sem persistir credenciais e token só no passo de commit`, () => {
    assert.match(
      yaml,
      /actions\/checkout@v4\n\s+with:\n\s+ref: .*\n\s+persist-credentials: false/,
    );
    const token = [...yaml.matchAll(/github\.token/g)];
    assert.equal(token.length, 1, 'github.token aparece uma vez');
    const commit = yaml.indexOf('- name: Commit d');
    assert.ok(commit > 0 && token[0].index > commit);
    assert.match(yaml, /http\.extraheader/);
  });

  test(`${nome}: guarda normaliza refs/heads e o branch padrão; push com 3 tentativas`, () => {
    assert.match(yaml, /BRANCH="\$\{TARGET_BRANCH#refs\/heads\/\}"/);
    assert.match(
      yaml,
      /DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}/,
    );
    assert.match(yaml, /"\$BRANCH" = "\$DEFAULT_BRANCH"/);
    assert.match(yaml, /for attempt in 1 2 3/);
    assert.match(yaml, /pull --rebase origin "\$BRANCH"/);
    assert.match(yaml, /HEAD:refs\/heads\/\$BRANCH/);
  });
}

test('visual-chromium e visual-demo-chromium desligam as otimizações de runtime do Skia', () => {
  for (const f of [
    'e2e/visual/playwright.config.ts',
    'apps/demo/e2e/visual/playwright.config.ts',
  ]) {
    assert.match(read(f), /--disable-skia-runtime-opts/);
  }
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
