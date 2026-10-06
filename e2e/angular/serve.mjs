// Servidor estático do app de teste Angular (spec 05a, D22 e R11). Node puro,
// sem dependências: `/zone/…` serve o build `zone`, o resto o build zoneless;
// diretório → `index.html` (rotas pré-renderizadas); rota inexistente → 404.
// Toda resposta leva a CSP estrita por cabeçalho. Só `GET`/`HEAD`, mais o
// `POST /__upload` do envio de arquivos (spec 05c2a, E25).
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

// Rota `media` (spec 05c1, V16): além da CSP estrita, os provedores de embed e o
// host de teste de `mediaHosts` (desvio da V16 registrado no ADR 0011).
const MEDIA_HOST = 'https://media.example.test';
const MEDIA_CSP = `${CSP}; img-src 'self' ${MEDIA_HOST}; media-src 'self' ${MEDIA_HOST}; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com`;

// Rota `upload-preview` (spec 05c2a, E16/E25): a miniatura local exige `img-src blob:`.
const UPLOAD_PREVIEW_CSP = `${CSP}; img-src 'self' blob:`;

/** CSP da resposta do documento: a da rota `media` só em `/media` e `/zone/media`. */
function cspFor(pathname) {
  if (/^(?:\/zone)?\/upload-preview\/?$/.test(pathname)) {
    return UPLOAD_PREVIEW_CSP;
  }
  return /^(?:\/zone)?\/media\/?$/.test(pathname) ? MEDIA_CSP : CSP;
}

// Envio de arquivos (spec 05c2a, E25): `POST /__upload` guarda em memória o que recebe e
// responde `{ url: '/__uploads/<id>', width?, height? }`; `GET /__uploads/<id>` serve o
// arquivo com o tipo recebido; `GET /__upload/log` lista as requisições (com abortos e
// cabeçalhos). Consulta: `delay=<ms>`, `status=<código>`, `bad=json|nourl|http|srcset`,
// `slow=1` (leitura lenta do corpo, para o progresso do envio). O *endpoint* é fixo por
// editor: o atraso por arquivo vem do sufixo `__d<ms>` antes da extensão do nome.
const UPLOAD_LIMIT = 5 * 1024 * 1024;
const uploads = new Map();
const uploadLog = [];
let uploadSeq = 0;

/** Partes de um corpo `multipart/form-data` (lido à mão, sem dependências). */
function parseMultipart(buffer, boundary) {
  const parts = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(delimiter);
  while (start !== -1) {
    start += delimiter.length;
    if (buffer.subarray(start, start + 2).toString() === '--') break;
    start += 2;
    const headEnd = buffer.indexOf('\r\n\r\n', start);
    if (headEnd === -1) break;
    const next = buffer.indexOf(delimiter, headEnd + 4);
    if (next === -1) break;
    const head = buffer.subarray(start, headEnd).toString('utf8');
    parts.push({
      name: /\bname="([^"]*)"/i.exec(head)?.[1] ?? '',
      filename: /\bfilename="([^"]*)"/i.exec(head)?.[1] ?? null,
      type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? '',
      body: buffer.subarray(headEnd + 4, next - 2),
    });
    start = next;
  }
  return parts;
}

/** Largura e altura de um PNG (cabeçalho IHDR), ou `null`. */
function pngSize(body) {
  if (body.length < 24 || body.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

/** Resposta do `POST /__upload` conforme a consulta `bad`. */
function uploadBody(bad, id, size) {
  const url = `/__uploads/${id}`;
  if (bad === 'json') return 'not json';
  if (bad === 'nourl') return JSON.stringify({ width: 10 });
  if (bad === 'http')
    return JSON.stringify({ url: `http://example.test${url}` });
  if (bad === 'srcset') {
    return JSON.stringify({ url, srcset: 'javascript:alert(1) 1x' });
  }
  return JSON.stringify(size ? { url, ...size } : { url });
}

/** `POST /__upload`: lê o corpo (teto de 5 MB), espera e responde. */
function receiveUpload(req, res, query) {
  const entry = {
    id: String(++uploadSeq),
    name: '',
    kind: '',
    aborted: false,
    headers: { ...req.headers },
  };
  uploadLog.push(entry);
  const chunks = [];
  let size = 0;
  let done = false;
  res.on('close', () => {
    if (!res.writableFinished) entry.aborted = true;
  });
  const slow = query.get('slow') === '1';
  req.on('data', (chunk) => {
    if (done) return;
    size += chunk.length;
    if (size > UPLOAD_LIMIT) {
      done = true;
      res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('too large');
      req.resume();
      return;
    }
    chunks.push(chunk);
    // o nome entra no log já no começo do corpo: um envio abortado antes do
    // fim também é filtrável por nome
    if (!entry.name) {
      const head = Buffer.concat(chunks).subarray(0, 8192).toString('utf8');
      entry.name = /filename="([^"]*)"/i.exec(head)?.[1] ?? '';
    }
    if (slow) {
      req.pause();
      setTimeout(() => req.resume(), 60);
    }
  });
  req.on('end', () => {
    if (done) return;
    done = true;
    const boundary = /boundary=([^;]+)/i.exec(
      req.headers['content-type'] ?? '',
    )?.[1];
    const parts = boundary
      ? parseMultipart(Buffer.concat(chunks), boundary.replace(/^"|"$/g, ''))
      : [];
    const file = parts.find((p) => p.filename !== null);
    entry.kind = parts.find((p) => p.name === 'kind')?.body.toString() ?? '';
    entry.name = file?.filename ?? '';
    if (file) {
      uploads.set(entry.id, {
        type: file.type || 'application/octet-stream',
        body: file.body,
      });
    }
    const perFile = /__d(\d+)(?:\.[^.]*)?$/.exec(entry.name)?.[1];
    const delay = Number(query.get('delay') ?? 0) + Number(perFile ?? 0);
    setTimeout(() => {
      if (res.destroyed || entry.aborted) return;
      const status = Number(query.get('status') ?? 200);
      if (status !== 200) {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('refused');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES['.json'] });
      res.end(
        uploadBody(
          query.get('bad'),
          entry.id,
          file ? pngSize(file.body) : null,
        ),
      );
    }, delay);
  });
}

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
  '.vtt': 'text/vtt; charset=utf-8',
  '.webm': 'video/webm',
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
  res.setHeader('Cache-Control', 'no-store');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  res.setHeader('Content-Security-Policy', cspFor(pathname));
  if (pathname === '/__upload' && req.method === 'POST') {
    receiveUpload(req, res, new URL(req.url ?? '/', 'http://x').searchParams);
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
  if (pathname === '/__upload/log') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'] });
    res.end(JSON.stringify(uploadLog));
    return;
  }
  if (pathname.startsWith('/__uploads/')) {
    const stored = uploads.get(pathname.slice('/__uploads/'.length));
    if (!stored) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': stored.type });
    res.end(req.method === 'HEAD' ? undefined : stored.body);
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
