import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { RteE2eId } from '../window';
import { editableOf, editorHost } from './app';

// Ajudantes da página `/media` (spec 05c1, N25–N31).

const PNG = readFileSync(resolve(__dirname, '../app/public/e2e.png'));

export type MediaKind = 'image' | 'video' | 'embed';

/**
 * Responde `https://media.example.test/**` com o `e2e.png` e os três
 * provedores de *embed* com HTML vazio `200` (sem rede). Chamar antes de
 * abrir a página.
 */
export async function routeMedia(context: BrowserContext): Promise<void> {
  await context.route('https://media.example.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
  await context.route(
    /^https:\/\/(?:www\.youtube-nocookie\.com|player\.vimeo\.com|open\.spotify\.com)\//,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>embed</title>',
      }),
  );
}

/** O `<dialog>` aberto do editor `id`. */
export function mediaDialog(page: Page, id: RteE2eId): Locator {
  return editorHost(page, id).locator('dialog.rte-dialog[open]');
}

const TARGETS: Record<MediaKind, string> = {
  image: '.rt-figure:not(.rt-figure--video) img',
  video: '.rt-figure--video',
  embed: '.rt-embed',
};

/**
 * Seleciona o nó de mídia com um clique real no primeiro elemento do tipo.
 */
export async function selectMediaByClick(
  page: Page,
  id: RteE2eId,
  kind: MediaKind,
): Promise<void> {
  const target = editableOf(page, id).locator(TARGETS[kind]).first();
  // Clica no `<figure>`, não no `<video>`/`<iframe>` (com `pointer-events: none`
  // o clique real cai no `<figure>`); sem `force`, o Playwright espera a caixa
  // parar (o vídeo muda de altura quando os metadados chegam, no Firefox).
  await target.scrollIntoViewIfNeeded();
  // Deixa a rolagem e o reposicionamento dos menus assentarem: no Firefox, o
  // clique no mesmo quadro da rolagem mantinha a seleção anterior.
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await target.click();
}
