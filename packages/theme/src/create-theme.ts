import { toHex, toLinear, type Rgb } from './color/convert';
import { oklchToSrgb, toOklch, type Oklch } from './color/oklab';
import { parseColor } from './color/parse';
import { ANGULAR_DEFAULTS, type ColorParser } from './defaults';
import { deriveRole } from './derive';
import { STATIC_TOKENS } from './static-tokens';
import type { RteTheme } from './types';

export interface CreateRteThemeOptions extends RteTheme {
  /** Força claro/escuro; vence `mode`. */
  dark?: boolean;
  /** Leitor de cores (padrão: `parseColor`). */
  parseColor?: ColorParser;
}

const ROLES = ['primary', 'secondary', 'tertiary'] as const;

/**
 * Plano B: calcula em JS os tokens `--rte-*` (mesma matemática do theme.css) para navegadores
 * sem cores relativas / `light-dark()`. Nunca lança: semente inválida cai no padrão Angular, e
 * canais não finitos devolvidos por um parser customizado também são tratados como inválidos.
 */
export function createRteTheme(
  options: CreateRteThemeOptions = {},
): Record<string, string> {
  const parse = options.parseColor ?? parseColor;
  const resolve = (value: string | undefined, fallback: string): Rgb => {
    const parsed = value === undefined ? null : parse(value);
    if (parsed && parsed.every(Number.isFinite)) return parsed;
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
  const pick = (light: number, drk: number): number => (dark ? drk : light);
  const neutral = (lL: number, cL: number, lD: number, cD: number): Rgb =>
    oklchToSrgb(pick(lL, lD), Math.min(c, pick(cL, cD)) * tint, h);
  const surfaceOk: Oklch = [
    pick(0.985, 0.18),
    Math.min(c, pick(0.006, 0.012)) * tint,
    h,
  ];

  const tokens: Record<string, Rgb> = {
    surface: neutral(0.985, 0.006, 0.18, 0.012),
    'surface-raised': neutral(1, 0.003, 0.23, 0.014),
    text: neutral(0.22, 0.02, 0.97, 0.006),
    'text-muted': neutral(0.45, 0.02, 0.72, 0.015),
    border: neutral(0.88, 0.02, 0.32, 0.02),
  };
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

  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens))
    vars[`--rte-${name}`] = toHex(value);
  for (const [name, value] of Object.entries(
    STATIC_TOKENS[dark ? 'dark' : 'light'],
  )) {
    vars[`--rte-${name}`] = value;
  }
  return vars;
}
