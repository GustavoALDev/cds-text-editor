// Servidor estático do app de teste Angular (spec 05a, D22 e R11). Node puro,
// sem dependências: `/zone/…` serve o build `zone`, o resto o build zoneless;
// diretório → `index.html` (rotas pré-renderizadas); rota inexistente → 404.
// Toda resposta leva a CSP estrita por cabeçalho.
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const ZONELESS = resolve(ROOT, 'dist/e2e/angular/app/browser');
const ZONE = resolve(ROOT, 'dist/e2e/angular/app-zone/browser');
const HOST = '127.0.0.1';
const PORT = Number(process.env['RTE_E2E_PORT'] ?? 4317);

// Arquivos de estilo servidos em `/__static/` e o fixture da página `/content-static` (N13, R12).
const STATIC_FILES = {
  '/__static/theme.css': resolve(ROOT, 'packages/theme/src/theme.css'),
  '/__static/content.css': resolve(ROOT, 'packages/core/styles/content.css'),
};
const FIXTURE = resolve(ROOT, 'fixtures/content/all-features.html');

/**
 * Página estática com o `all-features.html` em `.rte-root > .rte-content`, só com `theme.css` e
 * `content.css` (sem Angular, sem `editor.css`), montada em memória a cada pedido. Os atributos
 * `style` do fixture ficam bloqueados pela CSP: é o cenário da R12.
 */
function contentStaticPage() {
  const html = readFileSync(FIXTURE, 'utf8');
  return [
    '<!doctype html>',
    '<html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>content-static</title>',
    '<link rel="stylesheet" href="/__static/theme.css">',
    '<link rel="stylesheet" href="/__static/content.css">',
    '</head><body>',
    '<div class="rte-root" data-testid="content-static"><div class="rte-content">',
    html,
    '</div></div>',
    '</body></html>',
  ].join('');
}

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
  if (pathname === '/content-static') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'] });
    res.end(req.method === 'HEAD' ? undefined : contentStaticPage());
    return;
  }
  const staticFile = STATIC_FILES[pathname];
  const file = staticFile ?? resolvePath(pathname);
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
