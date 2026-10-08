import type { Locator, Page } from '@playwright/test';
import { severeViolations } from './productivity';

// Ajudantes das especificações `@mobile` (spec 08b, O6/O7).

/** Controles interativos (WCAG 2.5.8) medidos nas superfícies do pacote. */
const INTERACTIVE =
  'button, [role="button"], a[href], input:not([type="hidden"]), select, textarea, [role="menuitem"], [role="option"]';

export interface SmallTarget {
  readonly target: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Controles visíveis dentro de `scope` com caixa menor que `min` x `min` px CSS
 * (WCAG 2.5.8, alvo mínimo de 24 px). Vazio quando todos cumprem.
 */
export function smallTargets(scope: Locator, min = 24): Promise<SmallTarget[]> {
  return scope.evaluate(
    (root, args) => {
      const out: { target: string; width: number; height: number }[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(args.selector)) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.width + 0.5 >= args.min && r.height + 0.5 >= args.min) continue;
        const label =
          el.getAttribute('aria-label') ??
          el.getAttribute('title') ??
          el.textContent?.trim() ??
          '';
        out.push({
          target: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${label.slice(0, 30)}"`,
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        });
      }
      return out;
    },
    { selector: INTERACTIVE, min },
  );
}

/** Rolagem da página: `scrollWidth`/`scrollHeight` do documento e a janela. */
export function pageScroll(page: Page): Promise<{
  scrollWidth: number;
  innerWidth: number;
  scrollHeight: number;
  innerHeight: number;
}> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
}

/** Retângulo da viewport visual em coordenadas de layout. */
export function visualRect(page: Page): Promise<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  scale: number;
}> {
  return page.evaluate(() => {
    const v = window.visualViewport;
    if (!v) throw new Error('sem visualViewport');
    return {
      left: v.offsetLeft,
      top: v.offsetTop,
      right: v.offsetLeft + v.width,
      bottom: v.offsetTop + v.height,
      scale: v.scale,
    };
  });
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Retângulo do elemento em coordenadas da viewport de layout. */
export async function rectOf(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

/** `inner` cabe em `outer` (tolerância de `slack` px). */
export function isInside(inner: Box, outer: Box, slack = 1): boolean {
  return (
    inner.left >= outer.left - slack &&
    inner.top >= outer.top - slack &&
    inner.right <= outer.right + slack &&
    inner.bottom <= outer.bottom + slack
  );
}

/** A viewport de layout como retângulo. */
export async function layoutRect(page: Page): Promise<Box> {
  const { innerWidth, innerHeight } = await pageScroll(page);
  return { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
}

/** `inner` cabe na largura da viewport de layout (reflow: sem corte lateral). */
export async function fitsWidth(
  page: Page,
  inner: Box,
  slack = 1,
): Promise<boolean> {
  const { innerWidth } = await pageScroll(page);
  return inner.left >= -slack && inner.right <= innerWidth + slack;
}

/**
 * Violações `serious`/`critical` do axe na página, sem dois falsos positivos conhecidos de
 * `scrollable-region-focusable` (WCAG 2.1.1) que o celular expõe porque a tela estreita faz o
 * conteúdo rolar: o `.tableWrapper` (dentro do editável: o cursor entra nas células e a rolagem
 * acompanha) e a lista do `/` (`aria-activedescendant` a partir do editável, que é `textbox`, não
 * `combobox`, então o axe não a reconhece como popup). Qualquer outra violação, e essa mesma regra
 * em outro elemento, continua reprovando (ADR 0021).
 */
export async function mobileViolations(page: Page) {
  const found = await severeViolations(page);
  const known = /(\.tableWrapper|-slash-list)$/;
  return found.filter(
    (v) =>
      !(
        v.id === 'scrollable-region-focusable' &&
        v.targets.every((t) => known.test(t))
      ),
  );
}
