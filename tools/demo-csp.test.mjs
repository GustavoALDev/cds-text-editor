// A CSP do demo vale em dois lugares com o mesmo texto (spec 07b, W4): o cabeçalho do
// `apps/demo/serve.mjs` e a `<meta http-equiv>` do `index.html` (hosts sem cabeçalhos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CSP } from '../apps/demo/serve.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('a CSP do serve.mjs é a estrita da spec 07b (W4)', () => {
  assert.equal(
    CSP,
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'",
  );
});

test('a <meta> do index.html tem o mesmo texto do cabeçalho', () => {
  const html = readFileSync(resolve(ROOT, 'apps/demo/src/index.html'), 'utf8');
  const meta =
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(
      html,
    );
  assert.ok(meta, 'index.html sem <meta http-equiv="Content-Security-Policy">');
  assert.equal(meta[1], CSP);
});
