import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Portão de desempenho do N45 (spec 08b, O12): compara a mediana de cada volta alternada com a
// baseline do CI Linux (`e2e/perf/baseline.linux.json`). Só métricas com CV <= 3% entram na regra;
// reprova com >10% e diferença >= 2 ms nas DUAS voltas. Motor (versão major) ou CPU diferente da
// baseline torna a comparação informativa. Sem baseline: informativo. Também agrega a baseline
// (`baseline <pasta>`), usada pelo workflow `perf-baseline.yml`.

export const CV_LIMIT = 3;
export const RATIO = 0.1;
export const MIN_DELTA_MS = 2;

const sorted = (xs) => [...xs].sort((a, b) => a - b);

export function median(xs) {
  const s = sorted(xs);
  if (!s.length) return Number.NaN;
  const mid = s.length >> 1;
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function p95(xs) {
  const s = sorted(xs);
  return s[Math.ceil(0.95 * s.length) - 1] ?? Number.NaN;
}

/** Coeficiente de variação em % (desvio padrão amostral / média). */
export function cv(xs) {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean === 0) return 0;
  const variance =
    xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1);
  return (Math.sqrt(variance) / mean) * 100;
}

/** A estatística da métrica sai do sufixo do nome (`... p95` ou `... mediana`). */
export function statOf(metric, samples) {
  return metric.endsWith(' p95') ? p95(samples) : median(samples);
}

const major = (v) => String(v ?? '').split('.')[0];
const f = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-');

/**
 * `baseline`: `{ browsers, cpu, metrics: { motor: { metrica: { median, cv } } } }`.
 * `current`: `{ browsers, cpu, metrics: { motor: { metrica: { A, B } } } }` (valor de cada volta).
 * Devolve `{ failures, warnings, info }` (mensagens em pt-BR).
 */
export function compare(baseline, current) {
  const failures = [];
  const warnings = [];
  const info = [];
  if (!baseline?.metrics) {
    info.push(
      'Baseline de desempenho ausente (e2e/perf/baseline.linux.json): comparação informativa, nada reprova.',
    );
    return { failures, warnings, info };
  }
  const cpuChanged =
    baseline.cpu && current.cpu && baseline.cpu !== current.cpu;
  if (cpuChanged) {
    warnings.push(
      `Modelo de CPU diferente da baseline ("${baseline.cpu}" -> "${current.cpu}"): comparação informativa; regenere a baseline com perf-baseline.yml.`,
    );
  }
  for (const [motor, metrics] of Object.entries(current.metrics ?? {})) {
    const base = baseline.metrics[motor];
    if (!base) {
      info.push(`${motor}: sem baseline para este motor.`);
      continue;
    }
    const engineChanged =
      major(baseline.browsers?.[motor]) !== major(current.browsers?.[motor]);
    if (engineChanged) {
      warnings.push(
        `${motor}: versão major do motor diferente da baseline (${baseline.browsers?.[motor] ?? '?'} -> ${current.browsers?.[motor] ?? '?'}): comparação informativa.`,
      );
    }
    const informative = cpuChanged || engineChanged;
    for (const [metric, volta] of Object.entries(metrics)) {
      const ref = base[metric];
      if (!ref) {
        info.push(`${motor} / ${metric}: sem baseline.`);
        continue;
      }
      if (ref.cv > CV_LIMIT) {
        info.push(
          `${motor} / ${metric}: fora da regra dos 10% (CV da baseline ${f(ref.cv)}% > ${CV_LIMIT}%).`,
        );
        continue;
      }
      const deltas = [volta.A, volta.B].map((v) => v - ref.median);
      const worse = deltas.every(
        (d) => d >= MIN_DELTA_MS && d > ref.median * RATIO,
      );
      const better = deltas.every(
        (d) => -d >= MIN_DELTA_MS && -d > ref.median * RATIO,
      );
      const detail = `base ${f(ref.median)} ms, atual ${f(volta.A)} / ${f(volta.B)} ms (Δ ${deltas.map((d) => (d >= 0 ? '+' : '') + f(d)).join(' / ')} ms)`;
      if (worse) {
        const msg = `${motor} / ${metric}: regressão de mais de 10% nas duas voltas: ${detail}.`;
        (informative ? warnings : failures).push(msg);
      } else if (better) {
        warnings.push(
          `${motor} / ${metric}: melhora de mais de 10% nas duas voltas: ${detail}; considere atualizar a baseline.`,
        );
      }
    }
  }
  return { failures, warnings, info };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Valor de cada volta de um arquivo `n45-<motor>.json` (campo `samples`). */
export function roundValues(file) {
  const out = {};
  for (const [metric, rounds] of Object.entries(file?.samples ?? {})) {
    out[metric] = {
      A: statOf(metric, rounds.A ?? []),
      B: statOf(metric, rounds.B ?? []),
    };
  }
  return out;
}

/** Carrega o estado atual de `<dir>/n45-<motor>.json`. */
export function loadCurrent(dir) {
  const current = { browsers: {}, cpu: undefined, metrics: {} };
  if (!existsSync(dir)) return current;
  for (const name of readdirSync(dir).sort()) {
    const m = /^n45-([a-z]+)\.json$/.exec(name);
    if (!m) continue;
    const file = readJson(join(dir, name));
    if (!file) continue;
    current.metrics[m[1]] = roundValues(file);
    if (file.browserVersion) current.browsers[m[1]] = file.browserVersion;
    current.cpu ??= file.cpu;
  }
  return current;
}

/**
 * Agrega N execuções: `<dir>/<motor>/*.json` (cada um um `n45-<motor>.json`). A mediana e o CV de
 * cada métrica saem dos valores de todas as voltas de todas as execuções.
 */
export function aggregate(dir, meta = {}) {
  const metrics = {};
  const browsers = {};
  let cpu;
  for (const motor of readdirSync(dir).sort()) {
    const sub = join(dir, motor);
    if (!existsSync(sub) || !readdirSync(sub).length) continue;
    const values = {};
    for (const name of readdirSync(sub).sort()) {
      if (!name.endsWith('.json')) continue;
      const file = readJson(join(sub, name));
      if (!file) continue;
      if (file.browserVersion) browsers[motor] = file.browserVersion;
      cpu ??= file.cpu;
      for (const [metric, v] of Object.entries(roundValues(file))) {
        (values[metric] ??= []).push(v.A, v.B);
      }
    }
    metrics[motor] = Object.fromEntries(
      Object.entries(values).map(([k, xs]) => [
        k,
        {
          median: Number(median(xs).toFixed(3)),
          cv: Number(cv(xs).toFixed(2)),
          runs: xs.length / 2,
        },
      ]),
    );
  }
  return {
    playwright: meta.playwright,
    browsers,
    cpu: meta.cpu ?? cpu,
    date: meta.date ?? new Date().toISOString().slice(0, 10),
    metrics,
  };
}

export function renderSummary({ failures, warnings, info }) {
  const list = (title, xs, mark) =>
    xs.length
      ? `**${title}**\n\n${xs.map((x) => `- ${mark} ${x}`.replace('-  ', '- ')).join('\n')}\n`
      : '';
  const body = [
    list('Reprovações', failures, 'FALHA:'),
    list('Avisos', warnings, 'AVISO:'),
    list('Informativo', info, ''),
  ]
    .filter(Boolean)
    .join('\n');
  return `## Desempenho (perf-gate, regra dos 10%)\n\n${body || '_dentro da baseline_\n'}\n`;
}

function option(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'baseline') {
    const dir = argv[1];
    if (!dir) {
      console.error(
        'uso: node tools/perf-gate.mjs baseline <pasta> [--out arquivo] [--playwright versão] [--cpu modelo]',
      );
      process.exit(2);
    }
    const out = option(argv, '--out', 'e2e/perf/baseline.linux.json');
    const result = aggregate(dir, {
      playwright: option(argv, '--playwright'),
      cpu: option(argv, '--cpu'),
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`baseline gravada em ${out}`);
    return;
  }
  const baseline = readJson(
    option(argv, '--baseline', 'e2e/perf/baseline.linux.json'),
  );
  const current = loadCurrent(option(argv, '--perf', 'e2e/test-results/perf'));
  const result = compare(baseline, current);
  const md = renderSummary(result);
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, md);
  else process.stdout.write(md);
  for (const w of result.warnings) console.log(`::warning::${w}`);
  for (const e of result.failures) console.log(`::error::${e}`);
  if (result.failures.length) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
