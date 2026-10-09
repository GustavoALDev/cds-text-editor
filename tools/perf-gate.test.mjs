import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  aggregate,
  compare,
  cv,
  loadCurrent,
  median,
  p95,
} from './perf-gate.mjs';

const baseline = (over = {}) => ({
  browsers: { chromium: '149.0.1' },
  cpu: 'CPU X',
  metrics: {
    chromium: {
      estavel: { median: 20, cv: 1.5 },
      ruidosa: { median: 20, cv: 5 },
      pequena: { median: 2, cv: 1 },
    },
  },
  ...over,
});
const current = (metrics, over = {}) => ({
  browsers: { chromium: '149.0.2' },
  cpu: 'CPU X',
  metrics: { chromium: metrics },
  ...over,
});

test('+11% e >= 2 ms nas duas voltas reprova, com métrica, motor, base e atual', () => {
  const r = compare(baseline(), current({ estavel: { A: 22.5, B: 23 } }), {
    enforce: true,
  });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /chromium \/ estavel/);
  assert.match(r.failures[0], /base 20\.0 ms, atual 22\.5 \/ 23\.0 ms/);
});

test('por padrão a regressão é só aviso (não reprova)', () => {
  const r = compare(baseline(), current({ estavel: { A: 22.5, B: 23 } }));
  assert.deepEqual(r.failures, []);
  assert.match(r.warnings.join(' | '), /chromium \/ estavel: regressão/);
});

test('o limite é max(10%, 3·CV): CV maior (2,9%) não passa de 10%, mas o fator vale', () => {
  const b = baseline();
  b.metrics.chromium.estavel.cv = 2.9;
  // limite = 20 * max(0,10, 0,087) = 2 ms; +2,5 ms nas duas voltas passa o limite
  const r = compare(b, current({ estavel: { A: 22.5, B: 22.5 } }), {
    enforce: true,
  });
  assert.equal(r.failures.length, 1);
  assert.deepEqual(
    compare(b, current({ estavel: { A: 21.9, B: 21.9 } }), { enforce: true })
      .failures,
    [],
  );
});

test('só numa volta não reprova', () => {
  const r = compare(baseline(), current({ estavel: { A: 25, B: 20 } }));
  assert.deepEqual(r.failures, []);
});

test('diferença < 2 ms não reprova mesmo com +50%', () => {
  const r = compare(baseline(), current({ pequena: { A: 3, B: 3 } }));
  assert.deepEqual(r.failures, []);
});

test('CV > 3% na baseline tira a métrica da regra', () => {
  const r = compare(baseline(), current({ ruidosa: { A: 40, B: 40 } }));
  assert.deepEqual(r.failures, []);
  assert.match(r.info.join('\n'), /ruidosa.*CV da baseline 5\.0%/);
});

test('motor com versão major diferente: informativo com aviso', () => {
  const r = compare(
    baseline(),
    current(
      { estavel: { A: 30, B: 30 } },
      { browsers: { chromium: '150.0.0' } },
    ),
  );
  assert.deepEqual(r.failures, []);
  assert.match(r.warnings.join('\n'), /versão major do motor diferente/);
  assert.match(r.warnings.join('\n'), /regressão/);
});

test('CPU diferente: informativo com aviso', () => {
  const r = compare(
    baseline(),
    current({ estavel: { A: 30, B: 30 } }, { cpu: 'CPU Y' }),
  );
  assert.deepEqual(r.failures, []);
  assert.match(r.warnings[0], /Modelo de CPU diferente/);
});

test('melhora > 10% nas duas voltas avisa para atualizar a baseline', () => {
  const r = compare(baseline(), current({ estavel: { A: 15, B: 16 } }));
  assert.deepEqual(r.failures, []);
  assert.match(r.warnings[0], /atualizar a baseline/);
});

test('baseline ausente: informativo, nunca reprova', () => {
  const r = compare(undefined, current({ estavel: { A: 99, B: 99 } }));
  assert.deepEqual(r.failures, []);
  assert.equal(r.info.length, 1);
});

test('estatísticas', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(p95(Array.from({ length: 20 }, (_, i) => i + 1)), 19);
  assert.equal(cv([10, 10, 10]), 0);
  assert.ok(Math.abs(cv([9, 10, 11]) - 10) < 1e-9);
});

function runFile(dir, name, value, version = '149.0.1') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, name),
    JSON.stringify({
      browser: 'chromium',
      browserVersion: version,
      cpu: 'CPU X',
      entries: {},
      samples: {
        'completo frio +render p95': { A: [1, value], B: [1, value] },
        'criação mediana': { A: [value], B: [value] },
      },
    }),
  );
}

test('aggregate e loadCurrent leem as amostras por volta', () => {
  const root = mkdtempSync(join(tmpdir(), 'perf-'));
  for (let i = 0; i < 4; i++) {
    runFile(join(root, 'chromium'), `n45-chromium-${i}.json`, 10 + i);
  }
  const agg = aggregate(root, { playwright: '1.63.0', date: '2026-10-08' });
  assert.equal(agg.browsers.chromium, '149.0.1');
  assert.equal(agg.cpu, 'CPU X');
  const m = agg.metrics.chromium['criação mediana'];
  assert.equal(m.median, 11.5);
  assert.equal(m.runs, 4);
  assert.ok(m.cv > 0);

  const dir = join(root, 'atual');
  runFile(dir, 'n45-chromium.json', 12);
  const cur = loadCurrent(dir);
  assert.deepEqual(cur.metrics.chromium['completo frio +render p95'], {
    A: 12,
    B: 12,
  });
});

test('CLI sem baseline: informativo, código 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'perf-cli-'));
  runFile(join(root, 'p'), 'n45-chromium.json', 50);
  // No CI o resumo vai para o GITHUB_STEP_SUMMARY; sem ele, sai no stdout.
  const env = { ...process.env };
  delete env.GITHUB_STEP_SUMMARY;
  const r = spawnSync(
    process.execPath,
    [
      'tools/perf-gate.mjs',
      '--baseline',
      join(root, 'nao-existe.json'),
      '--perf',
      join(root, 'p'),
    ],
    { encoding: 'utf8', env },
  );
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Baseline de desempenho ausente/);
});

test('CLI com regressão nas duas voltas: aviso (0) e, com RTE_PERF_GATE_ENFORCE=1, código 1', () => {
  const root = mkdtempSync(join(tmpdir(), 'perf-cli-'));
  runFile(join(root, 'p'), 'n45-chromium.json', 50);
  const base = join(root, 'b.json');
  writeFileSync(
    base,
    JSON.stringify({
      browsers: { chromium: '149.0.1' },
      cpu: 'CPU X',
      metrics: { chromium: { 'criação mediana': { median: 20, cv: 1 } } },
    }),
  );
  const args = [
    'tools/perf-gate.mjs',
    '--baseline',
    base,
    '--perf',
    join(root, 'p'),
  ];
  const env = { ...process.env };
  delete env.RTE_PERF_GATE_ENFORCE;
  const soft = spawnSync(process.execPath, args, { encoding: 'utf8', env });
  assert.equal(soft.status, 0);
  assert.match(soft.stdout, /::warning::.*regressão/);
  const r = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: { ...env, RTE_PERF_GATE_ENFORCE: '1' },
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /regressão/);
});
