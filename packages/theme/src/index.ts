export const THEME_VERSION = '0.0.0';

export { createRteTheme } from './create-theme';
export type { CreateRteThemeOptions } from './create-theme';
export { checkRteTheme, suggestRteColor, warnIfPoorTheme } from './check-theme';
export type {
  CheckThemeOptions,
  RteThemeCheck,
  RteThemeReport,
  SuggestRteColorOptions,
} from './check-theme';
export { applyRteTheme, supportsRelativeColors } from './apply-theme';
export type { ApplyRteThemeOptions } from './apply-theme';
export { parseColor } from './color/parse';
export { ANGULAR_DEFAULTS } from './defaults';
export type { ColorParser } from './defaults';
export { RTE_THEME_PRESETS } from './presets';
export type { RteThemePresetName } from './presets';
export type {
  RteNeutral,
  RteTheme,
  RteThemeMode,
  RteThemeVariables,
} from './types';
export type { Rgb } from './color/convert';
