import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOklabFix,
  applySpikeFixes,
  applyStepFix,
} from './gen-theme-golden.mjs';

const OKLAB = '0.2119034982 * r + 0.6806995451 * g + 0.0883024619 * b';
const STEP = 'const s = clamp((WHITE_Y - y) * 1000);';

test('corrige o coeficiente OKLab com exatamente uma ocorrência', () => {
  const out = applyOklabFix(`x ${OKLAB} y`);
  assert.match(out, /0\.1073969566 \* b/);
  assert.ok(!out.includes(OKLAB));
});

test('corrige o ganho do degrau com exatamente uma ocorrência', () => {
  const out = applyStepFix(`x ${STEP} y`);
  assert.match(out, /\* 1e9\);/);
  assert.ok(!out.includes(STEP));
});

test('cada correção lança com 0 ou 2 ocorrências', () => {
  assert.throws(() => applyOklabFix('nada'), /encontradas 0/);
  assert.throws(() => applyOklabFix(`${OKLAB}\n${OKLAB}`), /encontradas 2/);
  assert.throws(() => applyStepFix('nada'), /encontradas 0/);
  assert.throws(() => applyStepFix(`${STEP}\n${STEP}`), /encontradas 2/);
});

test('applySpikeFixes aplica as duas e exige ambas', () => {
  const out = applySpikeFixes(`${OKLAB}\n${STEP}`);
  assert.match(out, /0\.1073969566/);
  assert.match(out, /1e9/);
  assert.throws(() => applySpikeFixes(OKLAB), /ganho do degrau/);
  assert.throws(() => applySpikeFixes(STEP), /coeficiente OKLab/);
});
