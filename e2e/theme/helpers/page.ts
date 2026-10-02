import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { Rgb8 } from '../../../packages/theme/src/color/convert';
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

export interface GridEntry {
  seed: string;
  mode: Mode;
  tokens: Tokens;
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
    ({ seeds, modes, forcePlanB }) => {
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
          out.push({ seed, mode, tokens });
        }
      }
      return out;
    },
    { seeds, modes, forcePlanB },
  ) as Promise<GridEntry[]>;
}

export async function readTokens(
  page: Page,
  {
    seed,
    mode,
    forcePlanB,
  }: { seed: string; mode: Mode; forcePlanB?: boolean },
): Promise<Record<string, Rgb8>> {
  const [entry] = await readTokenGrid(page, {
    seeds: [seed],
    modes: [mode],
    forcePlanB,
  });
  if (!entry) throw new Error('readTokens: empty grid');
  return entry.tokens;
}
