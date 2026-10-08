// Servidor de exemplo (REFERÊNCIA, não produto). Sem dependências: Node >= 22.
import { createServer } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { dimensions, sniff } from './sniff.mjs';

/**
 * @typedef {object} Options
 * @property {string} mediaDir pasta de armazenamento
 * @property {number} [maxBytes] limite por arquivo (padrão 10 MiB)
 * @property {number} [maxPixels] teto de largura x altura de imagem (padrão 40 Mpx; recusa bombas de descompressão)
 * @property {number} [maxConcurrentUploads] envios simultâneos (padrão 4; acima disso, 503)
 * @property {string} [publicPath] prefixo das URLs devolvidas (padrão `/media/`)
 * @property {string} [authToken] `Authorization: Bearer <token>` exigido em /upload, /csrf e /content (obrigatório, a menos que `allowAnon`)
 * @property {boolean} [allowAnon] opt-out explícito: aceita envio anônimo quando não há `authToken` (só desenvolvimento)
 * @property {string} adminToken token das rotas de administração (obrigatório)
 * @property {(req: import('node:http').IncomingMessage) => string} [sessionOf] identificador da sessão ao qual o token CSRF se liga (padrão: o token bearer)
 * @property {string} [csrfSecret] segredo do HMAC do token CSRF (padrão: aleatório por processo)
 * @property {boolean} [cookieSecure] cookie `__Host-csrf` com `Secure` (use atrás de https)
 * @property {number} [orphanGraceMs] carência padrão da limpeza de órfãs (padrão 7 dias, o mesmo do rascunho)
 * @property {(html: string) => string | Promise<string>} [sanitize] sanitizador do HTML de /content
 */

const NAME = /^[a-f0-9]{32}\.(png|jpg|gif|webp|webm|mp4)$/;
const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  webm: 'video/webm',
  mp4: 'video/mp4',
};
/** Vida do rascunho no navegador (7 dias); a carência das órfãs nunca deve ser menor. */
const DEFAULT_GRACE_MS = 7 * 24 * 3600 * 1000;

const same = (/** @type {string} */ a, /** @type {string} */ b) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * `Range` de um só intervalo -> `{ start, end }` (inclusivo), `null` (sem Range ou formato que
 * ignoramos: responde 200 inteiro) ou `'invalid'` (416).
 * @param {string | undefined} header @param {number} size
 */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

/** @param {Options} o */
export function createApp(o) {
  if (!o.authToken && o.allowAnon !== true)
    throw new Error(
      'Defina authToken (ou, só em desenvolvimento, allowAnon: true): sem ele qualquer pessoa envia arquivos.',
    );
  const maxBytes = o.maxBytes ?? 10 * 1024 * 1024;
  const maxPixels = o.maxPixels ?? 40_000_000;
  const maxConcurrent = o.maxConcurrentUploads ?? 4;
  const graceDefault = o.orphanGraceMs ?? DEFAULT_GRACE_MS;
  const prefix = o.publicPath ?? '/media/';
  const csrfSecret = o.csrfSecret ?? randomBytes(32).toString('hex');
  // `__Host-` exige `Secure`, `Path=/` e nenhum `Domain`: o cookie não pode ser plantado por um subdomínio.
  const cookieName = o.cookieSecure ? '__Host-csrf' : 'csrf';
  let active = 0;

  /** @type {(res: import('node:http').ServerResponse, status: number, body: unknown) => void} */
  const json = (res, status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    });
    res.end(JSON.stringify(body));
  };
  const bearer = (/** @type {import('node:http').IncomingMessage} */ req) =>
    /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
  // TODO(integrador): troque por sua sessão real (cookie de sessão ou JWT); aqui é só um stub.
  const authed = (/** @type {import('node:http').IncomingMessage} */ req) =>
    !o.authToken || same(bearer(req), o.authToken);
  const admin = (/** @type {import('node:http').IncomingMessage} */ req) =>
    same(bearer(req), o.adminToken);

  const sessionOf = o.sessionOf ?? bearer;
  const sign = (
    /** @type {string} */ nonce,
    /** @type {import('node:http').IncomingMessage} */ req,
  ) =>
    createHmac('sha256', csrfSecret)
      .update(`${nonce}|${sessionOf(req)}`)
      .digest('hex');
  /** valor do cookie de nome exato `name` (sem casar `xcsrf` nem prefixo), ou ''. */
  const cookieOf = (
    /** @type {import('node:http').IncomingMessage} */ req,
    /** @type {string} */ name,
  ) => {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const i = part.indexOf('=');
      if (i !== -1 && part.slice(0, i).trim() === name)
        return part.slice(i + 1).trim();
    }
    return '';
  };
  // Token ligado à sessão: `nonce.HMAC(segredo, nonce|sessão)`, mais o double-submit com o cookie.
  // Um cookie plantado por um subdomínio não vale: o atacante não sabe assinar para a sessão da vítima.
  const csrfOk = (/** @type {import('node:http').IncomingMessage} */ req) => {
    const header = String(req.headers['x-csrf-token'] ?? '');
    const m = /^([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(header);
    return (
      m !== null &&
      same(header, cookieOf(req, cookieName)) &&
      same(m[2], sign(m[1], req))
    );
  };

  /** lê o corpo com limite, durante a leitura. */
  const readBody = (
    /** @type {import('node:http').IncomingMessage} */ req,
    /** @type {number} */ limit,
  ) =>
    new Promise((/** @type {(b: Buffer | null) => void} */ resolve, reject) => {
      const chunks = [];
      let n = 0;
      req.on('data', (c) => {
        n += c.length;
        if (n > limit) {
          resolve(null);
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  const readJson = async (
    /** @type {import('node:http').IncomingMessage} */ req,
  ) => {
    const b = await readBody(req, 1024 * 1024);
    if (!b) return null;
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return null;
    }
  };

  /** nome do arquivo a partir de URL (relativa ou absoluta) ou nome; null se inválido. */
  const nameOf = (/** @type {unknown} */ u) => {
    if (typeof u !== 'string') return null;
    let p = u;
    try {
      p = new URL(u, 'http://x').pathname;
    } catch {
      /* usa como veio */
    }
    const n = p.startsWith(prefix) ? p.slice(prefix.length) : p;
    return NAME.test(n) ? n : null;
  };

  /** Remove arquivos mais velhos que `graceMs` (relógio do armazenamento: mtime). */
  async function removeFiles(
    /** @type {string[]} */ names,
    graceMs,
    dryRun,
    max,
  ) {
    const removed = [],
      skipped = [];
    for (const n of names) {
      if (removed.length >= max) {
        skipped.push(n);
        continue;
      }
      const st = await stat(join(o.mediaDir, n)).catch(() => null);
      if (!st || Date.now() - st.mtimeMs < graceMs) {
        skipped.push(n);
        continue;
      }
      if (!dryRun) await unlink(join(o.mediaDir, n));
      removed.push(n);
    }
    return { removed, skipped, dryRun };
  }

  async function upload(req, res) {
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
    if (!csrfOk(req)) return json(res, 403, { error: 'csrf' });
    if (active >= maxConcurrent) {
      res.setHeader('retry-after', '1');
      return json(res, 503, { error: 'busy' });
    }
    active++;
    try {
      return await receive(req, res);
    } finally {
      active--;
    }
  }

  async function receive(req, res) {
    const len = Number(req.headers['content-length']);
    // margem para o envelope multipart
    if (Number.isFinite(len) && len > maxBytes + 4096)
      return json(res, 413, { error: 'too_large' });
    const type = req.headers['content-type'] ?? '';
    if (!/^multipart\/form-data/i.test(type))
      return json(res, 415, { error: 'multipart_required' });
    const body = await readBody(req, maxBytes + 4096);
    if (!body) return json(res, 413, { error: 'too_large' });
    let form;
    try {
      form = await new Response(body, {
        headers: { 'content-type': type },
      }).formData();
    } catch {
      return json(res, 400, { error: 'bad_multipart' });
    }
    const file = form.get('file');
    if (!(file instanceof File))
      return json(res, 400, { error: 'file_missing' });
    if (file.size > maxBytes) return json(res, 413, { error: 'too_large' });
    const bytes = Buffer.from(await file.arrayBuffer());
    const t = sniff(bytes);
    if (!t) return json(res, 415, { error: 'unsupported_type' });
    const kind = form.get('kind');
    if (kind !== null && kind !== t.kind)
      return json(res, 415, { error: 'kind_mismatch' });
    const size = t.kind === 'image' ? dimensions(bytes, t) : null;
    if (t.kind === 'image') {
      // Sem dimensões legíveis não há como medir o custo de decodificar: recusa.
      if (!size || size.width < 1 || size.height < 1)
        return json(res, 415, { error: 'unreadable_image' });
      if (size.width * size.height > maxPixels)
        return json(res, 413, { error: 'too_many_pixels' });
    }
    const name = `${randomBytes(16).toString('hex')}.${t.ext}`;
    await mkdir(o.mediaDir, { recursive: true });
    await writeFile(join(o.mediaDir, name), bytes, { flag: 'wx' });
    // Formato esperado por `httpUploadAdapter`: { url, width?, height?, srcset?, sizes?, poster? }
    json(res, 201, { url: prefix + name, ...(size ?? {}) });
  }

  async function serve(req, name, res, head) {
    const path = join(o.mediaDir, name);
    const st = await stat(path).catch(() => null);
    if (!st) return json(res, 404, { error: 'not_found' });
    const range = parseRange(req.headers.range, st.size);
    if (range === 'invalid') {
      res.writeHead(416, { 'content-range': `bytes */${st.size}` });
      return res.end();
    }
    const headers = {
      'content-type':
        MIME[/** @type {keyof typeof MIME} */ (name.split('.')[1])],
      'accept-ranges': 'bytes',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'cross-origin',
      'cache-control': 'public, max-age=31536000, immutable',
    };
    if (range) {
      res.writeHead(206, {
        ...headers,
        'content-length': range.end - range.start + 1,
        'content-range': `bytes ${range.start}-${range.end}/${st.size}`,
      });
    } else {
      res.writeHead(200, { ...headers, 'content-length': st.size });
    }
    if (head) return res.end();
    await pipeline(createReadStream(path, range ?? undefined), res).catch(() =>
      res.destroy(),
    );
  }

  return async function handler(req, res) {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://x');
      const m = req.method ?? 'GET';
      if (m === 'GET' && pathname === '/csrf') {
        // Exige a mesma autenticação do envio: o token é ligado à sessão de quem o pede.
        if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
        const nonce = randomBytes(16).toString('hex');
        const token = `${nonce}.${sign(nonce, req)}`;
        res.setHeader(
          'set-cookie',
          `${cookieName}=${token}; Path=/; SameSite=Strict; HttpOnly${
            o.cookieSecure ? '; Secure' : ''
          }`,
        );
        res.setHeader('cache-control', 'no-store');
        return json(res, 200, { token });
      }
      if (m === 'POST' && pathname === '/upload') return await upload(req, res);
      if ((m === 'GET' || m === 'HEAD') && pathname.startsWith(prefix)) {
        const name = nameOf(pathname);
        return name
          ? await serve(req, name, res, m === 'HEAD')
          : json(res, 404, { error: 'not_found' });
      }
      if (m === 'POST' && pathname === '/content') {
        if (!authed(req) || !csrfOk(req))
          return json(res, 403, { error: 'forbidden' });
        const data = await readJson(req);
        if (typeof data?.html !== 'string')
          return json(res, 400, { error: 'html_missing' });
        if (!o.sanitize)
          return json(res, 501, { error: 'sanitizer_not_configured' });
        // Aqui você gravaria o HTML sanitizado no seu banco.
        return json(res, 200, { html: await o.sanitize(data.html) });
      }
      if (pathname === '/media' || pathname === '/media/cleanup') {
        if (!admin(req)) return json(res, 401, { error: 'unauthorized' });
        const data = await readJson(req);
        if (!data) return json(res, 400, { error: 'bad_json' });
        const grace = Number.isFinite(data.graceMs)
          ? data.graceMs
          : graceDefault;
        const max = Number.isInteger(data.maxDeletions)
          ? data.maxDeletions
          : 100;
        if (m === 'DELETE' && pathname === '/media') {
          // `onMediaRemoved`: lista de URLs removidas do texto; só apaga após a carência.
          const names = (Array.isArray(data.urls) ? data.urls : [])
            .map(nameOf)
            .filter((n) => n !== null);
          return json(
            res,
            200,
            await removeFiles(names, grace, data.dryRun === true, max),
          );
        }
        if (m === 'POST' && pathname === '/media/cleanup') {
          // `referenced`: todas as URLs usadas em todos os textos (a varredura é do integrador).
          if (!Array.isArray(data.referenced))
            return json(res, 400, { error: 'referenced_required' });
          const used = new Set(data.referenced.map(nameOf));
          const orphans = (await readdir(o.mediaDir)).filter(
            (n) => NAME.test(n) && !used.has(n),
          );
          return json(
            res,
            200,
            await removeFiles(orphans, grace, data.dryRun === true, max),
          );
        }
      }
      json(res, 404, { error: 'not_found' });
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'internal' });
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) throw new Error('Defina ADMIN_TOKEN.');
  const authToken = process.env.AUTH_TOKEN;
  const allowAnon = process.env.ALLOW_ANON === '1';
  if (!authToken && !allowAnon)
    throw new Error(
      'Defina AUTH_TOKEN (ou, só em desenvolvimento, ALLOW_ANON=1 para aceitar envio anônimo).',
    );
  if (!authToken)
    console.warn(
      'AVISO: ALLOW_ANON=1 sem AUTH_TOKEN: qualquer pessoa que alcance este servidor pode enviar arquivos. Só para desenvolvimento.',
    );
  const port = Number(process.env.PORT ?? 3000);
  // Escuta só no loopback; `HOST=0.0.0.0` (por exemplo, num contêiner) expõe na rede.
  const host = process.env.HOST ?? '127.0.0.1';
  createServer(
    createApp({
      mediaDir: process.env.MEDIA_DIR ?? './media',
      adminToken,
      authToken,
      allowAnon,
      cookieSecure: process.env.COOKIE_SECURE === '1',
      csrfSecret: process.env.CSRF_SECRET,
    }),
  ).listen(port, host, () =>
    console.log(`server-node em http://${host}:${port}`),
  );
}
