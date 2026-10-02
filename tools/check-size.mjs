import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, transform } from 'esbuild';

// Cenários de consumo: o que um consumidor típico importa. O orçamento é por cenário
// (R11), medido depois do tree-shaking do bundler do consumidor.
export const SCENARIOS = {
  whole: ['*'],
  apply: ['applyRteTheme'],
  create: ['createRteTheme'],
  parse: ['parseColor'],
  presets: ['RTE_THEME_PRESETS'],
  check: ['checkRteTheme', 'warnIfPoorTheme', 'suggestRteColor'],
};

const DEFAULT_BUDGET_FILE = 'packages/theme/size-budget.json';

/** Bytes de `code` minificado e comprimido com gzip nível 9. */
export async function measureMinGzip(code) {
  const { code: min } = await transform(code, { minify: true, format: 'esm' });
  return gzipSync(min, { level: 9 }).length;
}

/** Empacota só `exportsList` (ou `['*']`) de `distFile` como um consumidor faria. */
export async function bundleScenario(distFile, exportsList, opts = {}) {
  const abs = resolve(distFile);
  if (!existsSync(abs)) {
    throw new Error(`arquivo não encontrado: ${abs} (rode "nx build theme")`);
  }
  const contents =
    exportsList[0] === '*'
      ? `export * from ${JSON.stringify(abs)};`
      : `export { ${exportsList.join(', ')} } from ${JSON.stringify(abs)};`;
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'js' },
    bundle: true,
    minify: opts.minify ?? true,
    format: 'esm',
    treeShaking: true,
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

/** Mede um cenário: `{ min, gzip }` em bytes. */
export async function measureScenario(distFile, name) {
  const exportsList = SCENARIOS[name];
  if (!exportsList) throw new Error(`cenário desconhecido: ${name}`);
  const code = await bundleScenario(distFile, exportsList);
  return { min: Buffer.byteLength(code), gzip: await measureMinGzip(code) };
}

/** Compara medições `{ cenário: { min, gzip } }` com orçamentos `{ cenário: bytes }`. */
export function checkSizes(measurements, budgets) {
  const errors = [];
  for (const [name, { gzip }] of Object.entries(measurements)) {
    const budget = budgets[name];
    if (budget === undefined) {
      errors.push(`cenário "${name}" sem orçamento definido`);
    } else if (gzip > budget) {
      errors.push(
        `cenário "${name}" estourou o orçamento: ${gzip} B min+gzip > ${budget} B (excesso de ${gzip - budget} B)`,
      );
    }
  }
  for (const name of Object.keys(budgets)) {
    if (!(name in measurements)) {
      errors.push(`orçamento para cenário desconhecido: "${name}"`);
    }
  }
  return errors;
}

export function formatTable(measurements, budgets) {
  const rows = [['cenário', 'min', 'min+gzip', 'orçamento', 'folga']];
  for (const [name, { min, gzip }] of Object.entries(measurements)) {
    const b = budgets[name];
    rows.push([
      name,
      `${min}`,
      `${gzip}`,
      `${b ?? '-'}`,
      b === undefined ? '-' : `${b - gzip}`,
    ]);
  }
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => r[i].length)),
  );
  return rows
    .map((r) => r.map((c, i) => c.padStart(widths[i])).join('  '))
    .join('\n');
}

export function parseArgs(argv, fileBudgets) {
  const [file, ...rest] = argv;
  const budgets = { ...fileBudgets };
  for (let i = 0; i < rest.length; i += 2) {
    const m = /^([a-z]+)=(\d+)$/.exec(rest[i + 1] ?? '');
    if (rest[i] !== '--budget' || !m) {
      throw new Error(
        `argumento inválido: ${rest[i]} ${rest[i + 1] ?? ''}`.trim(),
      );
    }
    budgets[m[1]] = Number(m[2]);
  }
  return { file, budgets };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      'uso: node tools/check-size.mjs <dist/index.js> [--budget cenário=bytes …]',
    );
    process.exit(2);
  }
  const fileBudgets = existsSync(DEFAULT_BUDGET_FILE)
    ? JSON.parse(readFileSync(DEFAULT_BUDGET_FILE, 'utf8'))
    : {};
  let parsed;
  try {
    parsed = parseArgs(argv, fileBudgets);
    const measurements = {};
    for (const name of Object.keys(SCENARIOS)) {
      measurements[name] = await measureScenario(parsed.file, name);
    }
    const errors = checkSizes(measurements, parsed.budgets);
    if (errors.length > 0) {
      console.error(formatTable(measurements, parsed.budgets));
      for (const e of errors) console.error(`erro: ${e}`);
      process.exit(1);
    }
    console.log(formatTable(measurements, parsed.budgets));
    console.log('tamanhos (min+gzip) dentro do orçamento');
  } catch (e) {
    console.error(`erro: ${e.message}`);
    process.exit(2);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
