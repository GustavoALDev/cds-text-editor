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
