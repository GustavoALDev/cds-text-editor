import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import { contrastRatio, toRgb } from './helpers/contrast';
import { expectFloating } from './helpers/floating';
import { mediaDialog, routeMedia, selectMediaByClick } from './helpers/media';

// Smoke da spec 05c1 (Tarefa 10) em navegador real: o CSS dos diálogos e dos
// menus de mídia, a seleção por clique do vídeo/embed e a rota `media` (CSP
// própria: abrir `/media` direto). A Tarefa 12 completa a suíte.

const ID = 'media';

for (const zone of [false, true]) {
  test.describe(`smoke${zone ? ' (zone.js)' : ''}`, () => {
    async function open(page: Page): Promise<void> {
      await routeMedia(page.context());
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, ID);
      await expect(editableOf(page, ID).locator('video')).toHaveCount(1);
    }

    test('clique no vídeo e no embed abre o menu e seleciona o figure', async ({
      page,
    }) => {
      await open(page);
      await selectMediaByClick(page, ID, 'video');
      await expectFloating(page, ID, 'video');
      await expect(
        editableOf(page, ID).locator('.rt-figure--video'),
      ).toHaveClass(/ProseMirror-selectednode/);
      const paused = await editableOf(page, ID)
        .locator('video')
        .evaluate((v: HTMLVideoElement) => v.paused);
      expect(paused).toBe(true);

      // O ProseMirror trata dois cliques a menos de 500 ms e 10 px um do outro
      // como duplo clique (e não seleciona o nó): a rolagem leva o embed para a
      // posição do clique no vídeo.
      await page.waitForTimeout(600);
      await selectMediaByClick(page, ID, 'embed');
      await expectFloating(page, ID, 'embed');
      await expect(editableOf(page, ID).locator('.rt-embed')).toHaveClass(
        /ProseMirror-selectednode/,
      );
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });

    test('readonly devolve os eventos ao vídeo', async ({ page }) => {
      await open(page);
      const video = editableOf(page, ID).locator('video');
      expect(
        await video.evaluate((v) => getComputedStyle(v).pointerEvents),
      ).toBe('none');
      await page.evaluate(() => window.rteE2e.toggle('readonly'));
      await expect
        .poll(() => video.evaluate((v) => getComputedStyle(v).pointerEvents))
        .toBe('auto');
    });

    test('a página mostra o último mediaChange e a sessão', async ({
      page,
    }) => {
      await open(page);
      await expect(page.getByTestId('media-session')).toContainText(
        '/e2e.webm',
      );
      expect(
        await page.evaluate(() => window.rteE2e.mediaSession('media')),
      ).toEqual(expect.objectContaining({ added: [], removed: [] }));
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`diálogo de vídeo com faixa (${scheme}): visível, borda e contraste`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page);
        const accepted = await page.evaluate(() =>
          window.rteE2e.openDialog('media', 'video'),
        );
        expect(accepted).toBe(true);
        const dialog = mediaDialog(page, ID);
        await expect(dialog).toBeVisible();
        // Sem faixas: a dica de legendas aparece.
        const hint = dialog.locator('.rte-dialog__hint').last();
        await expect(hint).toBeVisible();
        const hintRatio = await ratio(page, hint, dialog);

        await dialog.getByRole('button', { name: 'Add track' }).click();
        const fieldset = dialog.locator('fieldset.rte-dialog__fieldset');
        await expect(fieldset).toBeVisible();
        const legend = fieldset.locator('legend.rte-dialog__legend');
        await expect(legend).toBeVisible();

        const shown = await dialog.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            display: getComputedStyle(el).display,
            inside:
              r.top >= 0 &&
              r.left >= 0 &&
              r.bottom <= innerHeight + 1 &&
              r.right <= innerWidth + 1,
          };
        });
        expect(shown.display).not.toBe('none');
        expect(shown.inside).toBe(true);

        const border = await fieldset.evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            width: parseFloat(s.borderTopWidth),
            style: s.borderTopStyle,
          };
        });
        expect(border.width).toBeGreaterThan(0);
        expect(border.style).toBe('solid');

        expect(await ratio(page, legend, dialog)).toBeGreaterThanOrEqual(4.5);
        expect(hintRatio).toBeGreaterThanOrEqual(4.5);
        expect(await page.evaluate(() => window.__violations)).toEqual([]);
        await expect(editorHost(page, ID)).toBeVisible();
      });
    }
  });
}

/** Contraste do texto de `el` sobre o fundo do `<dialog>`. */
async function ratio(
  page: Page,
  el: ReturnType<Page['locator']>,
  dialog: ReturnType<Page['locator']>,
): Promise<number> {
  const fg = await el.evaluate((e) => getComputedStyle(e).color);
  const bg = await dialog.evaluate((e) => getComputedStyle(e).backgroundColor);
  return contrastRatio(await toRgb(page, fg), await toRgb(page, bg));
}
