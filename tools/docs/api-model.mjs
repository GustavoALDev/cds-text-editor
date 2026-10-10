// Modelo de API (api-extractor) e Markdown do api-documenter para o site (spec 07c, X3/X5).
// Cada entry publicado vira um "pacote" sintético (`rte-core-html`), porque o api-documenter
// trata um `.api.json` como um pacote e não aceita vários entries sob o mesmo nome.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const unscoped = (name) => name.replace(/^@[^/]+\//, '');

// `report` é o nome do relatório (`rte-core-html.api.md`); pontos viram hífens.
export function syntheticName({ report }, packageName) {
  const base = report.replace(/\.api\.md$/, '').replaceAll('.', '-');
  const pkg = unscoped(packageName); // rte-core
  if (base === pkg || base.startsWith(`${pkg}-`)) return base;
  const short = pkg.replace(/^rte-/, ''); // core
  if (base === short || base.startsWith(`${short}-`)) return `rte-${base}`;
  return `${pkg}-${base}`;
}

// Lista { synthetic, specifier } a partir dos `exports` publicados (subcaminhos com `types`).
export function listModelEntries(packageJson) {
  const out = [];
  for (const [subpath, target] of Object.entries(packageJson.exports ?? {})) {
    if (
      !subpath.startsWith('.') ||
      typeof target !== 'object' ||
      !target?.types
    )
      continue;
    const sub =
      subpath === '.'
        ? ''
        : '-' + subpath.replace(/^\.\//, '').replaceAll('/', '-');
    out.push({
      synthetic: `${unscoped(packageJson.name)}${sub}`,
      specifier:
        subpath === '.'
          ? packageJson.name
          : `${packageJson.name}/${subpath.slice(2)}`,
    });
  }
  return out;
}

// `rte-core-html` -> `@comodeviaser/rte-core/html`, procurando nos `exports` dos pacotes dados.
export function entrySpecifier(synthetic, packageJsons) {
  for (const pkg of packageJsons) {
    const hit = listModelEntries(pkg).find((e) => e.synthetic === synthetic);
    if (hit) return hit.specifier;
  }
  throw new Error(
    `nome sintético "${synthetic}" sem entry nos exports dos pacotes publicados`,
  );
}

// api-documenter e api-extractor precisam resolver o MESMO @microsoft/api-extractor-model:
// se divergirem, o `.api.json` gravado por um pode não ser lido pelo outro.
export function modelVersions(from = import.meta.url) {
  const req = createRequire(from);
  const readVersion = (pkg, fromPkg) => {
    const dir = dirname(req.resolve(`${fromPkg}/package.json`));
    const r = createRequire(join(dir, 'package.json'));
    return JSON.parse(readFileSync(r.resolve(`${pkg}/package.json`), 'utf8'))
      .version;
  };
  const m = '@microsoft/api-extractor-model';
  return {
    extractor: readVersion(m, '@microsoft/api-extractor'),
    documenter: readVersion(m, '@microsoft/api-documenter'),
  };
}

export function checkPairedVersions({ extractor, documenter }) {
  return extractor === documenter
    ? []
    : [
        `versões desencontradas do @microsoft/api-extractor-model: o api-extractor usa ${extractor} e o api-documenter usa ${documenter}; instale a versão do api-documenter que fixa ${extractor}`,
      ];
}

// Roda `api-documenter markdown` sobre os `.api.json` de modelDir.
export function runApiDocumenter({ modelDir, outDir, exec = defaultExec }) {
  if (
    !existsSync(modelDir) ||
    !readdirSync(modelDir).some((f) => f.endsWith('.api.json'))
  )
    throw new Error(
      `nenhum .api.json em ${modelDir}: rode "node tools/api-report.mjs <pacote>" com RTE_API_MODEL`,
    );
  return exec('npx', [
    'api-documenter',
    'markdown',
    '-i',
    modelDir,
    '-o',
    outDir,
  ]);
}

function defaultExec(cmd, args) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0)
    throw new Error(
      `falha ao executar: ${cmd} ${args.join(' ')} (código ${r.status})`,
    );
}
