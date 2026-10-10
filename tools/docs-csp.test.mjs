// A CSP do site vale em três lugares com o mesmo texto (spec 07c, X11): o cabeçalho do
// `apps/docs/serve.mjs`, a `<meta http-equiv>` do `index.html` (Pages não envia cabeçalhos) e a
// CSP do demo (spec 07b, W4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CSP as DEMO_CSP } from '../apps/demo/serve.mjs';
import {
  CSP,
  createDocsServer,
  normalizeBase,
  resolveBase,
  resolveRequest,
} from '../apps/docs/serve.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('a CSP do site é a do demo', () => {
  assert.equal(CSP, DEMO_CSP);
});

test('a <meta> do index.html tem o mesmo texto do cabeçalho', () => {
  const html = readFileSync(resolve(ROOT, 'apps/docs/src/index.html'), 'utf8');
  const meta =
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(
      html,
    );
  assert.ok(meta, 'index.html sem <meta http-equiv="Content-Security-Policy">');
  assert.equal(meta[1], CSP);
});

test('o index.html usa o <base href> da publicação e lang pt-BR', () => {
  const html = readFileSync(resolve(ROOT, 'apps/docs/src/index.html'), 'utf8');
  assert.match(html, /<base href="\/comodeviaser-editor\/"\s*\/?>/);
  assert.match(html, /<html lang="pt-BR">/);
});

test('normalizeBase e resolveBase', () => {
  assert.equal(normalizeBase('/x'), '/x/');
  assert.equal(normalizeBase('/'), '/');
  assert.throws(() => normalizeBase('x/'), /começar com/);
  assert.equal(resolveBase([], {}), '/comodeviaser-editor/');
  assert.equal(resolveBase([], { RTE_SITE_BASE: '/a' }), '/a/');
  assert.equal(resolveBase(['--base', '/b/'], { RTE_SITE_BASE: '/a' }), '/b/');
});

test('resolveRequest: sob a base, fora dela, raiz e prefixo sem barra', () => {
  const base = '/comodeviaser-editor/';
  assert.deepEqual(resolveRequest(base, '/comodeviaser-editor/guia/x/'), {
    kind: 'file',
    rel: 'guia/x/',
  });
  assert.deepEqual(resolveRequest(base, '/comodeviaser-editor/'), {
    kind: 'file',
    rel: '',
  });
  assert.deepEqual(resolveRequest(base, '/outro/x'), { kind: 'notFound' });
  assert.deepEqual(resolveRequest(base, '/'), {
    kind: 'redirect',
    location: base,
  });
  assert.deepEqual(resolveRequest(base, '/comodeviaser-editor'), {
    kind: 'redirect',
    location: base,
  });
  assert.deepEqual(resolveRequest('/', '/guia/x'), {
    kind: 'file',
    rel: 'guia/x',
  });
  assert.equal(resolveRequest(base, '/%E0%A4%A').kind, 'bad');
});

async function withServer(options, run) {
  const dir = mkdtempSync(join(tmpdir(), 'docs-serve-'));
  mkdirSync(join(dir, 'guia', 'x'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), 'raiz');
  writeFileSync(join(dir, 'guia', 'x', 'index.html'), 'pagina-x');
  writeFileSync(join(dir, '404.html'), 'nao-encontrada');
  const server = createDocsServer(dir, options);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(origin);
  } finally {
    await new Promise((ok) => server.close(ok));
  }
}

test('o servidor serve sob o prefixo, com CSP, 404.html e redirecionamento', async () => {
  await withServer({ base: '/comodeviaser-editor/' }, async (origin) => {
    const page = await fetch(`${origin}/comodeviaser-editor/guia/x/`);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), 'pagina-x');
    assert.equal(page.headers.get('content-security-policy'), CSP);

    const missing = await fetch(`${origin}/comodeviaser-editor/nada/aqui`);
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), 'nao-encontrada');

    const outside = await fetch(`${origin}/guia/x/`);
    assert.equal(outside.status, 404);

    const root = await fetch(`${origin}/`, { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/comodeviaser-editor/');

    const post = await fetch(`${origin}/comodeviaser-editor/`, { method: 'POST' });
    assert.equal(post.status, 405);

    const traversal = await fetch(`${origin}/comodeviaser-editor/..%2f..%2fx`);
    assert.equal(traversal.status, 404);
  });
});

test('--no-csp-header: sem o cabeçalho', async () => {
  await withServer({ cspHeader: false }, async (origin) => {
    const page = await fetch(`${origin}/comodeviaser-editor/`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('content-security-policy'), null);
  });
});
