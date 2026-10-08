// Testes de `dev`/`serve` do consumer.mjs e de `serve.mjs --with-server` (spec 07b, W6).
// Nenhum teste roda npm nem ng; o servidor sobe em porta efêmera.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEV_AUTH_TOKEN,
  DEV_SERVER_PORT,
  exampleServerEnv,
  ngServeArgs,
  retargetProxy,
  serveArgs,
} from './consumer.mjs';
import {
  createDemoServer,
  createExampleApi,
  DEV_AUTH_TOKEN as SERVE_TOKEN,
  isApiPath,
} from '../apps/demo/serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('ngServeArgs: ng serve com --proxy-config (e porta, se houver)', () => {
  const args = ngServeArgs({ consumerDir: '/c', port: 4322 });
  assert.match(
    args[0].replaceAll('\\', '/'),
    /node_modules\/@angular\/cli\/bin\/ng\.js$/,
  );
  assert.deepEqual(args.slice(1), [
    'serve',
    '--proxy-config',
    'proxy.conf.json',
    '--port',
    '4322',
  ]);
  assert.deepEqual(
    ngServeArgs({ consumerDir: '/c', proxyConfig: 'p.json' }).slice(1),
    ['serve', '--proxy-config', 'p.json'],
  );
});

test('serveArgs: serve.mjs com a pasta browser/ do consumidor e --with-server', () => {
  const base = serveArgs({
    repoRoot: '/r',
    consumerDir: '/c',
    withServer: false,
  });
  assert.match(base[0].replaceAll('\\', '/'), /apps\/demo\/serve\.mjs$/);
  assert.equal(base[1], '--dir');
  assert.match(base[2].replaceAll('\\', '/'), /\/c\/dist\/demo\/browser$/);
  assert.equal(base.length, 3);
  assert.equal(
    serveArgs({ repoRoot: '/r', consumerDir: '/c', withServer: true }).at(-1),
    '--with-server',
  );
});

test('proxy.conf.json encaminha /upload, /csrf e /media/ para localhost:3000', () => {
  const proxy = JSON.parse(
    readFileSync(join(ROOT, 'apps', 'demo', 'proxy.conf.json'), 'utf8'),
  );
  assert.deepEqual(Object.keys(proxy).sort(), ['/csrf', '/media/', '/upload']);
  for (const entry of Object.values(proxy)) {
    assert.equal(entry.target, `http://localhost:${DEV_SERVER_PORT}`);
  }
  const moved = retargetProxy(proxy, 4323);
  assert.equal(moved['/upload'].target, 'http://localhost:4323');
  assert.equal(
    proxy['/upload'].target,
    'http://localhost:3000',
    'não muta a entrada',
  );
});

test('exampleServerEnv: pasta temporária, porta e tokens de desenvolvimento', () => {
  const env = exampleServerEnv({ mediaDir: '/m', port: 3000, adminToken: 'a' });
  assert.deepEqual(env, {
    PORT: '3000',
    MEDIA_DIR: '/m',
    AUTH_TOKEN: DEV_AUTH_TOKEN,
    ADMIN_TOKEN: 'a',
  });
});

test('o token de desenvolvimento é o mesmo no consumer, no serve.mjs e na página', () => {
  const config = readFileSync(
    join(ROOT, 'apps', 'demo', 'src', 'app', 'upload', 'demo-config.ts'),
    'utf8',
  );
  const page = /DEV_AUTH_TOKEN = '([^']+)'/.exec(config)?.[1];
  assert.equal(page, DEV_AUTH_TOKEN);
  assert.equal(SERVE_TOKEN, DEV_AUTH_TOKEN);
});

test('isApiPath: só /upload, /csrf e /media/*', () => {
  assert.equal(isApiPath('/upload'), true);
  assert.equal(isApiPath('/csrf'), true);
  assert.equal(isApiPath('/media/abc.png'), true);
  assert.equal(isApiPath('/files'), false);
  assert.equal(isApiPath('/media'), false);
});

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('serve.mjs --with-server: demo-config server, CSRF, upload real e mídia, pasta removida', async () => {
  const browser = await mkdtemp(join(tmpdir(), 'cds-rte-browser-'));
  const example = await createExampleApi();
  const server = createDemoServer(browser, { api: example.handler });
  const base = await listen(server);
  try {
    const config = await fetch(`${base}/demo-config.json`);
    assert.deepEqual(await config.json(), { upload: 'server' });
    assert.match(
      config.headers.get('content-security-policy'),
      /default-src 'self'/,
    );

    const csrf = await fetch(`${base}/csrf`);
    const { token } = await csrf.json();
    const cookie = csrf.headers.get('set-cookie').split(';')[0];
    assert.ok(token);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.set('file', new Blob([png], { type: 'image/png' }), 'x.png');
    form.set('kind', 'image');
    const denied = await fetch(`${base}/upload`, {
      method: 'POST',
      body: form,
    });
    assert.equal(denied.status, 401);
    const sent = await fetch(`${base}/upload`, {
      method: 'POST',
      body: form,
      headers: {
        Authorization: `Bearer ${DEV_AUTH_TOKEN}`,
        'X-CSRF-Token': token,
        Cookie: cookie,
      },
    });
    assert.equal(sent.status, 201);
    const { url } = await sent.json();
    assert.match(url, /^\/media\/[a-f0-9]{32}\.png$/);
    assert.equal((await readdir(example.mediaDir)).length, 1);
    const media = await fetch(`${base}${url}`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'image/png');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await example.cleanup();
    await rm(browser, { recursive: true, force: true });
  }
  assert.equal(
    existsSync(example.mediaDir),
    false,
    'pasta temporária removida',
  );
});

test('serve.mjs sem --with-server: sem rotas da API nem demo-config', async () => {
  const browser = await mkdtemp(join(tmpdir(), 'cds-rte-browser-'));
  const server = createDemoServer(browser);
  const base = await listen(server);
  try {
    assert.equal((await fetch(`${base}/csrf`)).status, 404);
    assert.equal(
      (await fetch(`${base}/upload`, { method: 'POST' })).status,
      405,
    );
    assert.equal((await fetch(`${base}/demo-config.json`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(browser, { recursive: true, force: true });
  }
});
