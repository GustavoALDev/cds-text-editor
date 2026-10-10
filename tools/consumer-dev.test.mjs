// Testes de `dev`/`serve` do consumer.mjs e de `serve.mjs --with-server` (spec 07b, W6).
// Nenhum teste roda npm nem ng; o servidor sobe em porta efêmera.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEV_SERVER_PORT,
  exampleServerEnv,
  ngServeArgs,
  retargetProxy,
  runDev,
  serveArgs,
} from './consumer.mjs';
import {
  createDemoServer,
  createExampleApi,
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
    ngServeArgs({ consumerDir: '/c', host: '127.0.0.1' }).slice(-2),
    ['--host', '127.0.0.1'],
  );
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
  assert.equal(moved['/upload'].target, 'http://127.0.0.1:4323');
  assert.equal(
    retargetProxy(proxy, 4323, '0.0.0.0')['/csrf'].target,
    'http://127.0.0.1:4323',
  );
  assert.equal(
    retargetProxy(proxy, 4323, '::1')['/csrf'].target,
    'http://[::1]:4323',
  );
  assert.equal(
    proxy['/upload'].target,
    'http://localhost:3000',
    'não muta a entrada',
  );
});

test('exampleServerEnv: pasta temporária, porta e tokens de desenvolvimento', () => {
  const env = exampleServerEnv({
    mediaDir: '/m',
    port: 3000,
    authToken: 't',
    adminToken: 'a',
  });
  assert.deepEqual(env, {
    PORT: '3000',
    HOST: '127.0.0.1',
    MEDIA_DIR: '/m',
    AUTH_TOKEN: 't',
    ADMIN_TOKEN: 'a',
  });
});

test('nenhum token fixo no bundle do demo, no serve.mjs nem no consumer.mjs', () => {
  for (const file of [
    ['apps', 'demo', 'src', 'app', 'upload', 'demo-config.ts'],
    ['apps', 'demo', 'src', 'app', 'pages', 'files', 'files.page.ts'],
    ['apps', 'demo', 'serve.mjs'],
    ['tools', 'consumer.mjs'],
  ]) {
    const text = readFileSync(join(ROOT, ...file), 'utf8');
    assert.doesNotMatch(text, /demo-dev-token|DEV_AUTH_TOKEN/, file.join('/'));
  }
});

test('dev: token por execução no demo-config.json, host em servidor e ng serve, config restaurada', async () => {
  const consumer = await mkdtemp(join(tmpdir(), 'comodeviaser-rte-dev-'));
  const ngDir = join(consumer, 'node_modules', '@angular', 'cli', 'bin');
  mkdirSync(ngDir, { recursive: true });
  writeFileSync(join(ngDir, 'ng.js'), '');
  writeFileSync(
    join(consumer, 'proxy.conf.json'),
    JSON.stringify({ '/upload': { target: 'http://localhost:3000' } }),
  );
  mkdirSync(join(consumer, 'public'));
  const original = '{"upload":"simulated"}\n';
  writeFileSync(join(consumer, 'public', 'demo-config.json'), original);
  const runs = [];
  let during;
  const spawn = (cmd, args, options) => {
    const child = new EventEmitter();
    child.kill = () => {};
    runs.push({ args, options });
    if (runs.length === 2) {
      during = JSON.parse(
        readFileSync(join(consumer, 'public', 'demo-config.json'), 'utf8'),
      );
      setImmediate(() => child.emit('exit'));
    }
    return child;
  };
  await runDev({
    repoRoot: ROOT,
    consumerDir: consumer,
    env: { HOST: '::1' },
    fs,
    spawn,
  });
  const [server, ngServe] = runs;
  assert.equal(server.options.env.HOST, '::1');
  assert.equal(server.options.env.AUTH_TOKEN, during.authToken);
  assert.match(during.authToken, /^[0-9a-f]{32}$/);
  assert.equal(during.upload, 'server');
  assert.deepEqual(ngServe.args.slice(-2), ['--host', '::1']);
  assert.equal(
    readFileSync(join(consumer, 'public', 'demo-config.json'), 'utf8'),
    original,
    'demo-config.json original restaurado',
  );
  assert.equal(existsSync(join(consumer, 'proxy.dev.json')), false);

  // segunda execução: outro token
  const firstToken = during.authToken;
  runs.length = 0;
  await runDev({
    repoRoot: ROOT,
    consumerDir: consumer,
    env: {},
    fs,
    spawn,
  });
  assert.notEqual(runs[0].options.env.AUTH_TOKEN, firstToken);
  assert.equal(runs[0].options.env.HOST, '127.0.0.1');
  await rm(consumer, { recursive: true, force: true });
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
  const browser = await mkdtemp(join(tmpdir(), 'comodeviaser-rte-browser-'));
  const example = await createExampleApi();
  const server = createDemoServer(browser, {
    api: example.handler,
    authToken: example.authToken,
  });
  const base = await listen(server);
  try {
    const config = await fetch(`${base}/demo-config.json`);
    assert.deepEqual(await config.json(), {
      upload: 'server',
      authToken: example.authToken,
    });
    assert.match(example.authToken, /^[0-9a-f]{32}$/);
    assert.match(
      config.headers.get('content-security-policy'),
      /default-src 'self'/,
    );

    // O token CSRF é ligado à sessão: /csrf exige o bearer (sem ele, 401).
    assert.equal((await fetch(`${base}/csrf`)).status, 401);
    const csrf = await fetch(`${base}/csrf`, {
      headers: { Authorization: `Bearer ${example.authToken}` },
    });
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
        Authorization: `Bearer ${example.authToken}`,
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
  const browser = await mkdtemp(join(tmpdir(), 'comodeviaser-rte-browser-'));
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

test('serve.mjs: o cabeçalho de CSP vai por padrão e some com cspHeader: false', async () => {
  const browser = await mkdtemp(join(tmpdir(), 'comodeviaser-rte-browser-'));
  try {
    for (const [options, expected] of [
      [{}, true],
      [{ cspHeader: false }, false],
    ]) {
      const server = createDemoServer(browser, options);
      const base = await listen(server);
      try {
        const response = await fetch(`${base}/__health`);
        assert.equal(response.headers.has('content-security-policy'), expected);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  } finally {
    await rm(browser, { recursive: true, force: true });
  }
});
