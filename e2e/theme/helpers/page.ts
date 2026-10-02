import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { themeBundle } from './bundle';
import type { Tokens } from './contrast';

const THEME_CSS = resolve(__dirname, '../../../packages/theme/src/theme.css');

export type Mode = 'light' | 'dark';

export interface BrowserSupport {
  relativeColors: boolean;
  lightDark: boolean;
  property: boolean;
}

export async function loadThemePage(
  page: Page,
  options: { css?: string } = {},
): Promise<void> {
  const css = options.css ?? readFileSync(THEME_CSS, 'utf8');
  await page.setContent(
    `<style>${css}</style><div class="rte-root" id="root"><div id="probe"></div></div><canvas id="cv" width="1" height="1"></canvas>`,
  );
  await page.addScriptTag({ content: themeBundle() });
}

export function readSupport(page: Page): Promise<BrowserSupport> {
  return page.evaluate(() => ({
    relativeColors: window.RteTheme.supportsRelativeColors(),
    lightDark: CSS.supports('color', 'light-dark(red, blue)'),
    property: typeof CSSPropertyRule !== 'undefined',
  }));
}

export interface GridOptions {
  seeds: string[];
  modes?: Mode[];
  /** Plano B (`applyRteTheme(..., { force: true })`) em vez do CSS nativo. */
  forcePlanB?: boolean | undefined;
}

/** Variáveis derivadas sondadas no estilo INLINE de #root (provam qual plano rodou). */
export const PROBE_NAMES = ['surface', 'primary-hover', 'on-primary'] as const;

export interface GridEntry {
  seed: string;
  mode: Mode;
  tokens: Tokens;
  /** Valor inline de `--rte-<nome>` em #root após `applyRteTheme`. */
  inline: Record<string, string>;
  /** O que `createRteTheme` (plano B) devolve para o mesmo tema. */
  expected: Record<string, string>;
}

/**
 * Prova qual plano rodou: no plano B o inline traz hex iguais ao `createRteTheme`; no nativo o
 * inline não traz nenhuma variável derivada (só sementes e data-rte-mode).
 */
export function probeProblems(
  entry: GridEntry,
  variant: 'native' | 'plan B',
): string[] {
  const out: string[] = [];
  for (const n of PROBE_NAMES) {
    const got = entry.inline[n] ?? '';
    const want = entry.expected[n] ?? '';
    if (variant === 'native') {
      if (got !== '')
        out.push(
          `${entry.seed} ${entry.mode}: nativo mas --rte-${n} inline = "${got}" (esperado vazio)`,
        );
    } else if (!/^#[0-9a-f]{6}$/i.test(got)) {
      out.push(
        `${entry.seed} ${entry.mode}: plano B não definiu --rte-${n} como hex (inline = "${got}")`,
      );
    } else if (got !== want) {
      out.push(
        `${entry.seed} ${entry.mode}: --rte-${n} inline "${got}" difere de createRteTheme "${want}"`,
      );
    }
  }
  return out;
}

/**
 * Lê, numa única ida ao navegador, a cor realmente exibida (8 bits sRGB, via canvas 1x1 como o
 * harness do spike) de cada token, para cada semente × modo. As 3 sementes de papel recebem a
 * mesma cor, então uma passada cobre primary, secondary e tertiary.
 */
export function readTokenGrid(
  page: Page,
  { seeds, modes = ['light', 'dark'], forcePlanB = false }: GridOptions,
): Promise<GridEntry[]> {
  return page.evaluate(
    ({ seeds, modes, forcePlanB, probeNames }) => {
      const root = document.getElementById('root') as HTMLElement;
      const probe = document.getElementById('probe') as HTMLElement;
      const cv = document.getElementById('cv') as HTMLCanvasElement;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      const rgb = (css: string): [number, number, number] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!];
      };
      const get = (name: string): [number, number, number] => {
        probe.style.backgroundColor = `var(--rte-${name})`;
        return rgb(getComputedStyle(probe).backgroundColor);
      };
      const names = [
        'surface',
        'surface-raised',
        'text',
        'text-muted',
        'border',
        'focus',
      ];
      for (const r of ['primary', 'secondary', 'tertiary'])
        names.push(
          r,
          `on-${r}`,
          `${r}-hover`,
          `${r}-active`,
          `${r}-text`,
          `${r}-subtle`,
          `${r}-border`,
        );
      const out: {
        seed: string;
        mode: 'light' | 'dark';
        tokens: Record<string, [number, number, number]>;
        inline: Record<string, string>;
        expected: Record<string, string>;
      }[] = [];
      for (const seed of seeds) {
        for (const mode of modes) {
          window.RteTheme.applyRteTheme(root, {
            primary: seed,
            secondary: seed,
            tertiary: seed,
            mode,
            force: forcePlanB,
          });
          const tokens: Record<string, [number, number, number]> = {};
          for (const n of names) tokens[n] = get(n);
          const theme = window.RteTheme.createRteTheme({
            primary: seed,
            secondary: seed,
            tertiary: seed,
            mode,
          });
          const inline: Record<string, string> = {};
          const expected: Record<string, string> = {};
          for (const n of probeNames) {
            inline[n] = root.style.getPropertyValue(`--rte-${n}`);
            expected[n] = theme[`--rte-${n}`] ?? '';
          }
          out.push({ seed, mode, tokens, inline, expected });
        }
      }
      return out;
    },
    { seeds, modes, forcePlanB, probeNames: [...PROBE_NAMES] },
  ) as Promise<GridEntry[]>;
}

export interface BothEntry {
  seeds: [string, string, string];
  mode: Mode;
  neutral: 'tinted' | 'gray';
  native: Tokens;
  planB: Tokens;
}

export interface BothCase {
  seeds: [string, string, string];
  mode: Mode;
  neutral: 'tinted' | 'gray';
}

/**
 * Para cada caso, lê numa só ida ao navegador os tokens exibidos (8 bits, canvas 1x1) com o CSS
 * nativo e depois com o plano B forçado; limpa o estilo inline entre as leituras.
 */
export function readTokensBoth(
  page: Page,
  cases: BothCase[],
): Promise<BothEntry[]> {
  return page.evaluate((cases) => {
    const root = document.getElementById('root') as HTMLElement;
    const probe = document.getElementById('probe') as HTMLElement;
    const cv = document.getElementById('cv') as HTMLCanvasElement;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const names = [
      'surface',
      'surface-raised',
      'text',
      'text-muted',
      'border',
      'focus',
    ];
    for (const r of ['primary', 'secondary', 'tertiary'])
      names.push(
        r,
        `on-${r}`,
        `${r}-hover`,
        `${r}-active`,
        `${r}-text`,
        `${r}-subtle`,
        `${r}-border`,
      );
    const read = (): Record<string, [number, number, number]> => {
      const out: Record<string, [number, number, number]> = {};
      for (const n of names) {
        probe.style.backgroundColor = `var(--rte-${n})`;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = getComputedStyle(probe).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        out[n] = [d[0]!, d[1]!, d[2]!];
      }
      return out;
    };
    const run = (
      c: (typeof cases)[number],
      force: boolean,
    ): Record<string, [number, number, number]> => {
      const cleanup = window.RteTheme.applyRteTheme(root, {
        primary: c.seeds[0],
        secondary: c.seeds[1],
        tertiary: c.seeds[2],
        mode: c.mode,
        neutral: c.neutral,
        force,
      });
      const t = read();
      cleanup();
      return t;
    };
    return cases.map((c) => ({
      ...c,
      native: run(c, false),
      planB: run(c, true),
    }));
  }, cases) as Promise<BothEntry[]>;
}
