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
