// Servidor de exemplo (REFERÊNCIA, não produto). Sem dependências: Node >= 22.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dimensions, sniff } from './sniff.mjs';

/**
 * @typedef {object} Options
 * @property {string} mediaDir pasta de armazenamento
 * @property {number} [maxBytes] limite por arquivo (padrão 10 MiB)
 * @property {string} [publicPath] prefixo das URLs devolvidas (padrão `/media/`)
 * @property {string} [authToken] se definido, `Authorization: Bearer <token>` é exigido em /upload e /content
 * @property {string} adminToken token das rotas de administração (obrigatório)
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

const same = (/** @type {string} */ a, /** @type {string} */ b) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** @param {Options} o */
export function createApp(o) {
  const maxBytes = o.maxBytes ?? 10 * 1024 * 1024;
  const prefix = o.publicPath ?? '/media/';

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
  // Double-submit: o cabeçalho X-CSRF-Token deve igualar o cookie `csrf` (emitido por GET /csrf).
  const csrfOk = (/** @type {import('node:http').IncomingMessage} */ req) => {
    const header = String(req.headers['x-csrf-token'] ?? '');
    const cookie =
      /(?:^|;\s*)csrf=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '';
    return header !== '' && same(header, cookie);
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
    const name = `${randomBytes(16).toString('hex')}.${t.ext}`;
    await mkdir(o.mediaDir, { recursive: true });
    await writeFile(join(o.mediaDir, name), bytes, { flag: 'wx' });
    // Formato esperado por `httpUploadAdapter`: { url, width?, height?, srcset?, sizes?, poster? }
    json(res, 201, {
      url: prefix + name,
      ...(t.kind === 'image' ? dimensions(bytes, t) : {}),
    });
  }

  async function serve(name, res, head) {
    const st = await stat(join(o.mediaDir, name)).catch(() => null);
    if (!st) return json(res, 404, { error: 'not_found' });
    res.writeHead(200, {
      'content-type':
        MIME[/** @type {keyof typeof MIME} */ (name.split('.')[1])],
      'content-length': st.size,
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'cross-origin',
      'cache-control': 'public, max-age=31536000, immutable',
    });
    res.end(head ? undefined : await readFile(join(o.mediaDir, name)));
  }

  return async function handler(req, res) {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://x');
      const m = req.method ?? 'GET';
      if (m === 'GET' && pathname === '/csrf') {
        const token = randomBytes(16).toString('hex');
        res.setHeader(
          'set-cookie',
          `csrf=${token}; Path=/; SameSite=Strict; HttpOnly`,
        );
        return json(res, 200, { token });
      }
      if (m === 'POST' && pathname === '/upload') return await upload(req, res);
      if ((m === 'GET' || m === 'HEAD') && pathname.startsWith(prefix)) {
        const name = nameOf(pathname);
        return name
          ? await serve(name, res, m === 'HEAD')
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
          : 24 * 3600 * 1000;
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
  if (!adminToken)
    throw new Error('Defina ADMIN_TOKEN (e AUTH_TOKEN para o upload).');
  const port = Number(process.env.PORT ?? 3000);
  // Escuta só no loopback; `HOST=0.0.0.0` (por exemplo, num contêiner) expõe na rede.
  const host = process.env.HOST ?? '127.0.0.1';
  createServer(
    createApp({
      mediaDir: process.env.MEDIA_DIR ?? './media',
      adminToken,
      authToken: process.env.AUTH_TOKEN,
    }),
  ).listen(port, host, () =>
    console.log(`server-node em http://${host}:${port}`),
  );
}
