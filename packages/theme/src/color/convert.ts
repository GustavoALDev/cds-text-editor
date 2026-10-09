/** Cor sRGB como trio `[r, g, b]`, cada canal em 0..1. */
export type RteRgb = readonly [number, number, number];
export type Rgb8 = readonly [number, number, number];

/** Recorta em [min, max]; NaN vira `min` (nunca vaza NaN para o hex). */
export const clamp = (x: number, min = 0, max = 1): number =>
  Number.isNaN(x) ? min : Math.min(max, Math.max(min, x));

const decode = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const encode = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

export const map3 = (v: RteRgb, fn: (c: number) => number): RteRgb => [
  fn(v[0]),
  fn(v[1]),
  fn(v[2]),
];

export const toLinear = (srgb: RteRgb): RteRgb => map3(srgb, decode);
export const toSrgb = (lin: RteRgb): RteRgb =>
  map3(lin, (v) => encode(clamp(v)));
export const luminance = (lin: RteRgb): number =>
  0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
export const to8 = (srgb: RteRgb): Rgb8 =>
  map3(srgb, (v) => Math.round(clamp(v) * 255));
export const from8 = (rgb8: Rgb8): RteRgb => map3(rgb8, (v) => v / 255);
export const toHex = (srgb: RteRgb): string =>
  '#' +
  to8(srgb)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

export function contrastRatio(a: Rgb8, b: Rgb8): number {
  const ya = luminance(toLinear(from8(a)));
  const yb = luminance(toLinear(from8(b)));
  return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
}
