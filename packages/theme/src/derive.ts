import { clamp, luminance, toSrgb, type RteRgb } from './color/convert';
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

/**
 * Constantes de calibração (uso interno; não exportadas por `index.ts`). Cada uma aparece literalmente
 * no theme.css e `theme-css.spec.ts` confere CSS e TS valor a valor.
 */
/** Quanto hover/active clareiam ou escurecem a semente (em srgb-linear). */
export const STATE_AMOUNTS = { hover: 0.14, active: 0.26 } as const;
/** Luminância-alvo da variante `*-text`: teto no claro, piso no escuro. */
export const TEXT_TARGETS = { light: 0.13, dark: 0.28 } as const;
/** Porcentagem da semente na mistura com a superfície (`color-mix(in oklab, …)`). */
export const MIX_PCT = { subtle: 12, border: 45 } as const;

export interface DerivedRole {
  seed: RteRgb;
  on: RteRgb;
  hover: RteRgb;
  active: RteRgb;
  text: RteRgb;
  subtle: RteRgb;
  border: RteRgb;
}

/**
 * Deriva os tokens de um papel de cor (primary/secondary/tertiary) a partir da semente em
 * srgb-linear e da superfície em OKLCH. Porte do spike T6 com quatro desvios documentados (ADR 0002, "Desvios da fórmula do spike"); entradas e saídas em 0..1.
 */
export function deriveRole(
  seedLin: RteRgb,
  surface: Oklch,
  dark: boolean,
): DerivedRole {
  const y = luminance(seedLin);
  const s = onLevel(y);
  const state = (amt: number): RteRgb =>
    [0, 1, 2].map((i) =>
      stateChannel(seedLin[i] as number, amt, s),
    ) as unknown as RteRgb;
  // y === 0: TEXT_TARGETS.light / 0 = Infinity e Math.min(1, Infinity) = 1; y === 1: divisão por 0 dá -Infinity e
  // clamp resulta em 0. Ambos os casos já são corretos; clamp ainda trata NaN.
  const text: RteRgb = dark
    ? ([0, 1, 2].map((i) => {
        const c = seedLin[i] as number;
        return c + (1 - c) * clamp((TEXT_TARGETS.dark - y) / (1 - y));
      }) as unknown as RteRgb)
    : ([0, 1, 2].map(
        (i) => (seedLin[i] as number) * Math.min(1, TEXT_TARGETS.light / y),
      ) as unknown as RteRgb);
  const seedOk = linearToOklab(seedLin);
  const surfaceLab = oklchToOklab(surface);
  return {
    seed: toSrgb(seedLin),
    on: toSrgb([s, s, s]),
    hover: toSrgb(state(STATE_AMOUNTS.hover)),
    active: toSrgb(state(STATE_AMOUNTS.active)),
    text: toSrgb(text),
    subtle: toSrgb(
      oklabToLinear(mixOklab(seedOk, MIX_PCT.subtle / 100, surfaceLab)),
    ),
    border: toSrgb(
      oklabToLinear(mixOklab(seedOk, MIX_PCT.border / 100, surfaceLab)),
    ),
  };
}
