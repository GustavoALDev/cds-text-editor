import type { Rgb } from './types';

/** Cores padrão do Angular (ADR 0002). */
export const ANGULAR_DEFAULTS = {
  primary: '#8514f5',
  secondary: '#f637e3',
  tertiary: '#0546ff',
} as const;

export type ColorParser = (input: string) => Rgb | null;
