import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Resumo de qualidade do CI (spec 08a, X10-X12): tamanho x orçamento, cobertura por pacote,
// testes instáveis (passaram só na repetição) e N45 por motor. Informativo: nunca reprova.

const NO_DATA = '_sem dados_';

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function jsonFiles(dir) {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : [];
}

/** Relatórios `--report` do check-size, ordenados por pacote. */
export function loadSizes(dir) {
  return jsonFiles(dir)
    .map((f) => readJson(join(dir, f)))
    .filter((r) => r && Array.isArray(r.scenarios))
    .sort((a, b) => a.package.localeCompare(b.package));
}

/** `{ pacote: total }` a partir de `<dir>/<pacote>/coverage-summary.json`. */
export function loadCoverage(dir) {
  const result = {};
  if (!existsSync(dir)) return result;
  for (const p of readdirSync(dir).sort()) {
    const total = readJson(join(dir, p, 'coverage-summary.json'))?.total;
    if (total) result[p] = total;
  }
  return result;
}

/** Arquivos `n45-<motor>.json` gravados pelo teste de desempenho. */
export function loadPerf(dir) {
  return jsonFiles(dir)
    .filter((f) => f.startsWith('n45-'))
    .map((f) => readJson(join(dir, f)))
    .filter((r) => r && r.entries);
}

/** Testes `flaky` do repórter JSON do Playwright (percorre as suítes aninhadas). */
function flakyTests(report) {
  const found = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.status === 'flaky') {
          found.push({
            file: spec.file ?? suite.file ?? '?',
            line: spec.line,
            title: spec.title,
            project: t.projectName ?? '?',
            attempts: (t.results ?? []).length,
          });
        }
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of report?.suites ?? []) walk(s);
  return found;
}

/** Avisos `::warning` do GitHub Actions, um por teste instável. */
export function flakyWarnings(report, dir = 'e2e') {
  return flakyTests(report).map(
    (t) =>
      `::warning file=${dir}/${t.file}${t.line ? `,line=${t.line}` : ''}::Teste instável (passou só na repetição): ${t.title} [${t.project}]`,
  );
}

const table = (head, rows) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');

const pct = (m) => (m && typeof m.pct === 'number' ? m.pct.toFixed(1) : '-');
const ms = (n) => (typeof n === 'number' ? n.toFixed(1) : '-');

function sizesSection(sizes) {
  if (!sizes?.length) return NO_DATA;
  const rows = sizes.flatMap((r) =>
    r.scenarios.map((s) => [
      r.package,
      s.name,
      s.measured,
      s.budget ?? '-',
      s.margin ?? '-',
    ]),
  );
  return table(
    ['pacote', 'cenário', 'medido (B min+gzip)', 'orçamento (B)', 'folga (B)'],
    rows,
  );
}

function coverageSection(coverage) {
  const names = Object.keys(coverage ?? {});
  if (!names.length) return NO_DATA;
  return table(
    ['pacote', 'linhas %', 'instruções %', 'funções %', 'ramos %'],
    names.map((p) => {
      const c = coverage[p];
      return [
        p,
        pct(c.lines),
        pct(c.statements),
        pct(c.functions),
        pct(c.branches),
      ];
    }),
  );
}

function flakySection(report) {
  if (!report) return NO_DATA;
  const flaky = flakyTests(report);
  if (!flaky.length) return '_nenhum teste instável nesta execução_';
  return table(
    ['arquivo', 'teste', 'motor', 'tentativas'],
    flaky.map((t) => [t.file, t.title, t.project, t.attempts]),
  );
}

function perfSection(perf) {
  if (!perf?.length) return NO_DATA;
  const m = (e, key, name) => e[key]?.metrics?.[name];
  return table(
    [
      'motor',
      'tecla frio p95 (ms)',
      'tecla quente p95 (ms)',
      'criação completa mediana (ms)',
      'busca capada p95 (ms)',
      'INP (ms)',
      'rascunho máx (ms)',
    ],
    perf.map((p) => {
      const e = p.entries;
      return [
        p.browser,
        ms(m(e, 'completo', 'completo frio +render p95')),
        ms(m(e, 'completo', 'completo quente +render p95')),
        ms(m(e, 'completo', 'criação mediana')),
        ms(m(e, 'busca', 'p95')),
        ms(m(e, 'inp', 'inp')),
        ms(m(e, 'rascunho', 'max')),
      ];
    }),
  );
}

/**
 * Markdown do resumo. Cada entrada é opcional (relatório ausente vira "sem dados"):
 * `sizes` (de {@link loadSizes}), `coverage` (de {@link loadCoverage}), `playwrightReport`
 * (JSON do repórter `json`), `perf` (de {@link loadPerf}) e `versions` (`{ pacote: versão }`).
 */
export function buildSummary({
  sizes,
  coverage,
  playwrightReport,
  perf,
  versions,
} = {}) {
  const parts = [
    '## Qualidade',
    `### Tamanho x orçamento\n\n${sizesSection(sizes)}`,
    `### Cobertura por pacote\n\n${coverageSection(coverage)}`,
    `### Testes instáveis (E2E)\n\n${flakySection(playwrightReport)}`,
    `### N45 por motor\n\n${perfSection(perf)}`,
  ];
  if (versions && Object.keys(versions).length) {
    parts.push(
      `### Versões resolvidas\n\n${table(
        ['pacote', 'versão'],
        Object.entries(versions),
      )}`,
    );
  }
  return `${parts.join('\n\n')}\n`;
}

/** Resumo só do visual (spec 08b, O2): capturas que passaram apenas na repetição. */
export function buildVisualSummary(visualReport) {
  return `## Visual

### Visual: testes instáveis

${flakySection(visualReport)}
`;
}

function option(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

function main() {
  const argv = process.argv.slice(2);
  const visualFile = option(argv, '--visual');
  if (visualFile) {
    const visualReport = readJson(visualFile);
    const md = buildVisualSummary(visualReport);
    const target = process.env.GITHUB_STEP_SUMMARY;
    if (target) appendFileSync(target, md);
    else process.stdout.write(md);
    for (const w of flakyWarnings(visualReport, 'e2e/visual')) console.log(w);
    return;
  }
  const playwrightReport = readJson(
    option(argv, '--playwright', 'e2e/test-results/report.json'),
  );
  const versionsFile = option(argv, '--versions');
  const md = buildSummary({
    sizes: loadSizes(option(argv, '--sizes', 'dist/reports/size')),
    coverage: loadCoverage(option(argv, '--coverage', 'coverage/packages')),
    playwrightReport,
    perf: loadPerf(option(argv, '--perf', 'e2e/test-results/perf')),
    versions: versionsFile ? readJson(versionsFile) : undefined,
  });
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, md);
  else process.stdout.write(md);
  for (const w of flakyWarnings(playwrightReport)) console.log(w);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
