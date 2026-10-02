import { describe, expect, it } from 'vitest';
import { toLinear } from './convert';
import {
  fromOklch,
  linearToOklab,
  mixOklab,
  oklchToOklab,
  oklchToSrgb,
  toOklch,
} from './oklab';

describe('oklab', () => {
  it('maps white to L=1 and C≈0', () => {
    const [l, c] = toOklch(toLinear([1, 1, 1]));
    expect(l).toBeCloseTo(1, 4);
    expect(c).toBeLessThan(1e-4);
  });

  it('round-trips OKLCH through linear RGB', () => {
    const lin = toLinear([0.52, 0.08, 0.96]);
    const back = fromOklch(toOklch(lin));
    back.forEach((v, i) => expect(v).toBeCloseTo(lin[i] as number, 6));
  });

  it('keeps hue finite for achromatic colors', () => {
    const [, , h] = toOklch(toLinear([0.5, 0.5, 0.5]));
    expect(Number.isFinite(h)).toBe(true);
  });

  it('mixes in OKLab: ends, midpoint and weights', () => {
    const a = [0.4, 0.1, -0.05] as const;
    const b = [0.9, -0.02, 0.03] as const;
    expect(mixOklab(a, 1, b)).toEqual([0.4, 0.1, -0.05]);
    expect(mixOklab(a, 0, b)).toEqual([0.9, -0.02, 0.03]);
    const mid = mixOklab(a, 0.5, b);
    [0.65, 0.04, -0.01].forEach((v, i) => expect(mid[i]).toBeCloseTo(v, 12));
    const w = mixOklab(a, 0.12, b);
    [
      0.4 * 0.12 + 0.9 * 0.88,
      0.1 * 0.12 - 0.02 * 0.88,
      -0.05 * 0.12 + 0.03 * 0.88,
    ].forEach((v, i) => expect(w[i]).toBeCloseTo(v, 12));
  });

  it('keeps the hue of the seed exactly when the partner is achromatic', () => {
    const seed = linearToOklab(toLinear([0.9, 0.12, 0.2]));
    const gray = oklchToOklab([0.985, 0, 140]);
    for (const p of [0.12, 0.45]) {
      const m = mixOklab(seed, p, gray);
      const hue = ((Math.atan2(m[2], m[1]) * 180) / Math.PI + 360) % 360;
      const seedHue =
        ((Math.atan2(seed[2], seed[1]) * 180) / Math.PI + 360) % 360;
      expect(hue).toBeCloseTo(seedHue, 9);
    }
  });

  it('renders OKLCH to sRGB within gamut', () => {
    oklchToSrgb(0.985, 0.006, 300).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});
