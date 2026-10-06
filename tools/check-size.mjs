import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
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

/**
 * *Chunks* irmãos (`./x.mjs`, como os do `@defer` no FESM do ng-packagr) ficam fora do
 * bundle: sem `splitting`, o esbuild embutiria o `import()` relativo na medida do entry.
 * `dynamic` só deixa fora os `import()`: com mais de um `@defer`, o rollup divide o entry
 * principal num reexportador mais um *chunk* compartilhado importado estaticamente, que
 * precisa entrar na medida (spec 05b2b, Tarefa 8b).
 */
function externalChunksPlugin(mode) {
  return {
    name: 'external-chunks',
    setup(b) {
      b.onResolve({ filter: /^\.\/[^/]+\.mjs$/ }, (args) =>
        mode === 'dynamic' && args.kind !== 'dynamic-import'
          ? undefined
          : { path: args.path, external: true },
      );
    },
  };
}

function chunkPlugins(externalChunks) {
  if (externalChunks === undefined || externalChunks === false) return [];
  if (externalChunks === true) return [externalChunksPlugin('all')];
  if (externalChunks === 'dynamic') return [externalChunksPlugin('dynamic')];
  throw new Error(
    `externalChunks inválido: ${JSON.stringify(externalChunks)} (use true, false ou "dynamic")`,
  );
}

/**
 * Resolve um `entry` com curinga `*` no nome do arquivo (não na pasta): precisa casar
 * exatamente um arquivo (o *chunk* tem *hash* no nome). Sem curinga, devolve como está.
 */
export function resolveEntry(pattern) {
  if (!pattern.includes('*')) return pattern;
  const dir = dirname(pattern);
  const name = basename(pattern);
  if (dir.includes('*')) {
    throw new Error(`curinga só no nome do arquivo: "${pattern}"`);
  }
  const re = new RegExp(
    `^${name
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );
  const found = existsSync(dir)
    ? readdirSync(dir).filter((f) => re.test(f))
    : [];
  if (found.length === 0) {
    throw new Error(`curinga "${pattern}": nenhum arquivo casou`);
  }
  if (found.length > 1) {
    throw new Error(
      `curinga "${pattern}": ${found.length} arquivos casaram (${found.join(', ')}); precisa casar exatamente um`,
    );
  }
  return join(dir, found[0]);
}

/** Empacota só `exportsList` (ou `['*']`) de `distFile` como um consumidor faria. */
export async function bundleScenario(distFile, exportsList, opts = {}) {
  return (await bundleWithImports(distFile, exportsList, opts)).code;
}

/**
 * Como {@link bundleScenario}, mais a lista dos imports externos que sobram no
 * bundle (`import` estático e `import()`; os *chunks* irmãos externos entram
 * pelo caminho relativo).
 */
export async function bundleWithImports(distFile, exportsList, opts = {}) {
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
    external: opts.external ?? [],
    plugins: chunkPlugins(opts.externalChunks),
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const imports = Object.values(result.metafile.outputs).flatMap((o) =>
    o.imports.filter((i) => i.external).map((i) => i.path),
  );
  return { code: result.outputFiles[0].text, imports: [...new Set(imports)] };
}

/**
 * Imports proibidos de um cenário (spec 05c2a, R1): `forbidden` casa o pacote
 * exato ou um subcaminho (`@angular/forms` casa `@angular/forms/signals`).
 */
export function forbiddenHits(imports, forbidden) {
  return imports.filter((i) =>
    forbidden.some((f) => i === f || i.startsWith(`${f}/`)),
  );
}

/**
 * Mede cenários descritos num arquivo de configuração:
 * `{ scenarios: { nome: { entry, exports, external?, externalChunks? } }, budgets: { nome: bytes } }`.
 * `external` lista pacotes que ficam fora do bundle (peers do consumidor);
 * `externalChunks: true` deixa fora todos os *chunks* irmãos `./x.mjs` (medida de um *chunk*
 * do `@defer` sozinho); `externalChunks: "dynamic"` deixa fora só os carregados por `import()`
 * (custo inicial de um entry que o rollup dividiu num *chunk* compartilhado).
 * Os caminhos de `entry` são relativos à raiz do repositório (cwd) e aceitam um curinga `*`
 * no nome do arquivo, que precisa casar exatamente um arquivo (`resolveEntry`).
 * `forbiddenImports` (opcional) lista pacotes que não podem sobrar como import no
 * bundle do cenário (ex.: `@angular/forms` fora do *chunk* principal, spec 05c2a R1);
 * os encontrados vão em `forbidden` e o `checkSizes` os reporta como erro.
 */
export async function measureConfig(config) {
  const measurements = {};
  for (const [
    name,
    { entry, exports: list, external, externalChunks, forbiddenImports },
  ] of Object.entries(config.scenarios ?? {})) {
    if (!entry || !Array.isArray(list) || list.length === 0) {
      throw new Error(`cenário "${name}" inválido: precisa de entry e exports`);
    }
    const { code, imports } = await bundleWithImports(
      resolveEntry(entry),
      list,
      { external, externalChunks },
    );
    measurements[name] = {
      min: Buffer.byteLength(code),
      gzip: await measureMinGzip(code),
    };
    if (forbiddenImports) {
      measurements[name].forbidden = forbiddenHits(imports, forbiddenImports);
    }
  }
  return measurements;
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
  for (const [name, { gzip, forbidden }] of Object.entries(measurements)) {
    if (forbidden?.length) {
      errors.push(
        `cenário "${name}" importa o que não pode: ${forbidden.join(', ')}`,
      );
    }
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
      'uso: node tools/check-size.mjs <dist/index.js> [--budget cenário=bytes …]\n' +
        '     node tools/check-size.mjs --config <arquivo.json>',
    );
    process.exit(2);
  }
  const fileBudgets = existsSync(DEFAULT_BUDGET_FILE)
    ? JSON.parse(readFileSync(DEFAULT_BUDGET_FILE, 'utf8'))
    : {};
  let parsed;
  try {
    let measurements = {};
    let budgets;
    if (argv[0] === '--config') {
      if (!argv[1]) throw new Error('--config exige um arquivo .json');
      if (!existsSync(argv[1])) {
        throw new Error(`arquivo não encontrado: ${resolve(argv[1])}`);
      }
      const config = JSON.parse(readFileSync(argv[1], 'utf8'));
      measurements = await measureConfig(config);
      budgets = config.budgets ?? {};
    } else {
      parsed = parseArgs(argv, fileBudgets);
      for (const name of Object.keys(SCENARIOS)) {
        measurements[name] = await measureScenario(parsed.file, name);
      }
      budgets = parsed.budgets;
    }
    const errors = checkSizes(measurements, budgets);
    if (errors.length > 0) {
      console.error(formatTable(measurements, budgets));
      for (const e of errors) console.error(`erro: ${e}`);
      process.exit(1);
    }
    console.log(formatTable(measurements, budgets));
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
