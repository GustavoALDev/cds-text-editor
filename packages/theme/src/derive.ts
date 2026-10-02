import { clamp, luminance, toSrgb, type Rgb } from './color/convert';
import {
  linearToOklab,
  mixOklab,
  oklabToLinear,
  oklchToOklab,
  type Oklch,
} from './color/oklab';

/**
 * Luminância (srgb-linear) abaixo da qual o texto sobre a semente é branco; acima, preto.
 * Qualquer limiar em [0.175, 0.1833] mantém preto e branco com contraste >= 4.5. O ideal teórico é
 * 0.1791, mas a cor de 8 bits mais próxima fica a só 5.6e-9 dele e os motores (Chromium, Firefox,
 * WebKit) calculam `0.1791 - Y` com precisões diferentes, divergindo do plano B. 0.1791005 fica a
 * >= 1.28e-7 de toda cor de 8 bits (~4x o pior erro medido entre motores), então todos decidem igual.
 */
export const WHITE_Y = 0.1791005;

/**
 * Ganho do degrau on-*. O degrau precisa ser praticamente exato: uma rampa de 0,001 de largura
 * deixava ~35 mil cores sRGB (Y logo abaixo de WHITE_Y) com texto cinza. A cor de 8 bits mais
 * próxima do limiar fica a >= 1,28e-7 dele, então o ganho precisa passar de ~8e6 (1e9 sobra).
 */
export const STEP_GAIN = 1e9;

/** 1 = semente escura (texto branco), 0 = clara (texto preto); `y` é a luminância da semente. */
export const onLevel = (y: number): number => clamp((WHITE_Y - y) * STEP_GAIN);

/** Canal de hover/active em srgb-linear: clareia (s = 1) ou escurece (s = 0) a semente em `amt`. */
export const stateChannel = (c: number, amt: number, s: number): number =>
  c * (1 - amt * s) + amt * (1 - s) * (1 - c);

export interface DerivedRole {
  seed: Rgb;
  on: Rgb;
  hover: Rgb;
  active: Rgb;
  text: Rgb;
  subtle: Rgb;
  border: Rgb;
}

/**
 * Deriva os tokens de um papel de cor (primary/secondary/tertiary) a partir da semente em
 * srgb-linear e da superfície em OKLCH. Porte literal do spike T6; entradas e saídas em 0..1.
 */
export function deriveRole(
  seedLin: Rgb,
  surface: Oklch,
  dark: boolean,
): DerivedRole {
  const y = luminance(seedLin);
  const s = onLevel(y);
  const state = (amt: number): Rgb =>
    [0, 1, 2].map((i) =>
      stateChannel(seedLin[i] as number, amt, s),
    ) as unknown as Rgb;
  // y === 0: 0.13 / 0 = Infinity e Math.min(1, Infinity) = 1; y === 1: divisão por 0 dá -Infinity e
  // clamp resulta em 0. Ambos os casos já são corretos; clamp ainda trata NaN.
  const text: Rgb = dark
    ? ([0, 1, 2].map((i) => {
        const c = seedLin[i] as number;
        return c + (1 - c) * clamp((0.28 - y) / (1 - y));
      }) as unknown as Rgb)
    : ([0, 1, 2].map(
        (i) => (seedLin[i] as number) * Math.min(1, 0.13 / y),
      ) as unknown as Rgb);
  const seedOk = linearToOklab(seedLin);
  const surfaceLab = oklchToOklab(surface);
  return {
    seed: toSrgb(seedLin),
    on: toSrgb([s, s, s]),
    hover: toSrgb(state(0.14)),
    active: toSrgb(state(0.26)),
    text: toSrgb(text),
    subtle: toSrgb(oklabToLinear(mixOklab(seedOk, 0.12, surfaceLab))),
    border: toSrgb(oklabToLinear(mixOklab(seedOk, 0.45, surfaceLab))),
  };
}
