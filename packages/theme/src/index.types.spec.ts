import { describe, expect, it } from 'vitest';
import {
  ANGULAR_DEFAULTS,
  RTE_THEME_PRESETS,
  type ColorParser,
  type RteNeutral,
  type RteTheme,
  type RteThemeCheck,
  type RteThemeMode,
  type RteThemePresetName,
  type RteThemeReport,
  type SuggestRteColorOptions,
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
    const parser: ColorParser = () => null;
    const suggest: SuggestRteColorOptions = {};
    expect(theme.mode).toBe('inherit');
    expect(report.ok).toBe(true);
    expect(RTE_THEME_PRESETS[name].primary).toBeTruthy();
    expect(ANGULAR_DEFAULTS.primary).toBeTruthy();
    expect(parser('x')).toBeNull();
    expect(suggest).toEqual({});
  });
});
