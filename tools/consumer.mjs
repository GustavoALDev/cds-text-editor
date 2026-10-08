// Consumo por tarball (spec 07b, W2/W3): empacota os 5 pacotes, copia `apps/demo` para um
// diretório FORA do repositório, instala os tarballs ali e constrói/testa o demo como um
// consumidor externo. Node puro, sem dependências. Funções puras e executor/`fs` injetados para
// `test:tools` (nenhum teste roda npm). Uso:
//   node tools/consumer.mjs [--app demo|docs] pack prepare install test build [check-snippets]
// `--app docs` (spec 07c, X1) consome o site de documentação (`apps/docs`); o padrão é `demo`.
//   --versions <arquivo.json>  (prepare/install, spec 08a) reescreve, só na cópia, as versões de
//   @angular/* e @tiptap/* para as de uma perna da matriz (`tools/compat.mjs versions`).
// Variáveis: RTE_CONSUMER_DIR (diretório do consumidor), RTE_NPM (npm a usar; padrão `npm`,
// localmente `npx -y npm@11`), RUNNER_TEMP/TMPDIR (padrão do diretório do consumidor).
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classify } from './compat.mjs';

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
const LONG_RUNNING = ['dev', 'serve'];
const CHECKS = ['check-snippets'];
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
/** Apps consumidores e o que mais não vai de cada um (o `content/` do site é lido só pelo `docs-content`). */
export const APPS = ['demo', 'docs'];
export const APP_EXCLUDE = { demo: [], docs: ['content'] };
/** Conteúdo gerado do site (`tools/docs-content.mjs`), copiado para `<consumidor>/src/generated/`. */
export const DOCS_GENERATED = join('dist', 'docs-content');

const toSlash = (path) => path.replaceAll('\\', '/');

/** `child` é o próprio `parent` ou está dentro dele (insensível a maiúsculas no Windows). */
function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Marca gravada na criação do consumidor: só um diretório com ela pode ser apagado pelo `prepare`. */
export const CONSUMER_MARK = '.cds-rte-consumer';

/**
 * `realpath` do caminho; se não existir, o do ancestral existente mais próximo seguido do resto
 * (a pasta ainda não criada pode estar sob um link que aponta para dentro do repositório).
 */
export function realOrSelf(path, fs = nodeFs) {
  const native = fs.realpathSync.native ?? fs.realpathSync;
  let current = resolve(path);
  const rest = [];
  for (;;) {
    try {
      return join(native(current), ...[...rest].reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      rest.push(basename(current));
      current = parent;
    }
  }
}

/** Recusa consumidor dentro do repositório ou que o contenha, pelo texto e pelo `realpath`. */
export function assertOutsideRepo(consumerDir, repoRoot, fs = nodeFs) {
  const pairs = [
    [repoRoot, consumerDir],
    [realOrSelf(repoRoot, fs), realOrSelf(consumerDir, fs)],
  ];
  for (const [repo, dir] of pairs) {
    if (isInside(repo, dir)) {
      throw new Error(
        `o diretório do consumidor (${consumerDir}) fica dentro do repositório: use um diretório fora dele (RTE_CONSUMER_DIR)`,
      );
    }
    if (isInside(dir, repo)) {
      throw new Error(
        `o diretório do consumidor (${consumerDir}) contém o repositório: use um diretório fora dele (RTE_CONSUMER_DIR)`,
      );
    }
  }
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
export function resolveConsumerDir(env, repoRoot, fs = nodeFs, app = 'demo') {
  let dir;
  if (env.RTE_CONSUMER_DIR) {
    dir = resolve(env.RTE_CONSUMER_DIR);
  } else {
    const base =
      env.CI && env.RUNNER_TEMP
        ? env.RUNNER_TEMP
        : (env.TMPDIR ?? env.RUNNER_TEMP ?? tmpdir());
    dir = join(resolve(base), 'cds-rte-consumer', app);
  }
  assertOutsideRepo(dir, repoRoot, fs);
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
 * Versões de uma perna da matriz (spec 08a): `@angular/*` do *framework* na `angular.version`,
 * ferramentas (`cli`, `build`, `ssr`, `@angular-devkit/*`, `@schematics/angular`) na
 * `angular.toolingVersion` e `@tiptap/*` na `tiptap.version`. Não muta a entrada.
 */
export function applyVersions(pkg, versions) {
  const out = structuredClone(pkg);
  const target = {
    framework: versions.angular.version,
    tooling: versions.angular.toolingVersion,
    tiptap: versions.tiptap.version,
  };
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(out[field] ?? {})) {
      const family = classify(name);
      if (family) out[field][name] = target[family];
    }
  }
  return out;
}

/** Lê o arquivo de `--versions` e confere o formato mínimo. */
export function readVersions(path, fs = nodeFs) {
  const versions = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (
    !versions.angular?.version ||
    !versions.angular?.toolingVersion ||
    !versions.tiptap?.version
  ) {
    throw new Error(
      `${path}: --versions precisa de angular.version, angular.toolingVersion e tiptap.version`,
    );
  }
  return versions;
}

/**
 * Copia `apps/demo` para o consumidor e reescreve o `package.json`. Limpa o consumidor antes,
 * mas preserva o `node_modules` de terceiros (só `@cds` e o lockfile oculto saem, para o
 * npm reinstalar os tarballs novos). Só apaga um diretório com a marca `.cds-rte-consumer`
 * (gravada na criação); um diretório não vazio sem a marca é recusado.
 */
export function prepareConsumer({
  repoRoot,
  consumerDir,
  fs = nodeFs,
  versions,
  app = 'demo',
}) {
  if (!APPS.includes(app)) throw new Error(`app desconhecido: ${app}`);
  assertOutsideRepo(consumerDir, repoRoot, fs);
  if (fs.existsSync(consumerDir)) {
    const entries = fs.readdirSync(consumerDir);
    if (entries.length && !entries.includes(CONSUMER_MARK)) {
      throw new Error(
        `${consumerDir} não está vazio e não tem a marca ${CONSUMER_MARK}: o "prepare" não apaga o que não criou (use um diretório novo ou vazio em RTE_CONSUMER_DIR)`,
      );
    }
  }
  const tarballDir = join(repoRoot, 'dist', 'tarballs');
  const manifestPath = join(tarballDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${manifestPath} não existe: rode "pack" antes`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const demo = join(repoRoot, 'apps', app);
  const generated = join(repoRoot, DOCS_GENERATED);
  if (app === 'docs' && !fs.existsSync(generated)) {
    throw new Error(
      `${generated} não existe: rode "node tools/docs-content.mjs" (docs-content) antes`,
    );
  }

  fs.mkdirSync(consumerDir, { recursive: true });
  fs.writeFileSync(
    join(consumerDir, CONSUMER_MARK),
    'Criado por tools/consumer.mjs; pode ser apagado pelo "prepare".\n',
  );
  for (const name of fs.readdirSync(consumerDir)) {
    if (name !== 'node_modules' && name !== CONSUMER_MARK) {
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
      return (
        !APP_EXCLUDE[app].includes(parts[0]) &&
        !parts.some((part) => COPY_EXCLUDE.has(part))
      );
    },
  });
  if (app === 'docs') {
    fs.cpSync(generated, join(consumerDir, 'src', 'generated'), {
      recursive: true,
    });
  }
  let pkg = JSON.parse(fs.readFileSync(join(demo, 'package.json'), 'utf8'));
  if (versions) pkg = applyVersions(pkg, versions);
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
export function verifyOrigin(
  consumerDir,
  manifest,
  fs,
  { repoRoot, versions },
) {
  const real = (path) => (fs.realpathSync.native ?? fs.realpathSync)(path);
  try {
    assertOutsideRepo(consumerDir, repoRoot, fs);
  } catch (error) {
    return [`${error.message}: a prova de origem não vale`];
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
  // Um `node_modules` num ancestral deixaria o Node/esbuild resolver pacotes de fora do consumidor.
  for (let dir = dirname(dirname(modulesReal)); ; dir = dirname(dir)) {
    if (fs.existsSync(join(dir, 'node_modules'))) {
      errors.push(
        `há um node_modules em ${dir}, ancestral do consumidor: a resolução pode escapar do consumidor; use outro RTE_CONSUMER_DIR`,
      );
    }
    if (dirname(dir) === dir) break;
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
  if (versions) {
    const expected = {
      '@angular/core': versions.angular.version,
      '@tiptap/core': versions.tiptap.version,
    };
    for (const [name, want] of Object.entries(expected)) {
      let found;
      try {
        found = JSON.parse(
          fs.readFileSync(join(modules, name, 'package.json'), 'utf8'),
        ).version;
      } catch {
        found = undefined;
      }
      if (found !== want) {
        errors.push(
          `${name}: versão instalada ${found ?? '(ausente)'} difere da da perna (${want}, --versions)`,
        );
      }
    }
  }
  return errors;
}

/** Comando de `build`/`test` do Angular CLI do consumidor, sem `npx` (o `ng.js` local). */
export function commandsFor(step, { consumerDir, baseHref }) {
  const ng = join(
    consumerDir,
    'node_modules',
    '@angular',
    'cli',
    'bin',
    'ng.js',
  );
  const args = {
    build: ['build', ...(baseHref ? ['--base-href', baseHref] : [])],
    test: ['test', '--watch=false'],
  }[step];
  if (!args) throw new Error(`subcomando sem comando de CLI: ${step}`);
  return { cmd: process.execPath, args: [ng, ...args], cwd: consumerDir };
}

/**
 * O Angular grava o HTML pré-renderizado em `browser/<base>/…` (`<base href>` com prefixo) e os
 * arquivos estáticos em `browser/`, e não gera `404.html` para a `**` (achado da 07c, X7).
 * Esta etapa deixa `browser/` como a raiz publicável: sobe o conteúdo de `browser/<base>/` para
 * `browser/` e copia a rota pré-renderizada `404/index.html` para `404.html`. Devolve o que fez.
 */
export function flattenPrerender(browserDir, fs = nodeFs) {
  const done = [];
  let base = '/';
  try {
    const csr = fs.readFileSync(join(browserDir, 'index.csr.html'), 'utf8');
    base = /<base\s+href="([^"]*)"/.exec(csr)?.[1] ?? '/';
  } catch {
    // sem index.csr.html: nada sobre a base
  }
  const segments = base.split('/').filter(Boolean);
  if (segments.length) {
    const nested = join(browserDir, ...segments);
    if (fs.existsSync(nested)) {
      for (const name of fs.readdirSync(nested)) {
        fs.cpSync(join(nested, name), join(browserDir, name), {
          recursive: true,
          force: true,
        });
      }
      fs.rmSync(join(browserDir, segments[0]), {
        recursive: true,
        force: true,
      });
      done.push(`${segments.join('/')}/ → raiz`);
    }
  }
  const notFound = join(browserDir, '404', 'index.html');
  if (fs.existsSync(notFound)) {
    fs.copyFileSync(notFound, join(browserDir, '404.html'));
    done.push('404.html');
  }
  return done;
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
  let app = 'demo';
  const appFlag = argv.indexOf('--app');
  if (appFlag !== -1) {
    app = argv[appFlag + 1] ?? '';
    if (!APPS.includes(app)) {
      throw new Error(`--app inválido: "${app}" (use ${APPS.join(' ou ')})`);
    }
    argv = argv.filter((_, i) => i !== appFlag && i !== appFlag + 1);
  }
  // `--versions <arquivo>` leva um valor; as demais opções são só marcas.
  const versionsAt = argv.indexOf('--versions');
  if (versionsAt >= 0 && !argv[versionsAt + 1]?.trim()) {
    throw new Error('--versions precisa do caminho de um arquivo JSON');
  }
  const versionsPath = versionsAt >= 0 ? argv[versionsAt + 1] : undefined;
  if (versionsAt >= 0) {
    argv = argv.filter((_, i) => i !== versionsAt && i !== versionsAt + 1);
  }
  const flags = argv.filter((arg) => arg.startsWith('--'));
  argv = argv.filter((arg) => !arg.startsWith('--'));
  const versions = versionsPath
    ? readVersions(versionsPath, deps.fs ?? nodeFs)
    : undefined;
  const exec = deps.exec ?? defaultExec;
  const repoRoot = deps.repoRoot ?? REPO_ROOT;
  const fs = deps.fs ?? nodeFs;
  if (!argv.length) {
    throw new Error(
      `uso: node tools/consumer.mjs <${[...STEPS, ...LONG_RUNNING, ...CHECKS].join('|')}>...`,
    );
  }
  for (const step of argv) {
    if (
      !STEPS.includes(step) &&
      !LONG_RUNNING.includes(step) &&
      !CHECKS.includes(step)
    )
      throw new Error(`subcomando desconhecido: ${step}`);
  }
  if (app !== 'demo') {
    for (const step of argv) {
      if (CHECKS.includes(step) || LONG_RUNNING.includes(step)) {
        throw new Error(`"${step}" só existe para o demo (--app ${app})`);
      }
    }
  }
  const npm = parseNpmCommand(env.RTE_NPM);
  const consumerDir = resolveConsumerDir(env, repoRoot, fs, app);
  const cliEnv = { NG_CLI_ANALYTICS: 'false' };
  for (const step of argv) {
    console.log(`\n[consumer] ${step} (${consumerDir})`);
    if (step === 'pack') {
      const manifest = runPack({ repoRoot, npm, exec, fs });
      for (const p of manifest.packages) {
        console.log(`  ${p.name}@${p.version} ${p.file} ${p.integrity}`);
      }
    } else if (step === 'prepare') {
      prepareConsumer({ repoRoot, consumerDir, fs, versions, app });
    } else if (step === 'install') {
      const legacy =
        flags.includes('--legacy-peer-deps') || versions?.legacyPeerDeps;
      exec(
        npm[0],
        [
          ...npm.slice(1),
          'install',
          '--no-audit',
          '--no-fund',
          ...(legacy ? ['--legacy-peer-deps'] : []),
        ],
        { cwd: consumerDir },
      );
      const manifest = JSON.parse(
        fs.readFileSync(join(consumerDir, 'manifest.json'), 'utf8'),
      );
      const errors = verifyOrigin(consumerDir, manifest, fs, {
        repoRoot,
        versions,
      });
      if (errors.length) {
        throw new Error(`prova de origem reprovada:\n- ${errors.join('\n- ')}`);
      }
      console.log('  prova de origem: ok');
    } else if (step === 'check-snippets') {
      await runCheckSnippets({ consumerDir, exec, fs, env: cliEnv });
    } else if (step === 'serve') {
      runServe({ repoRoot, consumerDir, env, flags, exec });
    } else if (step === 'dev') {
      await runDev({ repoRoot, consumerDir, env, fs, spawn: deps.spawn });
    } else {
      const baseHref = app === 'docs' ? env.RTE_SITE_BASE : undefined;
      const { cmd, args, cwd } = commandsFor(step, { consumerDir, baseHref });
      exec(cmd, args, { cwd, env: cliEnv });
      if (app === 'docs' && step === 'build') {
        const done = flattenPrerender(
          join(consumerDir, 'dist', 'docs', 'browser'),
          fs,
        );
        console.log(`  site achatado: ${done.join(', ') || 'nada a fazer'}`);
      }
    }
  }
}

// ---- dev e serve (spec 07b, W6) -------------------------------------------------------------

/** Porta do servidor de exemplo no `dev` (o *proxy* do demo aponta para 3000). */
export const DEV_SERVER_PORT = 3000;
/** Endereço de escuta padrão do `dev` (só o loopback); `HOST` o troca. */
export const DEV_HOST = '127.0.0.1';

/** Argumentos de `node apps/demo/serve.mjs`: pasta `browser/` do consumidor e `--with-server`. */
export function serveArgs({ repoRoot, consumerDir, withServer }) {
  return [
    join(repoRoot, 'apps', 'demo', 'serve.mjs'),
    '--dir',
    join(consumerDir, 'dist', 'demo', 'browser'),
    ...(withServer ? ['--with-server'] : []),
  ];
}

/** Argumentos do `ng serve` do consumidor com o *proxy* (arquivo relativo ao `cwd`). */
export function ngServeArgs({
  consumerDir,
  proxyConfig = 'proxy.conf.json',
  port,
  host,
}) {
  const ng = join(
    consumerDir,
    'node_modules',
    '@angular',
    'cli',
    'bin',
    'ng.js',
  );
  return [
    ng,
    'serve',
    '--proxy-config',
    proxyConfig,
    ...(port ? ['--port', String(port)] : []),
    ...(host ? ['--host', host] : []),
  ];
}

/** Reaponta o destino do *proxy* (`localhost:3000`) para o servidor de exemplo (porta e endereço). */
export function retargetProxy(config, serverPort, host = DEV_HOST) {
  const out = structuredClone(config);
  const target = host === '0.0.0.0' || host === '::' ? DEV_HOST : host;
  for (const entry of Object.values(out)) {
    entry.target = `http://${target.includes(':') ? `[${target}]` : target}:${serverPort}`;
  }
  return out;
}

/** Variáveis do servidor de exemplo no `dev`: pasta temporária, endereço e tokens da execução. */
export function exampleServerEnv({
  mediaDir,
  port,
  host = DEV_HOST,
  authToken,
  adminToken,
}) {
  return {
    PORT: String(port),
    HOST: host,
    MEDIA_DIR: mediaDir,
    AUTH_TOKEN: authToken,
    ADMIN_TOKEN: adminToken,
  };
}

/** `consumer.mjs serve [--with-server]`: serve o `browser/` do consumidor (sem `ng`). */
function runServe({ repoRoot, consumerDir, env, flags, exec }) {
  exec(
    process.execPath,
    serveArgs({
      repoRoot,
      consumerDir,
      withServer: flags.includes('--with-server'),
    }),
    { cwd: repoRoot, env },
  );
}

/**
 * `consumer.mjs dev`: `ng serve` do consumidor com *proxy* (`/upload`, `/csrf`, `/media/`) e o
 * servidor de exemplo ao lado (ambos só em `HOST`, padrão 127.0.0.1); `demo-config.json` do
 * consumidor passa a dizer `server` e a levar um *token* gerado nesta execução (não fica no
 * bundle). Segue até o `ng serve` terminar; derruba o servidor, apaga a pasta temporária e
 * restaura o `public/demo-config.json` original ao fim.
 */
export async function runDev({ repoRoot, consumerDir, env, fs, spawn }) {
  const run = spawn ?? (await import('node:child_process')).spawn;
  const serverPort = Number(env.RTE_SERVER_PORT ?? DEV_SERVER_PORT);
  const port = env.RTE_DEMO_PORT ? Number(env.RTE_DEMO_PORT) : undefined;
  const host = env.HOST || DEV_HOST;
  const authToken = randomBytes(16).toString('hex');
  const ng = join(
    consumerDir,
    'node_modules',
    '@angular',
    'cli',
    'bin',
    'ng.js',
  );
  if (!fs.existsSync(ng)) {
    throw new Error(`${ng} não existe: rode "pack prepare install" antes`);
  }
  const proxy = retargetProxy(
    JSON.parse(fs.readFileSync(join(consumerDir, 'proxy.conf.json'), 'utf8')),
    serverPort,
    host,
  );
  fs.writeFileSync(
    join(consumerDir, 'proxy.dev.json'),
    `${JSON.stringify(proxy, null, 2)}\n`,
  );
  fs.mkdirSync(join(consumerDir, 'public'), { recursive: true });
  const configPath = join(consumerDir, 'public', 'demo-config.json');
  const previousConfig = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, 'utf8')
    : null;
  fs.writeFileSync(
    configPath,
    `${JSON.stringify({ upload: 'server', authToken })}\n`,
  );
  const mediaDir = fs.mkdtempSync(join(tmpdir(), 'cds-rte-dev-media-'));
  const server = run(
    process.execPath,
    [join(repoRoot, 'examples', 'server-node', 'server.mjs')],
    {
      env: {
        ...process.env,
        ...exampleServerEnv({
          mediaDir,
          port: serverPort,
          host,
          authToken,
          adminToken: randomBytes(16).toString('hex'),
        }),
      },
      stdio: 'inherit',
    },
  );
  const ngServe = run(
    process.execPath,
    ngServeArgs({ consumerDir, proxyConfig: 'proxy.dev.json', port, host }),
    {
      cwd: consumerDir,
      env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
      stdio: 'inherit',
    },
  );
  const stop = () => {
    server.kill();
    ngServe.kill();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await new Promise((resolveExit) => ngServe.once('exit', resolveExit));
  } finally {
    server.kill();
    fs.rmSync(mediaDir, { recursive: true, force: true });
    fs.rmSync(join(consumerDir, 'proxy.dev.json'), { force: true });
    if (previousConfig === null) fs.rmSync(configPath, { force: true });
    else fs.writeFileSync(configPath, previousConfig);
  }
}

// ---- check-snippets (spec 07b, W13) ---------------------------------------------------------

/** Pasta (dentro do consumidor) onde os *snippets* TypeScript e o `tsconfig` ficam. */
export const SNIPPETS_DIR = 'check-snippets';
/** Estado do tema próprio (cor oklch, raio e densidade fora do padrão, neutros cinza, `secondary` inválida). */
export const CUSTOM_STATE = {
  primary: 'oklch(0.6 0.2 250)',
  secondary: 'banana',
  mode: 'dark',
  neutral: 'gray',
  radius: 2,
  density: 0.9,
};

/**
 * Casos dos *snippets*: um por preset (`applyPreset` sobre o estado padrão) e o tema próprio.
 * `model` é o módulo `model` do playground (`DEFAULT_STATE`, `PRESET_NAMES`, `applyPreset`).
 */
export function snippetCases(model) {
  return [
    ...model.PRESET_NAMES.map((name) => ({
      name: `preset-${name}`,
      state: model.applyPreset(model.DEFAULT_STATE, name),
    })),
    {
      name: 'custom',
      state: { ...model.DEFAULT_STATE, ...CUSTOM_STATE },
    },
  ];
}

/** Arquivos `.ts` (um módulo por caso) com o texto que `buildTs` gera para cada estado. */
export function snippetFiles(cases, buildTs) {
  return cases.map(({ name, state }) => ({
    file: `${name}.ts`,
    content: buildTs(state),
  }));
}

/** `tsconfig` estrito dos *snippets*: só os `.ts` da pasta (não o `gen/` transpilado). */
export function snippetsTsconfig() {
  return {
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: 'ES2022',
      module: 'preserve',
      moduleResolution: 'bundler',
      lib: ['ES2022', 'dom'],
      types: [],
      experimentalDecorators: true,
    },
    include: ['*.ts'],
  };
}

/** Importações relativas sem extensão viram `.mjs` (a saída transpilada roda direto no Node). */
export function withMjsImports(js) {
  return js.replace(
    /(\bfrom\s*)(['"])(\.{1,2}\/[^'"\n]+?)\2/g,
    (_all, from, quote, spec) =>
      `${from}${quote}${/\.m?js$/.test(spec) ? spec : `${spec}.mjs`}${quote}`,
  );
}

/** Comando do `tsc --noEmit` estrito do consumidor sobre a pasta dos *snippets*. */
export function tscCommand({ consumerDir }) {
  const tsc = join(consumerDir, 'node_modules', 'typescript', 'bin', 'tsc');
  return {
    cmd: process.execPath,
    args: [tsc, '-p', join(SNIPPETS_DIR, 'tsconfig.json'), '--noEmit'],
    cwd: consumerDir,
  };
}

/**
 * Grava os *snippets* TypeScript dos 5 presets e do tema próprio em `<consumidor>/check-snippets/`
 * e roda o `tsc --noEmit` estrito contra os tipos dos tarballs. O texto vem do `buildTs` real do
 * demo, transpilado com o `typescript` do consumidor.
 */
export async function runCheckSnippets({
  consumerDir,
  exec,
  fs = nodeFs,
  env,
}) {
  const source = join(consumerDir, 'src', 'app', 'theme-playground');
  if (!fs.existsSync(join(source, 'ts-snippet.ts'))) {
    throw new Error(`${source} não existe: rode "prepare" antes`);
  }
  const ts = createRequire(join(consumerDir, 'package.json'))('typescript');
  const out = join(consumerDir, SNIPPETS_DIR);
  const gen = join(out, 'gen');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(gen, { recursive: true });
  for (const name of ['model', 'ts-snippet']) {
    const { outputText } = ts.transpileModule(
      fs.readFileSync(join(source, `${name}.ts`), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.ES2022,
          target: ts.ScriptTarget.ES2022,
        },
      },
    );
    fs.writeFileSync(join(gen, `${name}.mjs`), withMjsImports(outputText));
  }
  const model = await import(pathToFileURL(join(gen, 'model.mjs')).href);
  const { buildTs } = await import(
    pathToFileURL(join(gen, 'ts-snippet.mjs')).href
  );
  const files = snippetFiles(snippetCases(model), buildTs);
  for (const { file, content } of files) {
    fs.writeFileSync(join(out, file), content);
  }
  fs.writeFileSync(
    join(out, 'tsconfig.json'),
    `${JSON.stringify(snippetsTsconfig(), null, 2)}\n`,
  );
  console.log(
    `  ${files.length} snippets: ${files.map((f) => f.file).join(', ')}`,
  );
  const { cmd, args, cwd } = tscCommand({ consumerDir });
  exec(cmd, args, { cwd, env });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
