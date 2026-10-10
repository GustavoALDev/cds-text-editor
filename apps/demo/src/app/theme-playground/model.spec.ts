// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RTE_THEME_PRESETS } from '@comodeviaser/rte-theme';
import { describe, expect, it } from 'vitest';
import {
  activePreset,
  applyPreset,
  clampDensity,
  clampRadius,
  colorInputValue,
  colorError,
  DEFAULT_DENSITY,
  DEFAULT_RADIUS,
  DEFAULT_STATE,
  DENSITY_LIMITS,
  isValidColor,
  MODES,
  NEUTRALS,
  PRESET_LABELS,
  PRESET_NAMES,
  RADIUS_LIMITS,
  toRteTheme,
} from './model';

const themeCss = readFileSync(
  resolve(process.cwd(), 'node_modules/@comodeviaser/rte-theme/dist/theme.css'),
  'utf8',
);

/** `initial-value` da `@property` no theme.css instalado. */
function initialValue(name: string): string {
  const match = new RegExp(
    `@property\\s+${name}\\s*\\{[^}]*initial-value:\\s*([^;]+);`,
  ).exec(themeCss);
  if (!match) throw new Error(`@property ${name} não encontrada no theme.css`);
  return (match[1] as string).trim();
}

describe('padrões', () => {
  it('cores = RTE_THEME_PRESETS.angular, modo auto, neutros tingidos', () => {
    expect(DEFAULT_STATE).toMatchObject({
      primary: RTE_THEME_PRESETS.angular.primary,
      secondary: RTE_THEME_PRESETS.angular.secondary,
      tertiary: RTE_THEME_PRESETS.angular.tertiary,
      mode: 'auto',
      neutral: 'tinted',
    });
  });

  it('raio e densidade padrão são os do theme.css instalado', () => {
    expect(`${DEFAULT_RADIUS}px`).toBe(initialValue('--rte-radius'));
    expect(String(DEFAULT_DENSITY)).toBe(initialValue('--rte-density'));
    expect(DEFAULT_STATE.radius).toBe(DEFAULT_RADIUS);
    expect(DEFAULT_STATE.density).toBe(DEFAULT_DENSITY);
  });
});

describe('presets', () => {
  it('as 5 chaves de RTE_THEME_PRESETS, com os rótulos pt-BR', () => {
    expect(PRESET_NAMES).toEqual(Object.keys(RTE_THEME_PRESETS));
    expect(PRESET_NAMES.map((n) => PRESET_LABELS[n])).toEqual([
      'Angular',
      'Oceano',
      'Floresta',
      'Pôr do sol',
      'Monocromático',
    ]);
  });

  it('escolher um preset troca só as três cores', () => {
    const before = {
      ...DEFAULT_STATE,
      mode: 'dark' as const,
      neutral: 'gray' as const,
      radius: 2,
      density: 0.9,
    };
    for (const name of PRESET_NAMES) {
      const after = applyPreset(before, name);
      expect(after).toEqual({ ...before, ...RTE_THEME_PRESETS[name] });
      expect(activePreset(after)).toBe(name);
    }
  });

  it('activePreset é null para cores próprias', () => {
    expect(
      activePreset({ ...DEFAULT_STATE, primary: 'oklch(0.6 0.2 250)' }),
    ).toBe(null);
  });

  it('nenhum arquivo do playground tem cor hexadecimal literal', () => {
    const dir = resolve(process.cwd(), 'src/app/theme-playground');
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
    );
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe('cor', () => {
  const none = (): boolean => false;

  it('aceita o que o parseColor da lib entende', () => {
    for (const ok of ['#0ea5e9', 'rgb(1 2 3)', 'oklch(0.6 0.2 250)'])
      expect(isValidColor(ok, none), ok).toBe(true);
  });

  it('aceita o que o navegador aceita como color (CSS.supports)', () => {
    const supports = (p: string, v: string): boolean =>
      p === 'color' && v === 'var(--minha-cor)';
    expect(isValidColor('var(--minha-cor)', supports)).toBe(true);
  });

  it('rejeita texto inválido ou vazio e devolve a mensagem de erro', () => {
    for (const bad of ['banana', '', '   ', '12px'])
      expect(isValidColor(bad, none), bad).toBe(false);
    expect(colorError('banana', none)).toMatch(/inválida/);
    expect(colorError('#fff', none)).toBeNull();
  });

  it('cor inválida: o texto vai como digitado e a lib decide (cai no padrão)', () => {
    const theme = toRteTheme({ ...DEFAULT_STATE, secondary: 'banana' });
    expect(theme).toEqual({
      primary: RTE_THEME_PRESETS.angular.primary,
      secondary: 'banana',
      tertiary: RTE_THEME_PRESETS.angular.tertiary,
      mode: 'auto',
      neutral: 'tinted',
    });
  });
});

describe('colorInputValue', () => {
  it('converte o que a lib lê em #rrggbb e devolve null para o resto', () => {
    expect(colorInputValue('#0EA5E9')).toBe('#0ea5e9');
    expect(colorInputValue(' rgb(255 0 0) ')).toBe('#ff0000');
    expect(colorInputValue('banana')).toBeNull();
  });
});

describe('limites', () => {
  it('raio 0–16, passo 1', () => {
    expect(RADIUS_LIMITS).toEqual({ min: 0, max: 16, step: 1 });
    expect(clampRadius(-3)).toBe(0);
    expect(clampRadius(99)).toBe(16);
    expect(clampRadius(2.4)).toBe(2);
    expect(clampRadius(Number.NaN)).toBe(0);
  });

  it('densidade 0,75–1,25, passo 0,05', () => {
    expect(DENSITY_LIMITS).toEqual({ min: 0.75, max: 1.25, step: 0.05 });
    expect(clampDensity(0)).toBe(0.75);
    expect(clampDensity(3)).toBe(1.25);
    expect(clampDensity(0.9)).toBe(0.9);
    expect(clampDensity(0.93)).toBe(0.95);
  });

  it('modos e neutros', () => {
    expect(MODES).toEqual(['auto', 'inherit', 'light', 'dark']);
    expect(NEUTRALS).toEqual(['tinted', 'gray']);
  });
});
