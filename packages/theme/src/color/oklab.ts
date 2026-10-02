import { toSrgb, type Rgb } from './convert';

export type Oklab = readonly [number, number, number];
export type Oklch = readonly [number, number, number];

export function linearToOklab([r, g, b]: Rgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear([L, a, b]: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function toOklch(lin: Rgb): Oklch {
  const [L, a, b] = linearToOklab(lin);
  return [
    L,
    Math.hypot(a, b),
    ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  ];
}

export function fromOklch([L, C, h]: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  return oklabToLinear([L, C * Math.cos(rad), C * Math.sin(rad)]);
}

export const oklchToSrgb = (L: number, C: number, h: number): Rgb =>
  toSrgb(fromOklch([L, C, h]));

/** Oklch (L, C, h em graus) para Oklab (L, a, b). */
export function oklchToOklab([L, C, h]: Oklch): Oklab {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

/**
 * color-mix(in oklab, a pA%, b): interpolação linear de L, a e b, sem lógica de matiz. Uma cor
 * acromática (a = b = 0) mantém exatamente o matiz da outra. A mistura polar (oklch) interpolava o
 * matiz entre a semente e a superfície (que carrega o matiz da primary), puxando o matiz de cada papel.
 */
export function mixOklab(a: Oklab, pA: number, b: Oklab): Oklab {
  const t = 1 - pA;
  return [a[0] * pA + b[0] * t, a[1] * pA + b[1] * t, a[2] * pA + b[2] * t];
}
