// Relatórios de API (api-extractor) dos .d.ts publicados (spec 05d2, Z6–Z8).
// Uso: node tools/api-report.mjs <dir-do-pacote-publicado> [--model <dir>]
//   UPDATE_API=1 reescreve; RTE_API_MODEL=<dir> (ou --model) grava também um <entry>.api.json
//   por entry, com nome sintético (rte-core-html), para o api-documenter do site (07c).
//   tsup: packages/<p>; ng-packagr: dist/packages/<p>. Relatórios ficam em packages/<p>/api/.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syntheticName } from './docs/api-model.mjs';

export function reportFileName(packageName, subpath = '.') {
  const base = packageName.replace(/^@[^/]+\//, '');
  const sub =
    subpath === '.'
      ? ''
      : '-' + subpath.replace(/^\.\//, '').replace(/\//g, '-');
  return `${base}${sub}.api.md`;
}

export function listEntries(packageDir) {
  const pkg = JSON.parse(
    readFileSync(join(packageDir, 'package.json'), 'utf8'),
  );
  const entries = [];
  for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
    if (
      !subpath.startsWith('.') ||
      typeof target !== 'object' ||
      !target?.types
    )
      continue;
    entries.push({
      name: reportFileName(pkg.name, subpath),
      subpath,
      dts: resolve(packageDir, target.types),
    });
  }
  return entries;
}

export function checkReportSet(entries, reportDir) {
  const errors = [];
  const have = existsSync(reportDir)
    ? readdirSync(reportDir).filter((f) => f.endsWith('.api.md'))
    : [];
  const want = new Set(entries.map((e) => e.name));
  for (const e of entries)
    if (!have.includes(e.name))
      errors.push(
        `entry "${e.subpath}" sem relatório: ${join(reportDir, e.name)}`,
      );
  for (const f of have)
    if (!want.has(f))
      errors.push(`relatório órfão sem entry publicado: ${join(reportDir, f)}`);
  return errors;
}

// Mapeia @comodeviaser/rte-* para os .d.ts publicados de todos os pacotes do workspace.
// Os pacotes do workspace são expostos por junções em <stage>/node_modules/<pacote>, para o
// compilador tratá-los como pacotes externos (referências, nunca agregados; Z8).
export function workspacePaths(root, stage, links = []) {
  const paths = {};
  const dirs = [];
  const pk = join(root, 'packages');
  for (const p of existsSync(pk) ? readdirSync(pk) : []) {
    const tsup = join(root, 'packages', p);
    const ng = join(root, 'dist', 'packages', p);
    if (existsSync(join(ng, 'package.json'))) dirs.push(ng);
    else if (existsSync(join(tsup, 'package.json'))) dirs.push(tsup);
  }
  for (const d of dirs) {
    const pkg = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
    const link = join(stage, 'node_modules', pkg.name);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(d, link, 'junction');
    links.push(link);
    for (const [sub, t] of Object.entries(pkg.exports ?? {})) {
      if (typeof t !== 'object' || !t?.types) continue;
      paths[sub === '.' ? pkg.name : `${pkg.name}/${sub.slice(2)}`] = [
        resolve(stage, 'node_modules', pkg.name, t.types),
      ];
    }
  }
  return { paths, links };
}

const REPORT_MESSAGES = () => ({
  compilerMessageReporting: { default: { logLevel: 'warning' } },
  extractorMessageReporting: {
    default: { logLevel: 'error', addToApiReportFile: false },
    'ae-forgotten-export': { logLevel: 'error', addToApiReportFile: false },
    'ae-missing-release-tag': { logLevel: 'none' },
    'ae-internal-missing-underscore': { logLevel: 'none' },
    'ae-unresolved-link': { logLevel: 'none' },
    'ae-undocumented': { logLevel: 'none' },
    'ae-unresolved-inheritdoc-reference': { logLevel: 'none' },
    'ae-unresolved-inheritdoc-base': { logLevel: 'none' },
    'ae-different-release-tags': { logLevel: 'none' },
    'ae-incompatible-release-tags': { logLevel: 'none' },
  },
  tsdocMessageReporting: { default: { logLevel: 'none' } },
});

const tag = (entryName) => (entryName ? `${entryName}: ` : '');
const DECL_RE =
  /^export (?:declare )?(abstract )?(class|interface|type|const|enum|function) (\w+)/;
const PREFIX_RE = /^(Rte|RTE_)/;

// AP2: declaração exportada que não é função começa por Rte/RTE_ (funções ficam sem
// prefixo). `allow` = [{ name, reason }]: exceção só com motivo. Reexportações
// (`export { X }`) não são conferidas aqui: o nome vem da declaração no entry de origem.
export function checkPrefixConvention(
  reportText,
  { allow = [], entryName = '' } = {},
) {
  const errors = [];
  for (const line of reportText.split(/\r?\n/)) {
    const m = DECL_RE.exec(line);
    if (!m || m[2] === 'function') continue;
    const name = m[3];
    if (PREFIX_RE.test(name)) continue;
    const ex = allow.find((a) => a.name === name);
    if (ex?.reason) continue;
    errors.push(
      ex
        ? `${tag(entryName)}exceção ao prefixo de "${name}" sem motivo (informe "reason")`
        : `${tag(entryName)}${m[2]} "${name}" não começa por Rte/RTE_ (convenção AP2)`,
    );
  }
  return errors;
}

// AP8: @packageDocumentation no entry e nenhum "(undocumented)", exceto membros de
// interfaces Rte*Labels (documentadas no nível da interface) e os static ɵ que o
// compilador do Angular gera (não há onde escrever JSDoc).
export function checkDocumentation(reportText, entryName = '') {
  const errors = [];
  const lines = reportText.split(/\r?\n/);
  if (lines.some((l) => l.includes('No @packageDocumentation comment')))
    errors.push(
      `${tag(entryName)}entry sem @packageDocumentation (uma frase em pt-BR no arquivo-raiz do entry)`,
    );
  let top = null;
  for (let i = 0; i < lines.length; i++) {
    const m = DECL_RE.exec(lines[i]);
    if (m) top = m[3];
    if (!lines[i].includes('(undocumented)')) continue;
    const next = lines[i + 1] ?? '';
    const nm = DECL_RE.exec(next);
    if (nm) {
      errors.push(`${tag(entryName)}"${nm[3]}" sem JSDoc ((undocumented))`);
      continue;
    }
    if (/^\s+(static )?ɵ/.test(next)) continue;
    if (/^Rte\w*Labels$/.test(top ?? '') && /^\s/.test(lines[i])) continue;
    errors.push(
      `${tag(entryName)}membro de "${top}" sem JSDoc: ${next.trim().slice(0, 80)}`,
    );
  }
  return errors;
}

// Fonte do entry: <pacote>/src/index.ts (raiz) ou <pacote>/<subcaminho>/src/index.ts.
export function sourceEntryFile(pkgDir, subpath) {
  const sub = subpath === '.' ? '' : subpath.replace(/^\.\//, '');
  return join(pkgDir, sub, 'src', 'index.ts');
}

// Bloco /** ... @packageDocumentation */ do arquivo-raiz do entry, ou null.
export function extractPackageDoc(sourceText) {
  const re = /\/\*\*(?:(?!\*\/)[\s\S])*?@packageDocumentation[\s\S]*?\*\//;
  return re.exec(sourceText.replaceAll('\r\n', '\n'))?.[0] ?? null;
}

// Exceções ao prefixo da AP2 (nome + motivo). Vazia: nenhuma declaração fora da convenção.
export const PREFIX_EXCEPTIONS = [];

// Símbolos `ɵ` no relatório público vazam detalhe de implementação: só os
// membros estáticos gerados pelo compilador do Angular são aceitos (Z8).
export function internalLeaks(report) {
  const allowed = /^\s*(protected )?static ɵ(cmp|dir|fac|pipe|prov|inj|mod)\b/;
  const out = [];
  for (const line of report.split('\n'))
    if (line.includes('ɵ') && !allowed.test(line))
      out.push(
        `símbolo ɵ fora do permitido no relatório público (marque @internal): ${line.trim()}`,
      );
  return out;
}

// package.json sintético no estágio: o nome do pacote do modelo é o nome do entry.
function syntheticPackageJson(work, { name, version }) {
  const file = join(work, 'package.json');
  writeFileSync(file, JSON.stringify({ name, version }));
  return file;
}

// Retorna { ok, succeeded, apiReportChanged, errors } para um entry.
export async function runExtractor({
  entry,
  reportDir,
  update,
  paths = {},
  projectFolder,
  packageJsonFullPath,
  modelDir,
  syntheticPackage,
  checkConventions = false,
  packageDoc = null,
}) {
  const { Extractor, ExtractorConfig } =
    await import('@microsoft/api-extractor');
  const work = mkdtempSync(join(tmpdir(), 'api-report-'));
  // Cópia ao lado do .d.ts (imports relativos continuam valendo) com o comentário do pacote no topo.
  let dts = entry.dts;
  let pkgDocCopy = null;
  try {
    mkdirSync(join(work, 'out'));
    if (packageDoc) {
      // O empacotador pode manter o comentário fora do topo (depois dos imports): troca pelo do fonte.
      // CRLF normalizado: `extractPackageDoc` devolve o comentário com LF.
      const original = readFileSync(entry.dts, 'utf8').replaceAll('\r\n', '\n');
      const existing = extractPackageDoc(original);
      pkgDocCopy = entry.dts.replace(/\.d\.ts$/, '.pkgdoc.d.ts');
      writeFileSync(
        pkgDocCopy,
        packageDoc +
          '\n' +
          (existing ? original.replace(existing, '') : original),
      );
      dts = pkgDocCopy;
    }
    // Duas passadas: o relatório usa o nome real do pacote (cabeçalho "API Report File for"),
    // o modelo usa o nome sintético do entry; a passada do modelo não toca no relatório.
    const makeConfig = (model) =>
      ExtractorConfig.prepare({
        configObject: {
          projectFolder: projectFolder ?? dirname(entry.dts),
          mainEntryPointFilePath: dts,
          bundledPackages: [],
          compiler: {
            overrideTsconfig: {
              compilerOptions: {
                target: 'ES2022',
                module: 'ESNext',
                moduleResolution: 'bundler',
                lib: ['ES2022', 'dom'],
                skipLibCheck: true,
                strict: true,
                paths,
              },
              files: [dts],
            },
          },
          apiReport: {
            enabled: !model,
            reportFileName: entry.name.replace(/\.api\.md$/, ''),
            reportFolder: join(work, 'out'),
            reportTempFolder: work,
            reportVariants: ['public'],
          },
          docModel: model
            ? {
                enabled: true,
                apiJsonFilePath: join(
                  modelDir,
                  `${syntheticPackage.name}.api.json`,
                ),
              }
            : { enabled: false },
          dtsRollup: { enabled: false },
          tsdocMetadata: { enabled: false },
          messages: REPORT_MESSAGES(),
        },
        configObjectFullPath: join(work, 'api-extractor.json'),
        packageJsonFullPath: model
          ? syntheticPackageJson(work, syntheticPackage)
          : (packageJsonFullPath ??
            join(projectFolder ?? dirname(entry.dts), 'package.json')),
      });
    const messages = [];
    const res = Extractor.invoke(makeConfig(false), {
      localBuild: true,
      showVerboseMessages: false,
      messageCallback: (m) => {
        if (
          (m.logLevel === 'error' || m.logLevel === 'warning') &&
          !String(m.messageId).startsWith('console-')
        )
          messages.push(`${m.messageId}: ${m.text}`);
        m.handled = true;
      },
    });
    const errors = [...messages];
    const produced = join(
      work,
      'out',
      entry.name.replace(/\.api\.md$/, '.public.api.md'),
    );
    const next = existsSync(produced) ? readFileSync(produced, 'utf8') : null;
    const target = join(reportDir, entry.name);
    const norm = (t) => t.replaceAll('\r\n', '\n');
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    const changed =
      next !== null && (current === null || norm(current) !== norm(next));
    if (next === null) errors.push('o api-extractor não gerou o relatório');
    else {
      errors.push(...internalLeaks(next));
      if (checkConventions) {
        errors.push(
          ...checkPrefixConvention(next, {
            allow: PREFIX_EXCEPTIONS,
            entryName: entry.name,
          }),
          ...checkDocumentation(next, entry.name),
        );
      }
    }
    if (next !== null && changed && update) {
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(target, norm(next));
    } else if (changed) {
      errors.push(
        `relatório desatualizado: ${target} (rode com UPDATE_API=1 e revise a diferença)`,
      );
    }
    if (modelDir) {
      const modelMessages = [];
      Extractor.invoke(makeConfig(true), {
        localBuild: true,
        showVerboseMessages: false,
        messageCallback: (m) => {
          if (
            (m.logLevel === 'error' || m.logLevel === 'warning') &&
            !String(m.messageId).startsWith('console-')
          )
            modelMessages.push(`${m.messageId}: ${m.text}`);
          m.handled = true;
        },
      });
      for (const e of modelMessages) if (!errors.includes(e)) errors.push(e);
    }
    return { ok: errors.length === 0, apiReportChanged: changed, errors };
  } finally {
    if (pkgDocCopy) rmSync(pkgDocCopy, { force: true });
    rmSync(work, { recursive: true, force: true });
  }
}

export async function main(
  packageDir,
  { update, root = process.cwd(), modelDir, checkConventions = false } = {},
) {
  const dir = resolve(packageDir);
  const entries = listEntries(dir);
  const pkgDir = existsSync(join(dir, 'fesm2022'))
    ? resolve(root, 'packages', basename(dir))
    : dir;
  const reportDir = join(pkgDir, 'api');
  const realPkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (modelDir) mkdirSync(modelDir, { recursive: true });
  if (update) mkdirSync(reportDir, { recursive: true });
  const errors = [];
  if (update) {
    for (const f of existsSync(reportDir) ? readdirSync(reportDir) : [])
      if (f.endsWith('.api.md') && !entries.some((e) => e.name === f))
        rmSync(join(reportDir, f));
  } else errors.push(...checkReportSet(entries, reportDir));
  const stage = mkdtempSync(join(tmpdir(), 'api-stage-'));
  const links = [];
  try {
    const { paths } = workspacePaths(root, stage, links);
    for (const entry of entries) {
      if (!existsSync(entry.dts)) {
        errors.push(`.d.ts ausente (rode o build): ${entry.dts}`);
        continue;
      }
      const srcEntry = sourceEntryFile(pkgDir, entry.subpath);
      const r = await runExtractor({
        packageDoc: existsSync(srcEntry)
          ? extractPackageDoc(readFileSync(srcEntry, 'utf8'))
          : null,
        entry,
        reportDir,
        update,
        paths,
        projectFolder: root,
        packageJsonFullPath: join(dir, 'package.json'),
        modelDir,
        checkConventions,
        syntheticPackage: {
          name: syntheticName({ report: entry.name }, realPkg.name),
          version: realPkg.version,
        },
      });
      for (const e of r.errors) errors.push(`${entry.name}: ${e}`);
    }
  } finally {
    for (const l of links) {
      try {
        unlinkSync(l);
      } catch {
        // junção já removida: a limpeza do estágio segue
      }
    }
    rmSync(stage, { recursive: true, force: true });
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error(
      'uso: node tools/api-report.mjs <dir-do-pacote-publicado> [--model <dir>]',
    );
    process.exit(2);
  }
  const i = process.argv.indexOf('--model');
  const modelArg = i > 0 ? process.argv[i + 1] : process.env.RTE_API_MODEL;
  const errors = await main(dir, {
    update: process.env.UPDATE_API === '1',
    checkConventions: true,
    modelDir: modelArg ? resolve(modelArg) : undefined,
  });
  if (errors.length) {
    console.error(`api: ${errors.length} problema(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `api: ${process.env.UPDATE_API === '1' ? 'relatórios atualizados' : 'relatórios conferidos'} em ${dir}`,
  );
}
