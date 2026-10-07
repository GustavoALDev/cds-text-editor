import type { RtePaletteColor } from './types';

function freezeAll(list: RtePaletteColor[]): readonly RtePaletteColor[] {
  return Object.freeze(list.map((c) => Object.freeze({ ...c })));
}

/** Paleta fechada de cor de texto (spec 03a, seção 4.3). `light` vai no `style`; `dark` é para a spec 06. */
export const RTE_TEXT_COLORS: readonly RtePaletteColor[] = freezeAll([
  { name: 'gray', light: '#5f6368', dark: '#bdc1c6' },
  { name: 'red', light: '#b3261e', dark: '#ff8f87' },
  { name: 'orange', light: '#9f4900', dark: '#f0b84d' },
  { name: 'green', light: '#197136', dark: '#5fd08a' },
  { name: 'blue', light: '#1d4ed8', dark: '#8ab4ff' },
  { name: 'purple', light: '#6b21a8', dark: '#d2a8ff' },
  { name: 'pink', light: '#be185d', dark: '#ff8cc6' },
  { name: 'teal', light: '#0e6e66', dark: '#5eead4' },
]);

/** Paleta fechada de marca-texto (spec 03a, seção 4.3). */
export const RTE_HIGHLIGHT_COLORS: readonly RtePaletteColor[] = freezeAll([
  { name: 'yellow', light: '#fff3a3', dark: '#4d4100' },
  { name: 'green', light: '#ccf2d1', dark: '#1d4a29' },
  { name: 'blue', light: '#d3e8ff', dark: '#1c3a5e' },
  { name: 'pink', light: '#ffd6e8', dark: '#5e1f3d' },
  { name: 'orange', light: '#ffe1bf', dark: '#5c3300' },
  { name: 'purple', light: '#eadcff', dark: '#3f2a63' },
]);
