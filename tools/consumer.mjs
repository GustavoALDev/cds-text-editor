// Consumo por tarball (spec 07b, W2/W3): empacota os 5 pacotes, copia `apps/demo` para um
// diretório FORA do repositório, instala os tarballs ali e constrói/testa o demo como um
// consumidor externo. Node puro, sem dependências. Funções puras e executor/`fs` injetados para
// `test:tools` (nenhum teste roda npm). Uso:
//   node tools/consumer.mjs pack prepare install test build [check-snippets]
// Variáveis: RTE_CONSUMER_DIR (diretório do consumidor), RTE_NPM (npm a usar; padrão `npm`,
// localmente `npx -y npm@11`), RUNNER_TEMP/TMPDIR (padrão do diretório do consumidor).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Os 5 pacotes e onde ficam publicados (mesmos diretórios de `tools/check-pack.mjs`). */
export const PACKAGES = [
  { dir: 'core', kind: 'tsup' },
  { dir: 'sanitizer', kind: 'tsup' },
  { dir: 'theme', kind: 'tsup' },
  { dir: 'angular', kind: 'ng-packagr' },
  { dir: 'render', kind: 'ng-packagr' },
];

const STEPS = ['pack', 'prepare', 'install', 'test', 'build'];
const NOT_IMPLEMENTED = { dev: 3, serve: 3, 'check-snippets': 5 };
const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
// O que não vai do demo para o consumidor (`e2e/` é do Playwright do repositório).
const COPY_EXCLUDE = new Set([
  'node_modules',
  'dist',
  '.angular',
  'e2e',
  'package-lock.json',
]);

const toSlash = (path) => path.replaceAll('\\', '/');

/** `child` é o próprio `parent` ou está dentro dele (insensível a maiúsculas no Windows). */
function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function packDirOf(repoRoot, dir) {
  const pkg = PACKAGES.find((p) => p.dir === dir);
  if (!pkg) throw new Error(`pacote desconhecido: ${dir}`);
  return pkg.kind === 'tsup'
    ? join(repoRoot, 'packages', dir)
    : join(repoRoot, 'dist', 'packages', dir);
}

/**
 * Troca as dependências `@cds/*` por `file:<tarball>`; mantém as de terceiros. Falha se faltar o
 * tarball de algum `@cds/*`. Não muta a entrada.
 */
export function rewriteDependencies(pkg, manifest, tarballDir) {
  const out = structuredClone(pkg);
  const base = toSlash(tarballDir).replace(/\/+$/, '');
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(out[field] ?? {})) {
      if (!name.startsWith('@cds/')) continue;
      const entry = manifest.packages.find((p) => p.name === name);
      if (!entry) {
        throw new Error(
          `sem tarball para ${name} no manifest.json (rode "pack" antes)`,
        );
      }
      out[field][name] = `file:${base}/${entry.file}`;
    }
  }
  return out;
}

/** Manifest de tarballs: nome e versão vêm do pacote empacotado; sha512 dos bytes; ordem estável. */
export function buildManifest(entries) {
  const packages = entries.map(({ name, version, file, bytes }) => {
    if (!name || !version || !file || !bytes) {
      throw new Error(
        `entrada de pacote incompleta (nome, versão, arquivo e bytes): ${JSON.stringify({ name, version, file })}`,
      );
    }
    return {
      name,
      version,
      file,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    };
  });
  packages.sort((a, b) => a.name.localeCompare(b.name));
  return { packages };
}

/** Diretório do consumidor: RTE_CONSUMER_DIR, senão RUNNER_TEMP (CI) ou TMPDIR. Fora do repositório. */
export function resolveConsumerDir(env, repoRoot) {
  let dir;
  if (env.RTE_CONSUMER_DIR) {
    dir = resolve(env.RTE_CONSUMER_DIR);
  } else {
    const base =
      env.CI && env.RUNNER_TEMP
        ? env.RUNNER_TEMP
        : (env.TMPDIR ?? env.RUNNER_TEMP ?? tmpdir());
    dir = join(resolve(base), 'cds-rte-consumer', 'demo');
  }
  if (isInside(repoRoot, dir)) {
    throw new Error(
      `o diretório do consumidor (${dir}) fica dentro do repositório: use um diretório fora dele (RTE_CONSUMER_DIR)`,
    );
  }
  if (isInside(dir, repoRoot)) {
    throw new Error(
      `o diretório do consumidor (${dir}) contém o repositório: use um diretório fora dele (RTE_CONSUMER_DIR)`,
    );
  }
  return dir;
}

/** `RTE_NPM` ("npx -y npm@11") em palavras; padrão `npm`. */
export function parseNpmCommand(value) {
  const words = (value ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words : ['npm'];
}

function parsePackJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.search(/^\[/m);
    if (start < 0) throw new Error(`saída inesperada do npm pack: ${text}`);
    return JSON.parse(text.slice(start));
  }
}

/** `npm pack` dos 5 pacotes para `dist/tarballs/` e `manifest.json`. */
export function runPack({ repoRoot, npm, exec, fs = nodeFs }) {
  const dest = join(repoRoot, 'dist', 'tarballs');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const entries = [];
  for (const { dir } of PACKAGES) {
    const cwd = packDirOf(repoRoot, dir);
    if (!fs.existsSync(join(cwd, 'package.json'))) {
      throw new Error(
        `${cwd} não existe: construa os pacotes antes (npx nx run-many -t build -p core sanitizer theme angular render)`,
      );
    }
    const out = exec(
      npm[0],
      [...npm.slice(1), 'pack', '--pack-destination', dest, '--json'],
      { cwd, capture: true },
    );
    const [report] = parsePackJson(out);
    if (report.name !== `@cds/rte-${dir}`) {
      throw new Error(
        `npm pack em ${cwd} gerou ${report.name}, esperado @cds/rte-${dir}`,
      );
    }
    entries.push({
      name: report.name,
      version: report.version,
      file: report.filename,
      bytes: fs.readFileSync(join(dest, report.filename)),
    });
  }
  const manifest = buildManifest(entries);
  fs.writeFileSync(
    join(dest, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/**
 * Copia `apps/demo` para o consumidor e reescreve o `package.json`. Limpa o consumidor antes,
 * mas preserva o `node_modules` de terceiros (só `@cds` e o lockfile oculto saem, para o
 * npm reinstalar os tarballs novos).
 */
export function prepareConsumer({ repoRoot, consumerDir, fs = nodeFs }) {
  if (isInside(repoRoot, consumerDir)) {
    throw new Error(
      `o diretório do consumidor (${consumerDir}) fica dentro do repositório`,
    );
  }
  const tarballDir = join(repoRoot, 'dist', 'tarballs');
  const manifestPath = join(tarballDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${manifestPath} não existe: rode "pack" antes`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const demo = join(repoRoot, 'apps', 'demo');

  fs.mkdirSync(consumerDir, { recursive: true });
  for (const name of fs.readdirSync(consumerDir)) {
    if (name !== 'node_modules') {
      fs.rmSync(join(consumerDir, name), { recursive: true, force: true });
    }
  }
  const modules = join(consumerDir, 'node_modules');
  fs.rmSync(join(modules, '@cds'), { recursive: true, force: true });
  fs.rmSync(join(modules, '.package-lock.json'), { force: true });

  fs.cpSync(demo, consumerDir, {
    recursive: true,
    filter: (src) => {
      const parts = relative(demo, src).split(sep).filter(Boolean);
      return !parts.some((part) => COPY_EXCLUDE.has(part));
    },
  });
  const pkg = JSON.parse(fs.readFileSync(join(demo, 'package.json'), 'utf8'));
  fs.writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify(rewriteDependencies(pkg, manifest, tarballDir), null, 2)}\n`,
  );
  fs.copyFileSync(manifestPath, join(consumerDir, 'manifest.json'));
}

/**
 * Prova de origem (W3): cada `@cds/*` do manifest está em `<consumidor>/node_modules` como
 * diretório real (não link), resolve (`realpath`) para dentro dele e fora do repositório, tem a
 * versão do manifest e o sha512 que o npm registrou no lockfile oculto. Devolve as mensagens de
 * erro (vazio = ok).
 */
export function verifyOrigin(consumerDir, manifest, fs, { repoRoot }) {
  const real = (path) => (fs.realpathSync.native ?? fs.realpathSync)(path);
  if (isInside(repoRoot, consumerDir)) {
    return [
      `o diretório do consumidor (${consumerDir}) fica dentro do repositório: a prova de origem não vale`,
    ];
  }
  const errors = [];
  const modules = join(consumerDir, 'node_modules');
  let modulesReal;
  try {
    modulesReal = real(modules);
  } catch {
    return [`${modules} não existe: o install não rodou`];
  }
  let repoReal = repoRoot;
  try {
    repoReal = real(repoRoot);
  } catch {
    // repositório inexistente (fixture): compara pelo texto
  }
  let lock = null;
  try {
    lock = JSON.parse(
      fs.readFileSync(join(modules, '.package-lock.json'), 'utf8'),
    );
  } catch {
    errors.push(
      `${join(modules, '.package-lock.json')} ausente ou inválido: não há sha512 instalado para conferir`,
    );
  }
  for (const entry of manifest.packages) {
    const dir = join(modules, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(dir);
    } catch {
      errors.push(`${entry.name}: ausente em ${modules}`);
      continue;
    }
    if (stat.isSymbolicLink()) {
      errors.push(
        `${entry.name}: é um link simbólico em node_modules do consumidor (deveria ser o diretório do tarball instalado)`,
      );
      continue;
    }
    const path = real(dir);
    if (!isInside(modulesReal, path)) {
      errors.push(
        `${entry.name}: resolve para fora de ${modulesReal} (${path})`,
      );
      continue;
    }
    if (isInside(repoReal, path)) {
      errors.push(
        `${entry.name}: resolve para dentro do repositório (${path})`,
      );
      continue;
    }
    let version;
    try {
      version = JSON.parse(
        fs.readFileSync(join(dir, 'package.json'), 'utf8'),
      ).version;
    } catch {
      version = undefined;
    }
    if (version !== entry.version) {
      errors.push(
        `${entry.name}: versão instalada ${version ?? '(ilegível)'} difere da do manifest (${entry.version})`,
      );
    }
    const installed = lock?.packages?.[`node_modules/${entry.name}`]?.integrity;
    if (lock && installed !== entry.integrity) {
      errors.push(
        `${entry.name}: sha512 instalado (${installed ?? 'ausente'}) difere do manifest (${entry.integrity})`,
      );
    }
  }
  return errors;
}

/** Comando de `build`/`test` do Angular CLI do consumidor, sem `npx` (o `ng.js` local). */
export function commandsFor(step, { consumerDir }) {
  const ng = join(
    consumerDir,
    'node_modules',
    '@angular',
    'cli',
    'bin',
    'ng.js',
  );
  const args = {
    build: ['build'],
    test: ['test', '--watch=false'],
  }[step];
  if (!args) throw new Error(`subcomando sem comando de CLI: ${step}`);
  return { cmd: process.execPath, args: [ng, ...args], cwd: consumerDir };
}

function quote(arg) {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

/** Executor real: `capture` devolve o stdout; senão herda o terminal. npm/npx no Windows via shell. */
export function defaultExec(cmd, args, { cwd, capture = false, env } = {}) {
  const shell = process.platform === 'win32' && /^(npm|npx)$/i.test(cmd);
  const result = shell
    ? spawnSync([cmd, ...args].map(quote).join(' '), {
        cwd,
        shell: true,
        encoding: 'utf8',
        env: { ...process.env, ...env },
        stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
        maxBuffer: 64 * 1024 * 1024,
      })
    : spawnSync(cmd, args, {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...env },
        stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
        maxBuffer: 64 * 1024 * 1024,
      });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `falhou (${result.status}): ${[cmd, ...args].join(' ')} em ${cwd}`,
    );
  }
  return result.stdout ?? '';
}

/** Executa os subcomandos na ordem dada. `deps` permite injetar o executor nos testes. */
export async function main(argv, env = process.env, deps = {}) {
  const exec = deps.exec ?? defaultExec;
  const repoRoot = deps.repoRoot ?? REPO_ROOT;
  const fs = deps.fs ?? nodeFs;
  if (!argv.length) {
    throw new Error(
      `uso: node tools/consumer.mjs <${[...STEPS, ...Object.keys(NOT_IMPLEMENTED)].join('|')}>...`,
    );
  }
  for (const step of argv) {
    if (NOT_IMPLEMENTED[step]) {
      throw new Error(`Não implementado: tarefa ${NOT_IMPLEMENTED[step]}`);
    }
    if (!STEPS.includes(step))
      throw new Error(`subcomando desconhecido: ${step}`);
  }
  const npm = parseNpmCommand(env.RTE_NPM);
  const consumerDir = resolveConsumerDir(env, repoRoot);
  const cliEnv = { NG_CLI_ANALYTICS: 'false' };
  for (const step of argv) {
    console.log(`\n[consumer] ${step} (${consumerDir})`);
    if (step === 'pack') {
      const manifest = runPack({ repoRoot, npm, exec, fs });
      for (const p of manifest.packages) {
        console.log(`  ${p.name}@${p.version} ${p.file} ${p.integrity}`);
      }
    } else if (step === 'prepare') {
      prepareConsumer({ repoRoot, consumerDir, fs });
    } else if (step === 'install') {
      exec(npm[0], [...npm.slice(1), 'install', '--no-audit', '--no-fund'], {
        cwd: consumerDir,
      });
      const manifest = JSON.parse(
        fs.readFileSync(join(consumerDir, 'manifest.json'), 'utf8'),
      );
      const errors = verifyOrigin(consumerDir, manifest, fs, { repoRoot });
      if (errors.length) {
        throw new Error(`prova de origem reprovada:\n- ${errors.join('\n- ')}`);
      }
      console.log('  prova de origem: ok');
    } else {
      const { cmd, args, cwd } = commandsFor(step, { consumerDir });
      exec(cmd, args, { cwd, env: cliEnv });
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
