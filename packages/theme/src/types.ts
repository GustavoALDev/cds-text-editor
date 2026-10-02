export type { Rgb, Rgb8 } from './color/convert';

export type RteThemeMode = 'auto' | 'inherit' | 'light' | 'dark';
export type RteNeutral = 'tinted' | 'gray';

/** Até 3 cores-semente (qualquer cor CSS) e as opções de modo e neutros. */
export interface RteTheme {
  primary?: string;
  secondary?: string;
  tertiary?: string;
  mode?: RteThemeMode;
  neutral?: RteNeutral;
}
