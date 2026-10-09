import {
  parseColor,
  RTE_THEME_PRESETS,
  type RteNeutral,
  type RteTheme,
  type RteThemeMode,
  type RteThemePresetName,
} from '@cds/rte-theme';

/** Campos de cor-semente do playground. */
export const COLOR_FIELDS = ['primary', 'secondary', 'tertiary'] as const;
export type ColorField = (typeof COLOR_FIELDS)[number];

/** Estado do playground (spec 07b, W7). As cores são o texto como digitado. */
export interface PlaygroundState {
  readonly primary: string;
  readonly secondary: string;
  readonly tertiary: string;
  readonly mode: RteThemeMode;
  readonly neutral: RteNeutral;
  /** Raio em px (nível 2 do tema, só CSS). */
  readonly radius: number;
  /** Densidade (número; 1 = padrão; nível 2, só CSS). */
  readonly density: number;
}

/** Padrões de raio e densidade do `theme.css` (`@property` initial-value); um teste confere. */
export const DEFAULT_RADIUS = 6;
export const DEFAULT_DENSITY = 1;

export const RADIUS_LIMITS = { min: 0, max: 16, step: 1 } as const;
export const DENSITY_LIMITS = { min: 0.75, max: 1.25, step: 0.05 } as const;

export const MODES: readonly RteThemeMode[] = [
  'auto',
  'inherit',
  'light',
  'dark',
];
export const NEUTRALS: readonly RteNeutral[] = ['tinted', 'gray'];

/** Presets na ordem da tela, com rótulos em pt-BR. */
export const PRESET_LABELS: Readonly<Record<RteThemePresetName, string>> = {
  angular: 'Angular',
  ocean: 'Oceano',
  forest: 'Floresta',
  sunset: 'Pôr do sol',
  monochrome: 'Monocromático',
};
export const PRESET_NAMES = Object.keys(
  PRESET_LABELS,
) as readonly RteThemePresetName[];

export const DEFAULT_STATE: PlaygroundState = {
  primary: RTE_THEME_PRESETS.angular.primary,
  secondary: RTE_THEME_PRESETS.angular.secondary,
  tertiary: RTE_THEME_PRESETS.angular.tertiary,
  mode: 'auto',
  neutral: 'tinted',
  radius: DEFAULT_RADIUS,
  density: DEFAULT_DENSITY,
};

/** Troca só as três cores pelas do preset. */
export function applyPreset(
  state: PlaygroundState,
  name: RteThemePresetName,
): PlaygroundState {
  const preset = RTE_THEME_PRESETS[name];
  return {
    ...state,
    primary: preset.primary,
    secondary: preset.secondary,
    tertiary: preset.tertiary,
  };
}

/** Nome do preset cujas três cores são as do estado (ou `null`). */
export function activePreset(
  state: PlaygroundState,
): RteThemePresetName | null {
  for (const name of PRESET_NAMES) {
    const preset = RTE_THEME_PRESETS[name];
    if (
      same(state.primary, preset.primary) &&
      same(state.secondary, preset.secondary) &&
      same(state.tertiary, preset.tertiary)
    )
      return name;
  }
  return null;
}

/** Compara textos de cor ignorando espaços nas pontas e caixa. */
export function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** `true` se o texto é igual ao padrão Angular do campo. */
export function isDefaultColor(field: ColorField, text: string): boolean {
  return same(text, RTE_THEME_PRESETS.angular[field]);
}

export type Supports = (property: string, value: string) => boolean;

function browserSupports(property: string, value: string): boolean {
  try {
    return (
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports(property, value)
    );
  } catch {
    return false;
  }
}

/** Texto que escaparia da declaração, do bloco ou do comentário no CSS copiável. */
const UNSAFE_COLOR_TEXT = /\/\*|\*\/|[<{};\\]/;

/**
 * Cor válida = o leitor da lib a entende ou o navegador a aceita como `color` (W7). Texto vazio
 * ou com marcas de comentário CSS, `<`, `{`, `}`, `;` ou `\` nunca é válido.
 */
export function isValidColor(
  text: string,
  supports: Supports = browserSupports,
): boolean {
  const value = text.trim();
  if (value === '') return false;
  // O texto vira CSS copiável: nada que feche a declaração, o bloco ou o comentário.
  if (UNSAFE_COLOR_TEXT.test(value)) return false;
  return parseColor(value) !== null || supports('color', value);
}

/** Mensagem de erro do campo de cor, ou `null` se vale. */
export function colorError(
  text: string,
  supports: Supports = browserSupports,
): string | null {
  return isValidColor(text, supports)
    ? null
    : 'Cor inválida: a pré-visualização usa a cor padrão do Angular.';
}

function snap(value: number, min: number, max: number, step: number): number {
  const base = Number.isFinite(value) ? value : min;
  const clamped = Math.min(max, Math.max(min, base));
  const steps = Math.round((clamped - min) / step);
  return Number((min + steps * step).toFixed(2));
}

export function clampRadius(value: number): number {
  const { min, max, step } = RADIUS_LIMITS;
  return snap(value, min, max, step);
}

export function clampDensity(value: number): number {
  const { min, max, step } = DENSITY_LIMITS;
  return snap(value, min, max, step);
}

/**
 * Entrada do `[theme]` do `rte-editor` e do `checkRteTheme`: as cores como digitadas, o modo e os
 * neutros. A lib decide o que fazer com texto inválido (cai no padrão).
 */
export function toRteTheme(state: PlaygroundState): RteTheme {
  return {
    primary: state.primary,
    secondary: state.secondary,
    tertiary: state.tertiary,
    mode: state.mode,
    neutral: state.neutral,
  };
}

/** Valor para o seletor `type="color"` (exige `#rrggbb`): a cor lida pela lib, senão `null`. */
export function colorInputValue(text: string): string | null {
  const rgb = parseColor(text.trim());
  if (!rgb) return null;
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
