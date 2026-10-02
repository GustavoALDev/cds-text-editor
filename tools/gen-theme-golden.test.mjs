import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOklabFix } from './gen-theme-golden.mjs';

const BAD = '0.2119034982 * r + 0.6806995451 * g + 0.0883024619 * b';

test('corrige o coeficiente quando há exatamente uma ocorrência', () => {
  const out = applyOklabFix(`x ${BAD} y`);
  assert.match(out, /0\.1073969566 \* b/);
  assert.doesNotMatch(out, new RegExp(BAD.replace(/[*+.]/g, '\\$&')));
});

test('lança quando não há ocorrência ou há mais de uma', () => {
  assert.throws(() => applyOklabFix('nada'), /0 ocorrência|encontradas 0/);
  assert.throws(() => applyOklabFix(`${BAD}\n${BAD}`), /encontradas 2/);
});
