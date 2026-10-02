import { describe, expect, it } from 'vitest';
import { toLinear } from './convert';
import { fromOklch, mixOklch, oklchToSrgb, toOklch } from './oklab';

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

  it('mixes with the shorter hue arc and treats achromatic hue as missing', () => {
    expect(mixOklch([0.5, 0.1, 350], 0.5, [0.5, 0.1, 10])[2]).toBeCloseTo(0, 5);
    expect(mixOklch([0.5, 0, 0], 0.5, [0.5, 0.1, 120])[2]).toBeCloseTo(120, 5);
  });

  it('renders OKLCH to sRGB within gamut', () => {
    oklchToSrgb(0.985, 0.006, 300).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});
