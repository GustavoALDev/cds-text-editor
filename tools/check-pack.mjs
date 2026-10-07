import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const COMMON = [/^package\.json$/, /^README\.md$/, /^LICENSE$/];
// Pacotes tsup: saída de build em dist/.
// `styles/*.css` é CSS exportado como arquivo, versionado no próprio pacote (core, spec 05b1 U16).
const TSUP_OUTPUT = [/^dist\//, /^styles\/[^/]+\.css$/];
// Pacotes ng-packagr: a raiz do tarball é a pasta dist, então a saída fica na raiz
// (fesm2022/, types/ e package.json de cada entry point secundário). No `fesm2022/` só `.mjs`
// (e o `.map`) direto na pasta: os entries e os *chunks* do `@defer` (spec 05b2a, R1).
const NG_OUTPUT = [
  /^fesm2022\/[^/]+\.mjs(?:\.map)?$/,
  /^types\//,
  /^[^/]+\/package\.json$/,
  /^[^/]+\/types\//,
  /^[^/]+\.d\.ts$/,
  // CSS exportado como arquivo (`assets` do ng-package.json; spec 05a, D16).
  /^styles\/[^/]+\.css$/,
];
const FORBIDDEN = [/\.spec\./, /\.tsbuildinfo$/];

export function checkPackFiles(files, kind = 'tsup') {
  const output = kind === 'ng-packagr' ? NG_OUTPUT : TSUP_OUTPUT;
  const allowed = [...COMMON, ...output];
  const errors = [];
  for (const file of files) {
    if (
      FORBIDDEN.some((re) => re.test(file)) ||
      !allowed.some((re) => re.test(file))
    ) {
      errors.push(`arquivo inesperado no tarball: ${file}`);
    }
  }
  return errors;
}

export function checkRequiredFiles(files) {
  return ['package.json', 'README.md', 'LICENSE']
    .filter((required) => !files.includes(required))
    .map((required) => `arquivo obrigatório ausente no tarball: ${required}`);
}

function run(cwd, cmd, args) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

// attw só analisa JS/tipos: entrypoints que exportam um arquivo de estilo (ex.: ./theme.css)
// resolvem "para nada" e geram falso positivo, então são excluídos do attw (publint os valida).
export function nonCodeEntrypoints(exportsField) {
  if (!exportsField || typeof exportsField !== 'object') return [];
  return Object.entries(exportsField)
    .filter(
      ([key, target]) =>
        key.startsWith('.') &&
        typeof target === 'string' &&
        /\.(css|scss|json)$/.test(target),
    )
    .map(([key]) => key);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('uso: node tools/check-pack.mjs <dir-do-pacote>');
    process.exit(2);
  }
  // attw --pack grava o tarball no diretório temporário do sistema.
  if (!process.env.TMPDIR) {
    process.env.TMPDIR = join(homedir(), '.cache', 'tmp');
  }
  mkdirSync(process.env.TMPDIR, { recursive: true });

  const kind = existsSync(resolve(dir, 'fesm2022')) ? 'ng-packagr' : 'tsup';
  const [report] = JSON.parse(run(dir, 'npm', ['pack', '--dry-run', '--json']));
  const paths = report.files.map((f) => f.path);
  const errors = [...checkRequiredFiles(paths), ...checkPackFiles(paths, kind)];
  for (const e of errors) console.error(e);
  console.log(`${dir} (${kind}): ${paths.length} arquivos no tarball`);
  console.log(run(dir, 'npx', ['--no-install', 'publint', '--strict']));
  const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
  const excluded = nonCodeEntrypoints(pkg.exports);
  const attwArgs = [
    '--no-install',
    'attw',
    '--pack',
    '.',
    '--profile',
    'esm-only',
  ];
  if (excluded.length) attwArgs.push('--exclude-entrypoints', ...excluded);
  try {
    console.log(run(dir, 'npx', attwArgs));
  } catch (error) {
    console.error(error.stdout ?? error.message);
    process.exit(1);
  }
  process.exit(errors.length ? 1 : 0);
}
