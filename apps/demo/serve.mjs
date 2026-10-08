// Servidor estático do build do demo (spec 07b, W4). Node puro, sem dependências, como
// `e2e/angular/serve.mjs`: diretório → `index.html` (rotas pré-renderizadas), rota inexistente →
// 404, só `GET`/`HEAD`. Toda resposta leva a CSP estrita por cabeçalho (o `index.html` repete o
// mesmo texto numa `<meta>`, para hosts sem cabeçalhos).
// Uso: node apps/demo/serve.mjs [--dir <browser/>]   (ou RTE_CONSUMER_DIR + dist/demo/browser)
// Variáveis: RTE_DEMO_PORT (padrão 4318), RTE_CONSUMER_DIR.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A CSP do demo; idêntica à `<meta>` do `src/index.html` (conferida por `tools/demo-csp.test.mjs`). */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'";

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

/** Cria o servidor (sem escutar). `dir` é a pasta `browser/` do build. */
export function createDemoServer(dir) {
  const base = resolve(dir);
  return createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', CSP);
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url ?? '/', 'http://x').pathname,
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
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
  let dir;
  try {
    dir = resolveDir(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  createDemoServer(dir).listen(PORT, HOST, () => {
    console.log(`demo em http://${HOST}:${PORT} (${dir}; CSP: ${CSP})`);
  });
}
