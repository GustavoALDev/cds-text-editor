import {
  from8,
  toLinear,
  type Rgb8,
} from '../../../packages/theme/src/color/convert';
import { linearToOklab } from '../../../packages/theme/src/color/oklab';

/** Distância euclidiana em OKLab entre duas cores sRGB de 8 bits. */
export function deltaE(a: Rgb8, b: Rgb8): number {
  const [l1, a1, b1] = linearToOklab(toLinear(from8(a)));
  const [l2, a2, b2] = linearToOklab(toLinear(from8(b)));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export interface HueOffset {
  /** Croma OKLCH do token. */
  chroma: number;
  /** Desvio de matiz em graus (0..180) entre o token e a semente. */
  degrees: number;
  /**
   * Distância, no plano (a, b) do OKLab, do token até o raio de matiz da semente (ou ao módulo do
   * token, se ele aponta para o lado oposto). Robusta à quantização de 8 bits: 1 unidade vale
   * ~0,0015 a 0,004 em OKLab, qualquer que seja o croma.
   */
  offset: number;
}

/** Quão longe, em matiz, o token está da semente (a semente deve ter croma > 0). */
export function hueOffset(token: Rgb8, seed: Rgb8): HueOffset {
  const [, ta, tb] = linearToOklab(toLinear(from8(token)));
  const [, sa, sb] = linearToOklab(toLinear(from8(seed)));
  const sn = Math.hypot(sa, sb);
  const ux = sa / sn;
  const uy = sb / sn;
  const chroma = Math.hypot(ta, tb);
  const dot = ta * ux + tb * uy;
  const cross = Math.abs(ta * uy - tb * ux);
  let degrees = Math.abs(
    (Math.atan2(tb, ta) * 180) / Math.PI - (Math.atan2(sb, sa) * 180) / Math.PI,
  );
  degrees %= 360;
  if (degrees > 180) degrees = 360 - degrees;
  return { chroma, degrees, offset: dot < 0 ? chroma : cross };
}
