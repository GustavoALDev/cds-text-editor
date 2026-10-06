import { expect, test, type Page } from '@playwright/test';
import {
  collectConsole,
  editableOf,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import {
  cancelDialog,
  dialogField,
  dialogsChunk,
  mediaFormsChunk,
  openDialogFrom,
  openDialogOf,
} from './helpers/dialogs';
import { routeMedia } from './helpers/media';
import { selectIn, toolbarButton } from './helpers/toolbar';

// N33 (spec 05c2a, R1, R2, E2): os formulários de imagem, vídeo e *embed* vêm
// de um `@defer` próprio (`RteMediaForms`, *chunk* com `rte-image-form`)
// dentro do `<dialog>`; o `RteEditor` tem um bloco só de pré-carga em ocioso.
// Lista de requisições: sem diálogo aberto, os dois *chunks* (diálogos e
// mídia) são pedidos em ocioso, uma vez cada; abrir link e imagem não pede
// nada de novo. Falha do *chunk* de mídia: o pedido fecha como cancelamento
// com o foco devolvido à origem, a mídia passa a ser recusada e o link segue
// abrindo (Ruling 1).

/** Quantas vezes cada URL foi pedida (eventos `request` da página). */
function requestLog(page: Page): Map<string, number> {
  const seen = new Map<string, number>();
  page.on('request', (r) => seen.set(r.url(), (seen.get(r.url()) ?? 0) + 1));
  return seen;
}

for (const zone of [false, true]) {
  test.describe(`N33 (${zone ? 'zone' : 'zoneless'})`, () => {
    test('pré-carga em ocioso dos dois chunks, sem diálogo; link e imagem abrem sem requisição nova', async ({
      page,
    }) => {
      const seen = requestLog(page);
      const messages = collectConsole(page);
      const dialogs = await dialogsChunk(page);
      const media = await mediaFormsChunk(page);
      await gotoApp(page, '/dialogs', { zone });
      await waitForEditor(page, 'dialogs');
      // Nenhum pedido de diálogo: só as pré-cargas ociosas buscam os chunks.
      const [dialogsUrl, mediaUrl] = await Promise.all([
        dialogs.requested,
        media.requested,
      ]);
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      await expect(page.locator('dialog.rte-dialog')).toHaveCount(0);
      expect(dialogsUrl).not.toBe(mediaUrl);
      await settlePage(page);
      expect(seen.get(dialogsUrl)).toBe(1);
      expect(seen.get(mediaUrl)).toBe(1);
      const before = [...seen.keys()];

      await selectIn(page, 'dialogs', 'Fim');
      const link = await openDialogFrom(page, 'dialogs', 'api', 'link');
      await expect(dialogField(link, 'Address (URL)')).toBeFocused();
      await cancelDialog(link);
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);

      await selectIn(page, 'dialogs', 'Fim', 3);
      const image = await openDialogFrom(page, 'dialogs', 'api', 'image');
      await expect(image).toHaveAccessibleName('Insert image');
      await expect(dialogField(image, 'Image address (URL)')).toBeFocused();
      await cancelDialog(image);
      await settlePage(page);

      expect(seen.get(dialogsUrl)).toBe(1);
      expect(seen.get(mediaUrl)).toBe(1);
      const scripts = [...seen.keys()].filter(
        (u) => !before.includes(u) && /\.m?js$/.test(new URL(u).pathname),
      );
      expect(scripts).toEqual([]);
      expect(messages.filter((m) => m.includes('NG05'))).toEqual([]);
    });

    test('chunk de mídia abortado: imagem fecha como cancelamento com foco na origem; mídia recusada; link segue abrindo', async ({
      page,
    }) => {
      await routeMedia(page.context());
      const media = await mediaFormsChunk(page);
      media.abort();
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, 'media');
      await media.requested;
      await settlePage(page);

      await selectIn(page, 'media', 'Mídia', 5);
      const origin = toolbarButton(page, 'media', 'Insert image');
      await origin.click();
      await page.waitForTimeout(300);
      await expect(page.locator('dialog.rte-dialog[open]')).toHaveCount(0);
      await expect(origin).toBeFocused();
      // Sem pedido pendente nem seleção pendente; o editor continua editável.
      expect(
        await page.evaluate(() => window.rteE2e.openDialog('media', 'image')),
      ).toBe(false);
      expect(
        await page.evaluate(() => window.rteE2e.openDialog('media', 'video')),
      ).toBe(false);

      await selectIn(page, 'media', 'Mídia', 5);
      await page.keyboard.type('z');
      await expect(editableOf(page, 'media')).toContainText('Mídiaz');

      await selectIn(page, 'media', 'Mídiaz');
      const link = await openDialogFrom(page, 'media', 'api', 'link');
      await expect(link).toHaveAccessibleName('Insert link');
      await expect(dialogField(link, 'Address (URL)')).toBeFocused();
      await cancelDialog(link);
      await expect(openDialogOf(page, 'media')).toHaveCount(0);
    });
  });
}
