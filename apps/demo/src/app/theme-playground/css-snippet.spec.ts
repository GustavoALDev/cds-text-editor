import { RTE_THEME_PRESETS } from '@cds/rte-theme';
import { describe, expect, it } from 'vitest';
import { buildCss, THEME_README_URL } from './css-snippet';
import { applyPreset, DEFAULT_STATE, type PlaygroundState } from './model';

const body = (css: string): string => css.replace(/^\/\*[\s\S]*?\*\/\n\n?/, '');

describe('buildCss', () => {
  it('estado padrão: só o cabeçalho, com o link do README do tema e o aviso do plano B', () => {
    const css = buildCss(DEFAULT_STATE);
    expect(css.startsWith('/*')).toBe(true);
    expect(css).toContain(THEME_README_URL);
    expect(css).toMatch(/plano B/);
    expect(body(css)).toBe('');
    expect(css).not.toContain(':root');
  });

  it('é determinístico', () => {
    const state = applyPreset(DEFAULT_STATE, 'ocean');
    expect(buildCss(state)).toBe(buildCss({ ...state }));
  });

  it('só valores fora do padrão, na ordem primary, secondary, tertiary, radius, density, tint', () => {
    const state: PlaygroundState = {
      ...DEFAULT_STATE,
      tertiary: '#ff0000',
      primary: '#0000ff',
      radius: 2,
      density: 0.9,
      neutral: 'gray',
      secondary: '#00ff00',
    };
    expect(body(buildCss(state))).toBe(
      [
        ':root {',
        '  --rte-primary: #0000ff;',
        '  --rte-secondary: #00ff00;',
        '  --rte-tertiary: #ff0000;',
        '  --rte-radius: 2px;',
        '  --rte-density: 0.9;',
        '  --rte-neutral-tint: 0;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('uma cor igual ao padrão (qualquer caixa) fica de fora', () => {
    const css = buildCss({ ...DEFAULT_STATE, primary: ' #8514F5 ', radius: 3 });
    expect(css).not.toContain('--rte-primary');
    expect(css).toContain('--rte-radius: 3px;');
  });

  it('preserva o texto digitado (oklch, var)', () => {
    const css = buildCss({
      ...DEFAULT_STATE,
      primary: 'oklch(0.6 0.2 250)',
      secondary: ' oklch(from var(--brand) l c h) ',
    }, (_p, v) => v.includes('var('));
    expect(css).toContain('--rte-primary: oklch(0.6 0.2 250);');
    expect(css).toContain('--rte-secondary: oklch(from var(--brand) l c h);');
  });

  it('modo diferente de auto vira .rte-root { color-scheme }', () => {
    for (const mode of ['light', 'dark', 'inherit'] as const) {
      const css = buildCss({ ...DEFAULT_STATE, mode });
      expect(body(css)).toBe(`.rte-root {\n  color-scheme: ${mode};\n}\n`);
    }
  });

  it('o bloco do modo vem depois do :root', () => {
    const css = buildCss({ ...DEFAULT_STATE, primary: '#0000ff', mode: 'dark' });
    expect(css.indexOf(':root')).toBeLessThan(css.indexOf('.rte-root'));
  });

  it('semente inválida fica fora com comentário', () => {
    const css = buildCss({ ...DEFAULT_STATE, primary: 'banana', radius: 4 });
    expect(css).toContain('/* primary inválida: vale o padrão */');
    expect(css).not.toContain('banana');
    expect(css).toContain('--rte-radius: 4px;');
  });

  it('texto de cor que escaparia da declaração, do bloco ou do comentário fica fora', () => {
    const accepts = () => true;
    for (const text of [
      'red; } body { display: none',
      'red /* x',
      'red */ } .a {',
      'red}',
      'red{',
      '</style><script>',
      'red\\3b x',
    ]) {
      const css = buildCss({ ...DEFAULT_STATE, primary: text }, accepts);
      expect(css, text).toContain('/* primary inválida: vale o padrão */');
      expect(css, text).not.toContain('display');
      expect(css, text).not.toContain('--rte-primary');
    }
  });

  it('presets usam as cores do pacote', () => {
    const css = buildCss(applyPreset(DEFAULT_STATE, 'forest'));
    expect(css).toContain(
      `--rte-primary: ${RTE_THEME_PRESETS.forest.primary};`,
    );
  });
});
