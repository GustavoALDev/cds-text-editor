import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNotices } from './generate-notices.mjs';

test('empty production set yields a meaningful markdown', () => {
  const out = generateNotices(() => '{}\n');
  assert.match(out, /^# Avisos de terceiros/);
  assert.match(out, /Nenhuma dependência de produção de terceiros no momento\./);
});

test('non-empty production set embeds the tool markdown', () => {
  const out = generateNotices((args) => (args[0] === '--json' ? '{"a@1.0.0":{}}' : '[a@1.0.0](x) - MIT\n'));
  assert.match(out, /^# Avisos de terceiros\n\n\[a@1\.0\.0\]/);
});
