// Regressão visual local (spec 08b, O1): monta o `docker run` com a imagem oficial do Playwright
// (tag = versão exata do @playwright/test) e roda `e2e/visual` dentro dela. Sem Docker, aponta o
// workflow `visual-update.yml` (único jeito de gerar baselines válidas no Windows/macOS).
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Versão exata do `@playwright/test` no package.json (a mesma da tag da imagem). */
export function playwrightVersion(root = ROOT) {
  const spec = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    .devDependencies['@playwright/test'];
  if (!/^\d+\.\d+\.\d+$/.test(spec)) {
    throw new Error(
      `package.json: @playwright/test deve ter versão exata (está "${spec}")`,
    );
  }
  return spec;
}

/** Aspas simples para o `sh -c` do contêiner. */
function shq(text) {
  return /^[\w@%+=:,./-]+$/.test(text)
    ? text
    : `'${text.replaceAll("'", "'\\''")}'`;
}

/**
 * Argumentos do `docker` (sem o executável). O `node_modules` do contêiner é um volume nomeado:
 * o do host (Windows/macOS) tem binários nativos de outra plataforma.
 */
export function dockerArgs({ cwd, version, extra = [], ci = '' }) {
  const inner = [
    'npm i -g npm@11 >/dev/null',
    'npm ci --no-audit --no-fund',
    ['npx', 'playwright', 'test', '-c', 'e2e/visual', ...extra]
      .map(shq)
      .join(' '),
  ].join(' && ');
  return [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    '-e',
    'RTE_VISUAL_CONTAINER=1',
    '-e',
    `CI=${ci}`,
    '-e',
    'HOME=/root',
    '-v',
    `${cwd}:/work`,
    '-v',
    'rte-visual-node-modules:/work/node_modules',
    '-w',
    '/work',
    `mcr.microsoft.com/playwright:v${version}-noble`,
    'sh',
    '-c',
    inner,
  ];
}

export const NO_DOCKER_MESSAGE =
  'Docker não encontrado. A regressão visual só roda no contêiner oficial do Playwright.\n' +
  'Sem Docker, atualize as capturas pelo GitHub: Actions > "Atualizar capturas visuais" > Run workflow\n' +
  '(workflow .github/workflows/visual-update.yml) no seu branch, e depois traga o commit com `git pull`.';

/** Caminhos de PNG (absolutos) sob `dir`, recursivo. */
function pngs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? pngs(join(dir, e.name))
      : e.name.endsWith('.png')
        ? [join(dir, e.name)]
        : [],
  );
}

const key = (p) => resolve(p).replaceAll('\\', '/').toLowerCase();

/**
 * Remove as capturas ÓRFÃS: PNGs sob `roots` que nenhum teste usou na rodada (`usedFile` lista, um
 * por linha, os caminhos que `expectShot` registrou com RTE_VISUAL_USED). Sem o arquivo ou vazio,
 * não apaga nada (rodada que não rodou). Devolve os caminhos removidos.
 */
export function pruneOrphans(usedFile, roots) {
  if (!existsSync(usedFile)) return [];
  const used = new Set(
    readFileSync(usedFile, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(key),
  );
  if (!used.size) return [];
  const removed = [];
  for (const root of roots) {
    for (const file of pngs(root)) {
      if (used.has(key(file))) continue;
      rmSync(file);
      removed.push(file);
      // apaga as pastas que ficaram vazias (até a raiz, que fica)
      for (let d = dirname(file); key(d) !== key(root); d = dirname(d)) {
        if (readdirSync(d).length) break;
        rmdirSync(d);
      }
    }
  }
  return removed;
}

/** Executa; `exec(cmd, args)` devolve `{ status }` (injetável nos testes). */
export function main(argv, { exec, cwd = ROOT, log = console.error } = {}) {
  const run =
    exec ??
    ((cmd, args) =>
      spawnSync(cmd, args, {
        stdio: args[0] === 'info' ? 'ignore' : 'inherit',
        shell: false,
        windowsHide: true,
      }));
  const probe = run('docker', ['info']);
  if (probe.error || probe.status !== 0) {
    log(NO_DOCKER_MESSAGE);
    return 2;
  }
  const result = run(
    'docker',
    dockerArgs({ cwd, version: playwrightVersion(cwd), extra: argv }),
  );
  return result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, usedFile, ...roots] = process.argv.slice(2);
  if (cmd === 'prune') {
    const removed = pruneOrphans(usedFile, roots);
    for (const f of removed) console.log(`capturas órfã removida: ${f}`);
    console.log(`${removed.length} captura(s) órfã(s) removida(s).`);
  } else {
    process.exit(main(process.argv.slice(2)));
  }
}
