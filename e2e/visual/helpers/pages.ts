import { expect, type Locator, type Page } from '@playwright/test';
import type { RteE2eId } from '../../angular/window';
import {
  editableOf,
  editorHost,
  gotoApp,
  waitForEditor,
} from '../../angular/helpers/app';
import { routeMedia } from '../../angular/helpers/media';
import { frames } from '../../angular/helpers/toolbar';

// Ajudantes das telas da regressão visual (spec 08b, O4). Reaproveitam os do E2E funcional.

export { editableOf, editorHost, routeMedia };

type PageEditorId = RteE2eId | 'draft';

/**
 * Nada sai do repositório: o que não é do app de teste é abortado (a CSP já bloqueia imagens e
 * quadros externos fora da rota `media`; isto só garante que nenhuma rede entra na captura).
 */
export async function blockExternal(page: Page): Promise<void> {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
}

/** Abre `path` do app de teste, espera o editor `id` e dois quadros. */
export async function openEditor(
  page: Page,
  path: string,
  id: PageEditorId,
): Promise<Locator> {
  await blockExternal(page);
  await gotoApp(page, path);
  await waitForEditor(page, id as RteE2eId);
  await frames(page);
  return editorHost(page, id as RteE2eId);
}

/** Carrega `html` pela ponte e espera o documento mudar e assentar. */
export async function setDoc(
  page: Page,
  id: RteE2eId,
  html: string,
): Promise<void> {
  await frames(page);
  await page.evaluate(({ id, html }) => window.rteE2e.setValue(id, html), {
    id,
    html,
  });
  await expect
    .poll(() =>
      editorHost(page, id).evaluate(
        (host) => window.rteE2e.rteHtml(host)?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  await frames(page);
}

/** Corta a altura do host (documentos longos): capturas pequenas e comparáveis. */
export async function capHeight(host: Locator, px = 900): Promise<void> {
  await host.evaluate((el, px) => {
    el.style.maxHeight = `${px}px`;
    el.style.overflow = 'hidden';
  }, px);
}
