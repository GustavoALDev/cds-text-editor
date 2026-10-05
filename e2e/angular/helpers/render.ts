import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import type { RteE2eRenderId } from '../window';
import { gotoApp } from './app';

/**
 * Abre uma rota `render*` do app (spec 06, §6.2) e espera a ponte (`rteE2e`) e a
 * exibição do fixture.
 */
export async function gotoRender(
  page: Page,
  path = '/render',
  options: { zone?: boolean } = {},
): Promise<void> {
  await gotoApp(page, path, options);
  // A rota é carregada sob demanda: espera a exibição do fixture registrar-se na ponte.
  await expect
    .poll(() =>
      page.evaluate(() => {
        try {
          return window.rteE2e?.renderedHtml('render-main').length > 0;
        } catch {
          return false;
        }
      }),
    )
    .toBe(true);
}

/** O elemento da exibição `id` da rota `render`. */
export function renderHost(page: Page, id: RteE2eRenderId): Locator {
  return page.locator(`[data-testid="${id}"]`);
}

/**
 * Sem rede de terceiros: tudo fora de `127.0.0.1` recebe 204 vazio (imagens, mídia e
 * embeds do fixture não saem da máquina).
 */
export async function blockThirdParty(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => url.hostname !== '127.0.0.1',
    (route) => route.fulfill({ status: 204, body: '' }),
  );
}

/** Resultado do pré-voo da H10: identidade dos nós do servidor depois da hidratação. */
export interface H10Measure {
  /**
   * `===` entre o nó criado pelo *parser* e o atual (primeiro `h2`, `iframe`, rolador);
   * `null` = o *parser* não chegou a criá-lo (medida inválida, não "nó novo").
   */
  sameNodes: {
    h2: boolean | null;
    iframe: boolean | null;
    scroller: boolean | null;
  };
  /** `iframe` que entraram em `render-main` além dos do *parser* (re-inserção). */
  iframeReloads: number;
  /** Eventos `load` de `iframe` em `render-main` (informativo: `loading="lazy"` e CSP). */
  iframeLoads: number;
}

/**
 * Antes de qualquer script: guarda o primeiro `h2`, o primeiro `iframe` e o primeiro
 * `.rte-table-scroll` de `render-main` assim que o *parser* os cria, todo `iframe` que
 * entrar nele (por identidade) e os seus eventos `load` (pré-voo 19 do plano da spec 06).
 */
export async function watchServerNodes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.__h10) return;
    const state = (window.__h10 = {
      h2: null as Element | null,
      iframe: null as Element | null,
      scroller: null as Element | null,
      iframes: new Set<Element>(),
      iframeLoads: 0,
    });
    const main = () => document.querySelector('[data-testid="render-main"]');
    new MutationObserver(() => {
      const root = main();
      if (!root) return;
      state.h2 ??= root.querySelector('h2');
      state.iframe ??= root.querySelector('iframe');
      state.scroller ??= root.querySelector('.rte-table-scroll');
      for (const f of root.querySelectorAll('iframe')) state.iframes.add(f);
    }).observe(document, { childList: true, subtree: true });
    document.addEventListener(
      'load',
      (e) => {
        if (e.target instanceof HTMLIFrameElement && main()?.contains(e.target))
          state.iframeLoads++;
      },
      true,
    );
  });
}

/** Mede a H10 (chamar depois de `watchServerNodes` + `gotoRender`). */
export function measureH10(page: Page): Promise<H10Measure> {
  return page.evaluate(() => {
    const s = window.__h10!;
    const root = document.querySelector('[data-testid="render-main"]')!;
    const iframes = root.querySelectorAll('iframe').length;
    const same = (server: Element | null, selector: string) =>
      server === null ? null : server === root.querySelector(selector);
    return {
      sameNodes: {
        h2: same(s.h2, 'h2'),
        iframe: same(s.iframe, 'iframe'),
        scroller: same(s.scroller, '.rte-table-scroll'),
      },
      iframeReloads: s.iframes.size - iframes,
      iframeLoads: s.iframeLoads,
    };
  });
}
