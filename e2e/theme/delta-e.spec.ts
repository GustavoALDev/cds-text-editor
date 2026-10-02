import { expect, test } from '@playwright/test';
import type { Rgb8 } from '../../packages/theme/src/color/convert';
import { deltaE } from './helpers/delta-e';

// Teste só de Node (sem navegador): roda uma vez, no projeto chromium, em vez de três.
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Node-only: uma execução basta',
);

test('deltaE is a metric on 8-bit colors', () => {
  expect(deltaE([12, 34, 56], [12, 34, 56])).toBe(0);
  expect(deltaE([0, 0, 0], [255, 255, 255])).toBeCloseTo(1, 3);
  expect(deltaE([200, 10, 90], [3, 99, 250])).toBeCloseTo(
    deltaE([3, 99, 250], [200, 10, 90]),
    12,
  );
});

test('one 8-bit step is the quantization floor (small, positive)', () => {
  const steps = [
    deltaE([128, 128, 128], [129, 128, 128]),
    deltaE([128, 128, 128], [128, 129, 128]),
    deltaE([128, 128, 128], [128, 128, 129]),
  ];
  for (const s of steps) {
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(0.01);
  }
  test.info().annotations.push({
    type: 'quantization-floor',
    description: `1/255 em R,G,B a partir de #808080: ${steps.map((s) => s.toFixed(5)).join(' ')}`,
  });
  console.log('quantization floor (mid gray)', steps);
});

test('maximum one-step ΔE over a coarse 8-bit grid', () => {
  // Piso de quantização: com o nativo resolvido em 8 bits pelo canvas e o plano B em hex de 8 bits,
  // uma diferença de 1 unidade em um canal é o menor desvio possível diferente de zero.
  let max = 0;
  let at = '';
  for (let r = 0; r < 256; r += 15)
    for (let g = 0; g < 256; g += 15)
      for (let b = 0; b < 256; b += 15)
        for (const ch of [0, 1, 2]) {
          const c: Rgb8 = [r, g, b];
          const d: [number, number, number] = [r, g, b];
          d[ch] = c[ch]! < 255 ? c[ch]! + 1 : c[ch]! - 1;
          const e = deltaE(c, d);
          if (e > max) {
            max = e;
            at = `${c.join(',')} canal ${ch}`;
          }
        }
  test.info().annotations.push({
    type: 'quantization-floor-max',
    description: `max ΔE de 1/255 numa grade grossa: ${max.toFixed(5)} em ${at}`,
  });
  console.log('max one-step ΔE', max, at);
  expect(max).toBeGreaterThan(0);
});
