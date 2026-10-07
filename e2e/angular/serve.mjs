// Servidor estático do app de teste Angular (spec 05a, D22 e R11). Node puro,
// sem dependências: `/zone/…` serve o build `zone`, o resto o build zoneless;
// diretório → `index.html` (rotas pré-renderizadas); rota inexistente → 404.
// Toda resposta leva a CSP estrita por cabeçalho.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const ZONELESS = resolve(ROOT, 'dist/e2e/angular/app/browser');
const ZONE = resolve(ROOT, 'dist/e2e/angular/app-zone/browser');
const HOST = '127.0.0.1';
const PORT = Number(process.env['RTE_E2E_PORT'] ?? 4317);

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'";

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
};

function fileOf(base, rel) {
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

function resolvePath(pathname) {
  if (pathname === '/zone' || pathname.startsWith('/zone/')) {
    return fileOf(ZONE, pathname.slice('/zone'.length));
  }
  return fileOf(ZONELESS, pathname);
}

const server = createServer((req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Cache-Control', 'no-store');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
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
  const file = resolvePath(pathname);
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

server.listen(PORT, HOST, () => {
  console.log(`app de teste Angular em http://${HOST}:${PORT} (CSP: ${CSP})`);
});
