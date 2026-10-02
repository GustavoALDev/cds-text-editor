import { describe, expect, it } from 'vitest';
import { checkRteTheme } from './check-theme';
import { parseColor } from './color/parse';
import { ANGULAR_DEFAULTS } from './defaults';
import { RTE_THEME_PRESETS } from './presets';

describe('RTE_THEME_PRESETS', () => {
  it('has exactly the five presets', () => {
    expect(Object.keys(RTE_THEME_PRESETS).sort()).toEqual([
      'angular',
      'forest',
      'monochrome',
      'ocean',
      'sunset',
    ]);
  });

  it('references ANGULAR_DEFAULTS for angular', () => {
    expect(RTE_THEME_PRESETS.angular).toBe(ANGULAR_DEFAULTS);
  });

  it.each(Object.entries(RTE_THEME_PRESETS))(
    '%s has only the 3 seed keys, readable colors and passes checkRteTheme',
    (_name, preset) => {
      expect(Object.keys(preset).sort()).toEqual([
        'primary',
        'secondary',
        'tertiary',
      ]);
      for (const color of Object.values(preset)) {
        expect(parseColor(color)).not.toBeNull();
      }
      const report = checkRteTheme({ ...preset });
      expect(report.invalid).toEqual([]);
      expect(report.checks.filter((c) => !c.pass)).toEqual([]);
      expect(report.ok).toBe(true);
    },
  );
});
