import type { Page } from '@playwright/test';
import {
  from8,
  luminance,
  toLinear,
  type Rgb8,
} from '../../../packages/theme/src/color/convert';

/** Padrões Angular (R3): o que `--rte-primary|secondary|tertiary` exibem quando o valor é inválido. */
export const DEFAULT_SEEDS = {
  primary: [133, 20, 245],
  secondary: [246, 55, 227],
  tertiary: [5, 70, 255],
} as const satisfies Record<string, Rgb8>;

/** Erros de página e de console (`pageerror` + `console.error`); o array é preenchido ao vivo. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Cor realmente exibida (8 bits sRGB, via canvas 1x1) de cada `--rte-<nome>`, lida pelo
 * background de #probe, filho de #root.
 */
export function shown(
  page: Page,
  names: string[],
): Promise<Record<string, Rgb8>> {
  return page.evaluate((list) => {
    const probe = document.getElementById('probe') as HTMLElement;
    const cv = document.getElementById('cv') as HTMLCanvasElement;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const out: Record<string, [number, number, number]> = {};
    for (const n of list) {
      probe.style.backgroundColor = '';
      probe.style.backgroundColor = `var(--rte-${n})`;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = getComputedStyle(probe).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[n] = [d[0]!, d[1]!, d[2]!];
    }
    return out;
  }, names) as Promise<Record<string, Rgb8>>;
}

export async function shownOne(page: Page, name: string): Promise<Rgb8> {
  const all = await shown(page, [name]);
  return all[name]!;
}

/** Luminância relativa WCAG de uma cor de 8 bits. */
export const relLuminance = (c: Rgb8): number => luminance(toLinear(from8(c)));

export const sameColor = (a: Rgb8, b: Rgb8, tol = 0): boolean =>
  a.every((v, i) => Math.abs(v - b[i]!) <= tol);

/** Valor computado (texto) de uma variável em #root. */
export function computed(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) =>
      getComputedStyle(document.getElementById('root')!)
        .getPropertyValue(n)
        .trim(),
    name,
  );
}

/** Adiciona uma folha de estilo (sem camada) à página já carregada. */
export function addCss(page: Page, css: string): Promise<void> {
  return page.evaluate((text) => {
    const s = document.createElement('style');
    s.textContent = text;
    document.head.append(s);
  }, css);
}

/** Envolve #root num ancestral `<div id="wrap">`. */
export function wrapRoot(page: Page): Promise<void> {
  return page.evaluate(() => {
    const root = document.getElementById('root')!;
    const wrap = document.createElement('div');
    wrap.id = 'wrap';
    root.before(wrap);
    wrap.append(root);
  });
}

/** Como addCss, mas no INÍCIO do head: a folha vem antes do theme.css na ordem do documento. */
export function addCssFirst(page: Page, css: string): Promise<void> {
  return page.evaluate((text) => {
    const s = document.createElement('style');
    s.textContent = text;
    document.head.prepend(s);
  }, css);
}
