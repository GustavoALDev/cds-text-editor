import { describe, expect, it } from 'vitest';
import { clamp, contrastRatio, from8, luminance, to8, toHex, toLinear, toSrgb } from './convert';

describe('convert', () => {
  it('round-trips sRGB through linear', () => {
    const c = [0.2, 0.5, 0.9] as const;
    const back = toSrgb(toLinear(c));
    back.forEach((v, i) => expect(v).toBeCloseTo(c[i] as number, 10));
  });

  it('computes WCAG luminance of white and black', () => {
    expect(luminance(toLinear([1, 1, 1]))).toBeCloseTo(1, 10);
    expect(luminance(toLinear([0, 0, 0]))).toBe(0);
  });

  it('computes the contrast ratio of black on white as 21', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });

  it('formats hex and clamps out-of-gamut values', () => {
    expect(toHex(from8([133, 20, 245]))).toBe('#8514f5');
    expect(to8([2, -1, 0.5])).toEqual([255, 0, 128]);
    expect(clamp(5)).toBe(1);
    expect(clamp(-5)).toBe(0);
  });

  it('never produces NaN for degenerate input', () => {
    for (const rgb of [[0, 0, 0], [1, 1, 1], [0, 0, 1]] as const) {
      expect(toSrgb(toLinear(rgb)).every(Number.isFinite)).toBe(true);
    }
  });
});
