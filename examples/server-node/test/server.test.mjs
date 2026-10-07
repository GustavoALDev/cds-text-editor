import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../server.mjs';

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
const TOKEN = 'abc0123456789def';
const csrf = { 'x-csrf-token': TOKEN, cookie: `csrf=${TOKEN}` };
const admin = { authorization: 'Bearer adm' };

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rte-media-'));
  server = createServer(
    createApp({
      mediaDir: dir,
      adminToken: 'adm',
      maxBytes: 5000,
      sanitize: (h) => h.replace(/<script.*?<\/script>/g, ''),
    }),
  );
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
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
  assert.equal((await send(png(1, 1), { headers: {} })).status, 403);
  assert.equal(
    (
      await send(png(1, 1), {
        headers: { 'x-csrf-token': 'aa', cookie: 'csrf=bb' },
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
