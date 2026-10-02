export type Rgb = readonly [number, number, number];
export type Rgb8 = readonly [number, number, number];

export const clamp = (x: number, min = 0, max = 1): number => Math.min(max, Math.max(min, x));

const decode = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

export const map3 = (v: Rgb, fn: (c: number) => number): Rgb => [fn(v[0]), fn(v[1]), fn(v[2])];

export const toLinear = (srgb: Rgb): Rgb => map3(srgb, decode);
export const toSrgb = (lin: Rgb): Rgb => map3(lin, (v) => encode(clamp(v)));
export const luminance = (lin: Rgb): number => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
export const to8 = (srgb: Rgb): Rgb8 => map3(srgb, (v) => Math.round(clamp(v) * 255));
export const from8 = (rgb8: Rgb8): Rgb => map3(rgb8, (v) => v / 255);
export const toHex = (srgb: Rgb): string => '#' + to8(srgb).map((v) => v.toString(16).padStart(2, '0')).join('');

export function contrastRatio(a: Rgb8, b: Rgb8): number {
  const ya = luminance(toLinear(from8(a)));
  const yb = luminance(toLinear(from8(b)));
  return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
}
