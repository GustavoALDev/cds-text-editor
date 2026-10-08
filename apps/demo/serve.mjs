// Servidor estático do build do demo (spec 07b, W4). Node puro, sem dependências, como
// `e2e/angular/serve.mjs`: diretório → `index.html` (rotas pré-renderizadas), rota inexistente →
// 404, só `GET`/`HEAD`. Toda resposta leva a CSP estrita por cabeçalho (o `index.html` repete o
// mesmo texto numa `<meta>`, para hosts sem cabeçalhos).
// Uso: node apps/demo/serve.mjs [--dir <browser/>] [--with-server] [--no-csp-header]
//   (ou RTE_CONSUMER_DIR + dist/demo/browser)
// `--with-server` (W6): monta o `createApp` do `examples/server-node` (pasta temporária, tokens de
// desenvolvimento) em `/upload`, `/csrf` e `/media/`, e serve `demo-config.json` com
// `{"upload":"server"}`. Sem a flag, é só o estático (offline, o envio é simulado).
// `--no-csp-header`: não envia o cabeçalho (vale só a `<meta>` do `index.html`); o E2E J1 usa para
// provar que a `<meta>` basta (W4).
// Variáveis: RTE_DEMO_PORT (padrão 4318), RTE_CONSUMER_DIR.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** A CSP do demo; idêntica à `<meta>` do `src/index.html` (conferida por `tools/demo-csp.test.mjs`). */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'";

/**
 * Token *bearer* de desenvolvimento (mesmo valor de `DEV_AUTH_TOKEN` em
 * `src/app/upload/demo-config.ts`, conferido por `tools/consumer-dev.test.mjs`). Não é segredo.
 */
export const DEV_AUTH_TOKEN = 'demo-dev-token';

/** Rotas encaminhadas ao servidor de exemplo no modo `--with-server`. */
export const API_PATHS = ['/upload', '/csrf'];
export const API_PREFIXES = ['/media/'];

const SERVER_EXAMPLE = fileURLToPath(
  new URL('../../examples/server-node/server.mjs', import.meta.url),
);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
};

/** Arquivo servido para `rel` dentro de `base` (diretório → `index.html`), ou `null`. */
export function fileOf(base, rel) {
  const path = resolve(base, normalize(`.${sep}${rel}`));
  if (path !== base && !path.startsWith(base + sep)) return null;
  try {
    const stat = statSync(path);
    if (stat.isFile()) return path;
    if (stat.isDirectory()) {
      const index = join(path, 'index.html');
      if (statSync(index, { throwIfNoEntry: false })?.isFile()) return index;
    }
  } catch {
    // inexistente
  }
  return null;
}

/** Diretório servido: `--dir`, senão `<RTE_CONSUMER_DIR>/dist/demo/browser`. */
export function resolveDir(argv, env) {
  const flag = argv.indexOf('--dir');
  if (flag !== -1) {
    const value = argv[flag + 1];
    if (!value) throw new Error('--dir exige um caminho');
    return resolve(value);
  }
  if (env.RTE_CONSUMER_DIR) {
    return resolve(env.RTE_CONSUMER_DIR, 'dist', 'demo', 'browser');
  }
  throw new Error(
    'informe --dir <pasta browser/> ou RTE_CONSUMER_DIR (diretório do consumidor)',
  );
}

/** `pathname` é uma rota do servidor de exemplo (`/upload`, `/csrf`, `/media/…`). */
export function isApiPath(pathname) {
  return (
    API_PATHS.includes(pathname) ||
    API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * Monta o `createApp` do `examples/server-node` com uma pasta temporária (removida por
 * `cleanup`) e tokens de desenvolvimento. Devolve o `handler` (req, res) para `createDemoServer`.
 */
export async function createExampleApi({ mediaDir } = {}) {
  const { createApp } = await import(pathToFileURL(SERVER_EXAMPLE).href);
  const owned = mediaDir === undefined;
  const dir =
    mediaDir ?? (await mkdtemp(join(tmpdir(), 'cds-rte-demo-media-')));
  const handler = createApp({
    mediaDir: dir,
    authToken: DEV_AUTH_TOKEN,
    adminToken: `admin-${Math.random().toString(36).slice(2)}`,
  });
  return {
    handler,
    mediaDir: dir,
    cleanup: () =>
      owned ? rm(dir, { recursive: true, force: true }) : undefined,
  };
}

/**
 * Cria o servidor (sem escutar). `dir` é a pasta `browser/` do build; `api` (opcional) é o
 * handler do servidor de exemplo: liga o modo `server` (rotas da API e `demo-config.json`).
 */
export function createDemoServer(dir, { api, cspHeader = true } = {}) {
  const base = resolve(dir);
  return createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (cspHeader) res.setHeader('Content-Security-Policy', CSP);
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url ?? '/', 'http://x').pathname,
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (api && isApiPath(pathname)) {
      void api(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (api && pathname === '/demo-config.json') {
      res.writeHead(200, { 'Content-Type': TYPES['.json'] });
      res.end(req.method === 'HEAD' ? undefined : '{"upload":"server"}\n');
      return;
    }
    if (pathname === '/__health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }
    const file = fileOf(base, pathname);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const HOST = '127.0.0.1';
  const PORT = Number(process.env['RTE_DEMO_PORT'] ?? 4318);
  const argv = process.argv.slice(2);
  let dir;
  try {
    dir = resolveDir(argv, process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const example = argv.includes('--with-server')
    ? await createExampleApi()
    : null;
  const server = createDemoServer(dir, {
    api: example?.handler,
    cspHeader: !argv.includes('--no-csp-header'),
  });
  const stop = () => {
    server.close();
    Promise.resolve(example?.cleanup()).finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.listen(PORT, HOST, () => {
    console.log(
      `demo em http://${HOST}:${PORT} (${dir}; CSP: ${argv.includes('--no-csp-header') ? 'só a <meta>' : CSP})`,
    );
    if (example) {
      console.log(`modo servidor: envios gravados em ${example.mediaDir}`);
    }
  });
}
