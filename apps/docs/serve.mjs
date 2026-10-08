// Servidor estático do build do site de documentação (spec 07c, X2). Node puro, como
// `apps/demo/serve.mjs`: serve o `browser/` SOB um prefixo (`--base`, padrão `/cds-text-editor/`),
// diretório → `index.html`, rota inexistente → `404.html` com status 404, só `GET`/`HEAD`. Toda
// resposta leva a CSP estrita por cabeçalho (o `index.html` repete o texto numa `<meta>`).
// Uso: node apps/docs/serve.mjs [--dir <browser/>] [--base /cds-text-editor/] [--no-csp-header]
//   (ou RTE_CONSUMER_DIR + dist/docs/browser)
// Variáveis: RTE_DOCS_PORT (padrão 4320), RTE_CONSUMER_DIR, RTE_SITE_BASE.
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A CSP do site; idêntica à do demo e à `<meta>` do `src/index.html` (`tools/docs-csp.test.mjs`). */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";

export const DEFAULT_BASE = '/cds-text-editor/';

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

/** Normaliza o prefixo: começa e termina com `/` (`/` = sem prefixo). */
export function normalizeBase(value) {
  const trimmed = (value ?? DEFAULT_BASE).trim();
  if (!trimmed.startsWith('/')) {
    throw new Error(`--base deve começar com "/": ${value}`);
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

/**
 * Decide a resposta para `url` sob `base`: `{ kind: 'redirect', location }` (a raiz sem o prefixo
 * ou o prefixo sem a barra final), `{ kind: 'file', rel }` (caminho relativo ao `browser/`;
 * diretório vira `index.html` na resolução), `{ kind: 'notFound' }` (fora do prefixo; o servidor
 * serve o `404.html` com status 404) ou `{ kind: 'bad' }` (URL malformada).
 */
export function resolveRequest(base, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url ?? '/', 'http://x').pathname);
  } catch {
    return { kind: 'bad' };
  }
  const prefix = normalizeBase(base);
  if (
    prefix !== '/' &&
    (pathname === '/' || pathname === prefix.slice(0, -1))
  ) {
    return { kind: 'redirect', location: prefix };
  }
  if (!pathname.startsWith(prefix)) return { kind: 'notFound' };
  return { kind: 'file', rel: pathname.slice(prefix.length) };
}

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

/** Diretório servido: `--dir`, senão `<RTE_CONSUMER_DIR>/dist/docs/browser`. */
export function resolveDir(argv, env) {
  const flag = argv.indexOf('--dir');
  if (flag !== -1) {
    const value = argv[flag + 1];
    if (!value) throw new Error('--dir exige um caminho');
    return resolve(value);
  }
  if (env.RTE_CONSUMER_DIR) {
    return resolve(env.RTE_CONSUMER_DIR, 'dist', 'docs', 'browser');
  }
  throw new Error(
    'informe --dir <pasta browser/> ou RTE_CONSUMER_DIR (diretório do consumidor)',
  );
}

/** Prefixo servido: `--base`, senão `RTE_SITE_BASE`, senão `/cds-text-editor/`. */
export function resolveBase(argv, env) {
  const flag = argv.indexOf('--base');
  if (flag !== -1) {
    const value = argv[flag + 1];
    if (!value) throw new Error('--base exige um prefixo');
    return normalizeBase(value);
  }
  return normalizeBase(env.RTE_SITE_BASE ?? DEFAULT_BASE);
}

/** Cria o servidor (sem escutar). `dir` é a pasta `browser/` do build. */
export function createDocsServer(
  dir,
  { base = DEFAULT_BASE, cspHeader = true } = {},
) {
  const root = resolve(dir);
  return createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (cspHeader) res.setHeader('Content-Security-Policy', CSP);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const target = resolveRequest(base, req.url);
    if (target.kind === 'bad') {
      res.writeHead(400).end();
      return;
    }
    if (target.kind === 'redirect') {
      res.writeHead(302, { Location: target.location }).end();
      return;
    }
    if (target.kind === 'file' && target.rel === '__health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }
    const file = target.kind === 'file' ? fileOf(root, target.rel) : null;
    if (!file) {
      const notFound = join(root, '404.html');
      const exists = statSync(notFound, { throwIfNoEntry: false })?.isFile();
      res.writeHead(404, {
        'Content-Type': exists ? TYPES['.html'] : 'text/plain; charset=utf-8',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(exists ? readFileSync(notFound) : 'not found');
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
  const PORT = Number(process.env['RTE_DOCS_PORT'] ?? 4320);
  const argv = process.argv.slice(2);
  let dir;
  let base;
  try {
    dir = resolveDir(argv, process.env);
    base = resolveBase(argv, process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const server = createDocsServer(dir, {
    base,
    cspHeader: !argv.includes('--no-csp-header'),
  });
  const stop = () => {
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.listen(PORT, HOST, () => {
    console.log(
      `docs em http://${HOST}:${PORT}${base} (${dir}; CSP: ${argv.includes('--no-csp-header') ? 'só a <meta>' : CSP})`,
    );
  });
}
