import { clamp, map3, toHex, toLinear, type Rgb } from './color/convert';
import { oklchToSrgb, toOklch, type Oklch } from './color/oklab';
import { parseColor } from './color/parse';
import { ANGULAR_DEFAULTS, type ColorParser } from './defaults';
import { deriveRole } from './derive';
import { STATIC_TOKENS } from './static-tokens';
import type { RteTheme, RteThemeVariables } from './types';

export interface CreateRteThemeOptions extends RteTheme {
  /** Força claro/escuro; vence `mode`. */
  dark?: boolean;
  /** Leitor de cores (padrão: `parseColor`). */
  parseColor?: ColorParser;
}

const ROLES = ['primary', 'secondary', 'tertiary'] as const;

/**
 * Neutros (uso interno; não exportado por `index.ts`): `[L, teto de C]` em OKLCH por modo, com o matiz
 * da primary. O croma é `min(C da primary, teto) * tint`. `theme-css.spec.ts` confere cada literal
 * com o theme.css.
 */
export const NEUTRAL_SPEC = {
  surface: { light: [0.985, 0.006], dark: [0.18, 0.012] },
  'surface-raised': { light: [1, 0.003], dark: [0.23, 0.014] },
  text: { light: [0.22, 0.02], dark: [0.97, 0.006] },
  'text-muted': { light: [0.45, 0.02], dark: [0.72, 0.015] },
  border: { light: [0.88, 0.02], dark: [0.32, 0.02] },
} as const satisfies Record<
  string,
  Record<'light' | 'dark', readonly [number, number]>
>;

type NeutralName = keyof typeof NEUTRAL_SPEC;

/**
 * Plano B: calcula em JS os tokens `--rte-*` (mesma matemática do theme.css) para navegadores
 * sem cores relativas / `light-dark()`. Nunca lança: semente inválida cai no padrão Angular, e
 * um parser customizado que lança ou devolve canais não finitos também é tratado como inválido;
 * canais finitos são recortados em [0, 1].
 */
export function createRteTheme(
  options: CreateRteThemeOptions = {},
): RteThemeVariables {
  const parse = options.parseColor ?? parseColor;
  const resolve = (value: string | undefined, fallback: string): Rgb => {
    let parsed: Rgb | null = null;
    try {
      parsed = value === undefined ? null : parse(value);
    } catch {
      parsed = null; // parser customizado que lança: semente inválida
    }
    if (parsed && parsed.every(Number.isFinite))
      return map3(parsed, (v) => clamp(v));
    return parseColor(fallback) as Rgb;
  };
  const dark = options.dark ?? options.mode === 'dark';
  const tint = options.neutral === 'gray' ? 0 : 1;
  const seeds = {
    primary: resolve(options.primary, ANGULAR_DEFAULTS.primary),
    secondary: resolve(options.secondary, ANGULAR_DEFAULTS.secondary),
    tertiary: resolve(options.tertiary, ANGULAR_DEFAULTS.tertiary),
  };

  const [, c, h] = toOklch(toLinear(seeds.primary));
  const mode = dark ? 'dark' : 'light';
  const neutral = (name: NeutralName): Oklch => {
    const [L, cap] = NEUTRAL_SPEC[name][mode];
    return [L, Math.min(c, cap) * tint, h];
  };
  const surfaceOk = neutral('surface');

  const tokens: Record<string, Rgb> = {};
  for (const name of Object.keys(NEUTRAL_SPEC) as NeutralName[])
    tokens[name] = oklchToSrgb(...neutral(name));
  for (const role of ROLES) {
    const d = deriveRole(toLinear(seeds[role]), surfaceOk, dark);
    tokens[role] = d.seed;
    tokens[`on-${role}`] = d.on;
    tokens[`${role}-hover`] = d.hover;
    tokens[`${role}-active`] = d.active;
    tokens[`${role}-text`] = d.text;
    tokens[`${role}-subtle`] = d.subtle;
    tokens[`${role}-border`] = d.border;
  }
  tokens['focus'] = tokens['primary-text'] as Rgb;

  const vars: RteThemeVariables = {};
  for (const [name, value] of Object.entries(tokens))
    vars[`--rte-${name}`] = toHex(value);
  for (const [name, value] of Object.entries(STATIC_TOKENS[mode])) {
    vars[`--rte-${name}`] = value;
  }
  return vars;
}
