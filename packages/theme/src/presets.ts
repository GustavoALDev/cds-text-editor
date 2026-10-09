/**
 * Presets de cores-semente. Somente leitura (`as const`); `angular` é o padrão do Angular.
 * Todos passam em `checkRteTheme` nos dois modos.
 */
export const RTE_THEME_PRESETS = {
  // Cores padrão do Angular (ADR 0002).
  angular: { primary: '#8514f5', secondary: '#f637e3', tertiary: '#0546ff' },
  ocean: { primary: '#0369a1', secondary: '#0e7490', tertiary: '#4f46e5' },
  forest: { primary: '#15803d', secondary: '#65a30d', tertiary: '#0d9488' },
  sunset: { primary: '#ea580c', secondary: '#db2777', tertiary: '#9333ea' },
  monochrome: { primary: '#374151', secondary: '#6b7280', tertiary: '#111827' },
} as const;

/** Nome de um tema pronto de `RTE_THEME_PRESETS`. */
export type RteThemePresetName = keyof typeof RTE_THEME_PRESETS;
