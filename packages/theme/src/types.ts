export type { RteRgb, Rgb8 } from './color/convert';

/** Modo de cor do tema: `auto`, `inherit`, `light` ou `dark`. */
export type RteThemeMode = 'auto' | 'inherit' | 'light' | 'dark';
/**
 * Família dos neutros do tema: `tinted` (tingidos pela primária) ou `gray` (cinzas puros).
 */
export type RteNeutral = 'tinted' | 'gray';

/** Até 3 cores-semente (qualquer cor CSS) e as opções de modo e neutros. */
export interface RteTheme {
  /** Cor-semente do papel primário (qualquer cor CSS). */
  primary?: string;
  /** Cor-semente do papel secundário (qualquer cor CSS). */
  secondary?: string;
  /** Cor-semente do papel terciário (qualquer cor CSS). */
  tertiary?: string;
  /**
   * Modo de cor: `auto` segue o sistema, `inherit` herda do contêiner, `light` e `dark` forçam um dos dois.
   */
  mode?: RteThemeMode;
  /** Família dos neutros: `tinted` (padrão) ou `gray`. */
  neutral?: RteNeutral;
}

/** Mapa devolvido por `createRteTheme`: nome da variável `--rte-*` -> valor CSS. */
export type RteThemeVariables = Record<`--rte-${string}`, string>;
