// Relatórios de API (api-extractor) dos .d.ts publicados (spec 05d2, Z6–Z8).
// Uso: node tools/api-report.mjs <dir-do-pacote-publicado>   (UPDATE_API=1 reescreve)
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

// Mapeia @cds/rte-* para os .d.ts publicados de todos os pacotes do workspace.
// Os pacotes do workspace são expostos por junções em <stage>/node_modules/<pacote>, para o
// compilador tratá-los como pacotes externos (referências, nunca agregados; Z8).
export function workspacePaths(root, stage) {
  const paths = {};
  const links = [];
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

const REPORT_MESSAGES = (level) => ({
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

// Retorna { ok, succeeded, apiReportChanged, errors } para um entry.
export async function runExtractor({
  entry,
  reportDir,
  update,
  paths = {},
  projectFolder,
  packageJsonFullPath,
}) {
  const { Extractor, ExtractorConfig } =
    await import('@microsoft/api-extractor');
  const work = mkdtempSync(join(tmpdir(), 'api-report-'));
  mkdirSync(join(work, 'out'));
  try {
    const cfg = ExtractorConfig.prepare({
      configObject: {
        projectFolder: projectFolder ?? dirname(entry.dts),
        mainEntryPointFilePath: entry.dts,
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
            files: [entry.dts],
          },
        },
        apiReport: {
          enabled: true,
          reportFileName: entry.name.replace(/\.api\.md$/, ''),
          reportFolder: join(work, 'out'),
          reportTempFolder: work,
          reportVariants: ['public'],
        },
        docModel: { enabled: false },
        dtsRollup: { enabled: false },
        tsdocMetadata: { enabled: false },
        messages: REPORT_MESSAGES(),
      },
      configObjectFullPath: join(work, 'api-extractor.json'),
      packageJsonFullPath:
        packageJsonFullPath ??
        join(projectFolder ?? dirname(entry.dts), 'package.json'),
    });
    const messages = [];
    const res = Extractor.invoke(cfg, {
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
    else if (changed && update) {
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(target, norm(next));
    } else if (changed) {
      errors.push(
        `relatório desatualizado: ${target} (rode com UPDATE_API=1 e revise a diferença)`,
      );
    }
    return { ok: errors.length === 0, apiReportChanged: changed, errors };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function main(packageDir, { update, root = process.cwd() } = {}) {
  const dir = resolve(packageDir);
  const entries = listEntries(dir);
  const pkgDir = existsSync(join(dir, 'fesm2022'))
    ? resolve(root, 'packages', basename(dir))
    : dir;
  const reportDir = join(pkgDir, 'api');
  if (update) mkdirSync(reportDir, { recursive: true });
  const errors = [];
  if (update) {
    for (const f of existsSync(reportDir) ? readdirSync(reportDir) : [])
      if (f.endsWith('.api.md') && !entries.some((e) => e.name === f))
        rmSync(join(reportDir, f));
  } else errors.push(...checkReportSet(entries, reportDir));
  const stage = mkdtempSync(join(tmpdir(), 'api-stage-'));
  const { paths, links } = workspacePaths(root, stage);
  try {
    for (const entry of entries) {
      if (!existsSync(entry.dts)) {
        errors.push(`.d.ts ausente (rode o build): ${entry.dts}`);
        continue;
      }
      const r = await runExtractor({
        entry,
        reportDir,
        update,
        paths,
        projectFolder: root,
        packageJsonFullPath: join(dir, 'package.json'),
      });
      for (const e of r.errors) errors.push(`${entry.name}: ${e}`);
    }
  } finally {
    for (const l of links) unlinkSync(l);
    rmSync(stage, { recursive: true, force: true });
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('uso: node tools/api-report.mjs <dir-do-pacote-publicado>');
    process.exit(2);
  }
  const errors = await main(dir, { update: process.env.UPDATE_API === '1' });
  if (errors.length) {
    console.error(`api: ${errors.length} problema(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `api: ${process.env.UPDATE_API === '1' ? 'relatórios atualizados' : 'relatórios conferidos'} em ${dir}`,
  );
}
