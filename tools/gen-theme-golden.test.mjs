import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOklabFix,
  applySpikeFixes,
  applyStepFix,
  applyThresholdFix,
} from './gen-theme-golden.mjs';

const OKLAB = '0.2119034982 * r + 0.6806995451 * g + 0.0883024619 * b';
const STEP = 'const s = clamp((WHITE_Y - y) * 1000);';
const THRESHOLD = 'const WHITE_Y = 0.1791;';

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

test('corrige o limiar com exatamente uma ocorrência', () => {
  const out = applyThresholdFix(`x ${THRESHOLD} y`);
  assert.match(out, /WHITE_Y = 0\.1791005;/);
  assert.ok(!out.includes(THRESHOLD));
  assert.throws(() => applyThresholdFix('nada'), /encontradas 0/);
  assert.throws(
    () => applyThresholdFix(`${THRESHOLD}\n${THRESHOLD}`),
    /encontradas 2/,
  );
});

test('applySpikeFixes aplica as três e exige todas', () => {
  const out = applySpikeFixes(`${OKLAB}\n${STEP}\n${THRESHOLD}`);
  assert.match(out, /0\.1791005/);
  assert.match(out, /0\.1073969566/);
  assert.match(out, /1e9/);
  assert.throws(() => applySpikeFixes(`${OKLAB}\n${STEP}`), /limiar do degrau/);
  assert.throws(
    () => applySpikeFixes(`${STEP}\n${THRESHOLD}`),
    /coeficiente OKLab/,
  );
  assert.throws(
    () => applySpikeFixes(`${OKLAB}\n${THRESHOLD}`),
    /ganho do degrau/,
  );
});
