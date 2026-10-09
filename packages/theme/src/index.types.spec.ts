import { describe, expect, it } from 'vitest';
import {
  RTE_THEME_PRESETS,
  applyRteTheme,
  checkRteTheme,
  createRteTheme,
  type RteApplyThemeOptions,
  type RteCheckThemeOptions,
  type RteColorParser,
  type RteCreateThemeOptions,
  type RteRgb,
  type RteNeutral,
  type RteTheme,
  type RteThemeCheck,
  type RteThemeMode,
  type RteThemePresetName,
  type RteThemeReport,
  type RteThemeVariables,
  type RteSuggestColorOptions,
} from './index';

// Compile-time proof: the typecheck target fails if any public type is missing.
describe('public types', () => {
  it('are usable', () => {
    const mode: RteThemeMode = 'inherit';
    const neutral: RteNeutral = 'gray';
    const theme: RteTheme = { primary: '#000', mode, neutral };
    const check: RteThemeCheck = {
      id: 'C1',
      label: 'x',
      mode: 'light',
      ratio: 5,
      min: 4.5,
      pass: true,
    };
    const report: RteThemeReport = { ok: true, checks: [check], invalid: [] };
    const name: RteThemePresetName = 'ocean';
    const parser: RteColorParser = () => null;
    const suggest: RteSuggestColorOptions = {};
    expect(theme.mode).toBe('inherit');
    expect(report.ok).toBe(true);
    expect(RTE_THEME_PRESETS[name].primary).toBeTruthy();
    expect(RTE_THEME_PRESETS.angular.primary).toBeTruthy();
    expect(parser('x')).toBeNull();
    expect(suggest).toEqual({});
  });

  it('expõe os tipos das assinaturas públicas (opções, RteRgb e o mapa de variáveis)', () => {
    const rgb: RteRgb = [0, 0.5, 1];
    const parse: RteColorParser = () => rgb;
    const create: RteCreateThemeOptions = {
      primary: '#000',
      dark: true,
      parseColor: parse,
    };
    const check: RteCheckThemeOptions = {
      secondary: '#fff',
      parseColor: parse,
    };
    const apply: RteApplyThemeOptions = { tertiary: '#123', force: true };
    const vars: RteThemeVariables = createRteTheme(create);
    // As chaves são `--rte-*`: um nome sem o prefixo não é aceito pelo tipo.
    // @ts-expect-error chave fora do padrão `--rte-${string}`
    const bad: RteThemeVariables = { surface: '#fff' };
    const params: [
      Parameters<typeof applyRteTheme>[1],
      Parameters<typeof checkRteTheme>[0],
    ] = [apply, check];
    expect(vars['--rte-primary']).toBe('#0080ff'); // o parser customizado foi usado
    expect(bad).toBeTruthy();
    expect(params).toHaveLength(2);
  });
});
