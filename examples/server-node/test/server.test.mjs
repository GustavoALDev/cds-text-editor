import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp, parseRange } from '../server.mjs';

const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(b);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

let dir, server, base;
const AUTH = { authorization: 'Bearer user-1' };
const admin = { authorization: 'Bearer adm' };
let csrf;

/** Busca o token CSRF UMA vez (como a receita do README) e monta os cabeçalhos do envio. */
const getCsrf = async (origin, auth = AUTH, cookieName = 'csrf') => {
  const res = await fetch(origin + '/csrf', { headers: auth });
  const { token } = await res.json();
  return {
    ...auth,
    'x-csrf-token': token,
    cookie: `${cookieName}=${token}`,
  };
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rte-media-'));
  server = createServer(
    createApp({
      mediaDir: dir,
      adminToken: 'adm',
      authToken: 'user-1',
      maxBytes: 5000,
      sanitize: (h) => h.replace(/<script.*?<\/script>/g, ''),
    }),
  );
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  csrf = await getCsrf(base);
});
after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const send = (
  bytes,
  { name = 'a.png', type = 'image/png', kind = 'image', headers = csrf } = {},
) => {
  const fd = new FormData();
  fd.append('file', new File([bytes], name, { type }));
  fd.append('kind', kind);
  return fetch(`${base}/upload`, { method: 'POST', body: fd, headers });
};
const post = (path, body, method = 'POST') =>
  fetch(base + path, {
    method,
    headers: { ...admin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const age = (url, ms) => {
  const t = new Date(Date.now() - ms);
  return utimes(join(dir, url.split('/').pop()), t, t);
};

test('upload válido de PNG devolve url e dimensões e serve com cabeçalhos seguros', async () => {
  const res = await send(png(640, 480));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.url, /^\/media\/[a-f0-9]{32}\.png$/);
  assert.deepEqual([body.width, body.height], [640, 480]);
  const got = await fetch(base + body.url);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(got.headers.get('content-disposition'), 'inline');
  assert.match(
    got.headers.get('content-security-policy'),
    /default-src 'none'/,
  );
});

test('rejeita por magic bytes: PNG declarado com texto, SVG e kind divergente', async () => {
  assert.equal((await send(Buffer.from('só texto'))).status, 415);
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
  );
  assert.equal(
    (await send(svg, { name: 'a.svg', type: 'image/svg+xml' })).status,
    415,
  );
  assert.equal((await send(svg)).status, 415);
  assert.equal((await send(png(1, 1), { kind: 'video' })).status, 415);
});

test('limite de tamanho', async () => {
  const big = Buffer.concat([png(1, 1), Buffer.alloc(6000)]);
  assert.equal((await send(big)).status, 413);
});

test('CSRF ausente ou divergente dá 403', async () => {
  assert.equal((await send(png(1, 1), { headers: AUTH })).status, 403);
  assert.equal(
    (
      await send(png(1, 1), {
        headers: { ...AUTH, 'x-csrf-token': 'aa', cookie: 'csrf=bb' },
      })
    ).status,
    403,
  );
});

test('limpeza de órfãs: idade, dryRun e limite', async () => {
  for (const f of await readdir(dir)) await rm(join(dir, f));
  const urls = [];
  for (let i = 0; i < 3; i++)
    urls.push((await (await send(png(i + 1, 1))).json()).url);
  const fresh = (await (await send(png(9, 9))).json()).url;
  for (const u of urls) await age(u, 2 * 3600_000);
  const keep = urls[0];
  const opts = { referenced: [keep], graceMs: 3600_000 };

  let r = await (
    await post('/media/cleanup', { ...opts, dryRun: true })
  ).json();
  assert.equal(r.removed.length, 2);
  assert.equal((await readdir(dir)).length, 4);

  r = await (await post('/media/cleanup', { ...opts, maxDeletions: 1 })).json();
  assert.equal(r.removed.length, 1);
  assert.equal((await readdir(dir)).length, 3);

  r = await (await post('/media/cleanup', opts)).json();
  assert.equal(r.removed.length, 1);
  const names = [keep, fresh].map((u) => u.split('/').pop()).sort();
  assert.deepEqual((await readdir(dir)).sort(), names);
  assert.equal(
    (await fetch(base + '/media/cleanup', { method: 'POST', body: '{}' }))
      .status,
    401,
  );
});

test('DELETE /media respeita a carência', async () => {
  const old = (await (await send(png(2, 2))).json()).url;
  const recent = (await (await send(png(3, 3))).json()).url;
  await age(old, 2 * 3600_000);
  const r = await (
    await post(
      '/media',
      { urls: [old, recent, '../../etc/passwd'], graceMs: 3600_000 },
      'DELETE',
    )
  ).json();
  assert.deepEqual(r.removed, [old.split('/').pop()]);
  assert.equal(r.skipped.length, 1);
  assert.equal((await fetch(base + old)).status, 404);
  assert.equal((await fetch(base + recent)).status, 200);
});

test('POST /content usa o sanitizador injetado', async () => {
  const r = await fetch(base + '/content', {
    method: 'POST',
    headers: { ...csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ html: '<p>oi</p><script>x</script>' }),
  });
  assert.equal((await r.json()).html, '<p>oi</p>');
});

// ---- R9: autenticação obrigatória, CSRF ligado à sessão, Range, concorrência, pixels ----

const app = (extra = {}) =>
  createApp({
    mediaDir: dir,
    adminToken: 'adm',
    authToken: 'user-1',
    ...extra,
  });
const listen = async (handler) => {
  const s = createServer(handler);
  await new Promise((r) => s.listen(0, r));
  return { s, origin: `http://127.0.0.1:${s.address().port}` };
};

test('sem authToken a inicialização falha, salvo opt-out explícito allowAnon', () => {
  assert.throws(
    () => createApp({ mediaDir: dir, adminToken: 'adm' }),
    /authToken/,
  );
  assert.doesNotThrow(() =>
    createApp({ mediaDir: dir, adminToken: 'adm', allowAnon: true }),
  );
});

test('envio e /csrf sem bearer dão 401; allowAnon aceita sem bearer', async () => {
  assert.equal((await fetch(base + '/csrf')).status, 401);
  assert.equal((await send(png(1, 1), { headers: {} })).status, 401);
  const { s, origin } = await listen(
    createApp({ mediaDir: dir, adminToken: 'adm', allowAnon: true }),
  );
  try {
    const h = await getCsrf(origin, {});
    const fd = new FormData();
    fd.append('file', new File([png(2, 2)], 'a.png'));
    const r = await fetch(origin + '/upload', {
      method: 'POST',
      body: fd,
      headers: h,
    });
    assert.equal(r.status, 201);
  } finally {
    s.close();
  }
});

test('token CSRF é ligado à sessão: outra sessão, cookie plantado e nome parecido dão 403', async () => {
  const { s, origin } = await listen(
    app({ sessionOf: (req) => String(req.headers['x-user'] ?? '') }),
  );
  const up = (headers) => {
    const fd = new FormData();
    fd.append('file', new File([png(2, 2)], 'a.png'));
    return fetch(origin + '/upload', { method: 'POST', body: fd, headers });
  };
  try {
    const alice = { ...AUTH, 'x-user': 'alice' };
    const a = await getCsrf(origin, alice);
    assert.equal((await up(a)).status, 201);
    // token de alice usado na sessão de bob
    assert.equal((await up({ ...a, 'x-user': 'bob' })).status, 403);
    // atacante planta cookie = cabeçalho (double-submit ingênuo passaria)
    const forged = 'a'.repeat(32) + '.' + 'b'.repeat(64);
    assert.equal(
      (await up({ ...alice, 'x-csrf-token': forged, cookie: `csrf=${forged}` }))
        .status,
      403,
    );
    // cookie com nome parecido não vale
    assert.equal(
      (await up({ ...a, cookie: a.cookie.replace('csrf=', 'xcsrf=') })).status,
      403,
    );
    // cookie certo entre outros
    assert.equal(
      (await up({ ...a, cookie: `a=1; ${a.cookie}; b=2` })).status,
      201,
    );
  } finally {
    s.close();
  }
});

test('o mesmo token serve a envios concorrentes (a receita busca uma vez)', async () => {
  const rs = await Promise.all([send(png(3, 3)), send(png(4, 4))]);
  assert.deepEqual(
    rs.map((r) => r.status),
    [201, 201],
  );
});

test('cookie: SameSite=Strict, HttpOnly; com cookieSecure vira __Host-csrf com Secure', async () => {
  const plain = (await fetch(base + '/csrf', { headers: AUTH })).headers.get(
    'set-cookie',
  );
  assert.match(plain, /^csrf=[a-f0-9.]+; Path=\/; SameSite=Strict; HttpOnly$/);
  const { s, origin } = await listen(app({ cookieSecure: true }));
  try {
    const sc = (await fetch(origin + '/csrf', { headers: AUTH })).headers.get(
      'set-cookie',
    );
    assert.match(
      sc,
      /^__Host-csrf=.*; Path=\/; SameSite=Strict; HttpOnly; Secure$/,
    );
    const h = await getCsrf(origin, AUTH, '__Host-csrf');
    const fd = new FormData();
    fd.append('file', new File([png(2, 2)], 'a.png'));
    assert.equal(
      (
        await fetch(origin + '/upload', {
          method: 'POST',
          body: fd,
          headers: h,
        })
      ).status,
      201,
    );
  } finally {
    s.close();
  }
});

test('Range: 206, sufixo, 416 e HEAD com Accept-Ranges', async () => {
  const bytes = Buffer.concat([png(5, 5), Buffer.alloc(100, 7)]);
  const { url } = await (await send(bytes)).json();
  const get = (range) => fetch(base + url, { headers: range ? { range } : {} });
  const full = await get();
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.equal(Buffer.compare(Buffer.from(await full.arrayBuffer()), bytes), 0);
  const part = await get('bytes=10-19');
  assert.equal(part.status, 206);
  assert.equal(
    part.headers.get('content-range'),
    `bytes 10-19/${bytes.length}`,
  );
  assert.equal(
    Buffer.compare(
      Buffer.from(await part.arrayBuffer()),
      bytes.subarray(10, 20),
    ),
    0,
  );
  const tail = await get('bytes=-4');
  assert.equal(
    Buffer.compare(Buffer.from(await tail.arrayBuffer()), bytes.subarray(-4)),
    0,
  );
  const bad = await get(`bytes=${bytes.length}-`);
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get('content-range'), `bytes */${bytes.length}`);
  const head = await fetch(base + url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal(parseRange('bytes=0-1,5-6', 100), null);
  assert.equal(parseRange('bytes=5-3', 100), 'invalid');
});

test('teto de pixels recusa bomba de descompressão; imagem sem dimensões legíveis também', async () => {
  const bomb = await send(png(20000, 20000));
  assert.equal(bomb.status, 413);
  assert.equal((await bomb.json()).error, 'too_many_pixels');
  assert.equal((await send(png(6000, 6000))).status, 201); // 36 Mpx
  const jpegNoSof = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9, 0, 0, 0, 0,
  ]);
  const r = await send(jpegNoSof);
  assert.equal(r.status, 415);
  assert.equal((await r.json()).error, 'unreadable_image');
});

test('limite de envios simultâneos responde 503', async () => {
  const { s, origin } = await listen(app({ maxConcurrentUploads: 1 }));
  try {
    const h = await getCsrf(origin);
    // primeiro envio fica pendurado (corpo incompleto)
    const hung = request(origin + '/upload', {
      method: 'POST',
      headers: {
        ...h,
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': '5000',
      },
    });
    hung.on('error', () => {});
    hung.write('--x\r\n');
    await new Promise((r) => setTimeout(r, 150));
    const fd = new FormData();
    fd.append('file', new File([png(2, 2)], 'a.png'));
    const second = await fetch(origin + '/upload', {
      method: 'POST',
      body: fd,
      headers: h,
    });
    assert.equal(second.status, 503);
    hung.destroy();
  } finally {
    s.closeAllConnections?.();
    s.close();
  }
});

test('carência padrão das órfãs é de 7 dias (a vida do rascunho)', async () => {
  const young = (await (await send(png(7, 7))).json()).url;
  const old = (await (await send(png(8, 8))).json()).url;
  await age(young, 2 * 24 * 3600_000);
  await age(old, 8 * 24 * 3600_000);
  const r = await (
    await post('/media/cleanup', { referenced: [], maxDeletions: 1000 })
  ).json();
  assert.ok(r.removed.includes(old.split('/').pop()));
  assert.ok(!r.removed.includes(young.split('/').pop()));
});
