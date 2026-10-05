import { expect, test, type Page } from '@playwright/test';
import { editableOf, gotoApp, waitForEditor } from './helpers/app';
import {
  dialogField,
  openDialogFrom,
  openDialogOf,
  submitDialog,
} from './helpers/dialogs';
import { expectFloating, floatingItem, floatingMenu } from './helpers/floating';
import { routeMedia } from './helpers/media';
import {
  arrowToMenuItem,
  focusedLabel,
  loadDoc,
  rteHtml,
  selectIn,
} from './helpers/toolbar';

// N27 (spec 05c1, R3/R6): o diálogo de imagem pela interface — barra,
// "Image details…" do menu flutuante e teclado (`Alt+F10`, setas, `Enter`),
// com o `getRteHtml` esperado, a imagem exibida no navegador e `Mod+Z`.
// `/media` direto (CSP própria); `e2e.png` é 1 x 1 (proporção natural 1).

const ID = 'media';
const BASE = '<p>Início</p><p>Fim</p>';
const MEDIA_URL_ERROR =
  'Address not accepted. Use https:// or a path starting with /, on an allowed host.';
const IMG = 'figure.rt-figure img';
/** Janela do ProseMirror para agrupar passos de desfazer (newGroupDelay 500 ms). */
const UNDO_GROUP_MS = 600;

const figure = (align: string, src: string, alt: string) =>
  `<figure class="rt-figure rt-figure--${align}"><img src="${src}" alt="${alt}" loading="lazy" decoding="async"></figure>`;

for (const zone of [false, true]) {
  test.describe(`N27${zone ? ' (zone.js)' : ''}`, () => {
    test.beforeEach(async ({ page }) => {
      await routeMedia(page.context());
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, ID);
      await loadDoc(page, ID, BASE);
    });

    /** Insere pela barra: cursor no fim de "Início", `Insert image`. */
    async function insertViaToolbar(
      page: Page,
      fields: { src: string; alt?: string; decorative?: boolean },
    ) {
      await selectIn(page, ID, 'Início', 6);
      const dialog = await openDialogFrom(page, ID, 'toolbar', 'image');
      await expect(dialogField(dialog, 'Image address (URL)')).toBeFocused();
      await dialogField(dialog, 'Image address (URL)').fill(fields.src);
      if (fields.alt !== undefined)
        await dialogField(dialog, 'Alternative text').fill(fields.alt);
      if (fields.decorative)
        await dialogField(dialog, 'Decorative image').check();
      await submitDialog(dialog);
      return dialog;
    }

    /** "Image details…" do menu da imagem selecionada, por clique. */
    async function openDetails(page: Page) {
      await expectFloating(page, ID, 'image');
      await floatingItem(
        floatingMenu(page, ID, 'image'),
        'Image details…',
      ).click();
      const dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test('inserir /e2e.png com alt pela barra: HTML, menu e Mod+Z', async ({
      page,
    }) => {
      const dialog = await insertViaToolbar(page, {
        src: '/e2e.png',
        alt: 'Logo do teste',
      });
      await expect(dialog).toBeHidden();
      await expect
        .poll(() => rteHtml(page, ID))
        .toBe(
          `<p>Início</p>${figure('center', '/e2e.png', 'Logo do teste')}<p>Fim</p>`,
        );
      await expectFloating(page, ID, 'image');
      await expect(editableOf(page, ID).locator(IMG)).toHaveCount(1);
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
      await expect(editableOf(page, ID)).toBeFocused();
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(() => rteHtml(page, ID)).toBe(BASE);
    });

    test('endereço https do host permitido é aceito (rota interceptada)', async ({
      page,
    }) => {
      await insertViaToolbar(page, {
        src: 'https://media.example.test/a.png',
        alt: 'Remota',
      });
      await expect
        .poll(() => rteHtml(page, ID))
        .toContain('src="https://media.example.test/a.png"');
      await expect
        .poll(() =>
          editableOf(page, ID)
            .locator(IMG)
            .evaluate((i: HTMLImageElement) => i.naturalWidth),
        )
        .toBe(1);
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });

    test('decorativa: alt vazio no HTML e o campo de alt desabilitado', async ({
      page,
    }) => {
      await insertViaToolbar(page, {
        src: '/e2e.png',
        alt: 'ignorado',
        decorative: true,
      });
      await expect
        .poll(() => rteHtml(page, ID))
        .toBe(`<p>Início</p>${figure('center', '/e2e.png', '')}<p>Fim</p>`);
      const dialog = await openDetails(page);
      await expect(dialogField(dialog, 'Decorative image')).toBeChecked();
      await expect(dialogField(dialog, 'Alternative text')).toBeDisabled();
    });

    test('legenda, crédito, alinhamento e largura pelo Image details…', async ({
      page,
    }) => {
      await insertViaToolbar(page, { src: '/e2e.png', alt: 'Logo' });
      await expect.poll(() => rteHtml(page, ID)).toContain('<img');
      const dialog = await openDetails(page);
      await dialogField(dialog, 'Caption').fill('Uma legenda');
      await dialogField(dialog, 'Credit').fill('Foto: Fulana');
      await dialogField(dialog, 'Alignment').selectOption({
        label: 'Align right',
      });
      await dialogField(dialog, 'Width (px)').fill('200');
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect.poll(() => rteHtml(page, ID)).toContain('Uma legenda');
      const html = await rteHtml(page, ID);
      expect(html).toContain('rt-figure--right');
      expect(html).toContain('Foto: Fulana');
      expect(html).toContain('width="200"');
      const box = await editableOf(page, ID)
        .locator(IMG)
        .evaluate((i: HTMLImageElement) => {
          const r = i.getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            nw: i.naturalWidth,
            nh: i.naturalHeight,
          };
        });
      expect(Math.abs(box.w - 200)).toBeLessThanOrEqual(1);
      // altura/largura igual à natural (± 1 px de altura)
      expect(Math.abs(box.h - (box.w * box.nh) / box.nw)).toBeLessThanOrEqual(
        1,
      );
    });

    test('remover pelo diálogo, e Mod+Z traz a imagem de volta', async ({
      page,
    }) => {
      await insertViaToolbar(page, { src: '/e2e.png', alt: 'Logo' });
      await expect(editableOf(page, ID).locator(IMG)).toHaveCount(1);
      await page.waitForTimeout(UNDO_GROUP_MS);
      const dialog = await openDetails(page);
      await dialog.locator('.rte-dialog__remove').click();
      await expect(dialog).toBeHidden();
      await expect(editableOf(page, ID).locator(IMG)).toHaveCount(0);
      await expect(editableOf(page, ID)).toBeFocused();
      await page.keyboard.press('ControlOrMeta+z');
      await expect(editableOf(page, ID).locator(IMG)).toHaveCount(1);
    });

    test('teclado: Alt+F10, setas e Enter abrem o Image details…', async ({
      page,
    }) => {
      await insertViaToolbar(page, { src: '/e2e.png', alt: 'Logo' });
      await expectFloating(page, ID, 'image');
      await expect(editableOf(page, ID)).toBeFocused();
      await page.keyboard.press('Alt+F10');
      await arrowToMenuItem(page, 'Image details…');
      expect(await focusedLabel(page)).toBe('Image details…');
      await page.keyboard.press('Enter');
      const dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      await expect(dialogField(dialog, 'Image address (URL)')).toBeFocused();
      await dialogField(dialog, 'Alternative text').fill('Texto novo');
      await page.keyboard.press('Enter');
      await expect(dialog).toBeHidden();
      await expect.poll(() => rteHtml(page, ID)).toContain('alt="Texto novo"');
      await expect(editableOf(page, ID)).toBeFocused();
    });

    test('endereços recusados anunciam o erro e não alteram o documento', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Início', 6);
      const dialog = await openDialogFrom(page, ID, 'toolbar', 'image');
      const src = dialogField(dialog, 'Image address (URL)');
      for (const bad of [
        'http://media.example.test/a.png',
        'data:image/png;base64,AAAA',
        '//media.example.test/a.png',
        'site.com/a.png',
        'https://other.example.test/a.png',
      ]) {
        await src.fill(bad);
        await dialog.locator('.rte-dialog__apply').click();
        await expect(dialog).toBeVisible();
        await expect(src).toHaveAttribute('aria-invalid', 'true');
        const error = dialog.locator('.rte-dialog__error').first();
        await expect(error).toHaveText(MEDIA_URL_ERROR);
        const errorId = await error.getAttribute('id');
        expect(errorId).toBeTruthy();
        expect(await src.getAttribute('aria-describedby')).toContain(errorId);
        expect(await rteHtml(page, ID)).toBe(BASE);
      }
    });

    test('alt vazio sem marcar decorativa: erro anunciado e nada muda', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Início', 6);
      const dialog = await openDialogFrom(page, ID, 'toolbar', 'image');
      await dialogField(dialog, 'Image address (URL)').fill('/e2e.png');
      await dialog.locator('.rte-dialog__apply').click();
      await expect(dialog).toBeVisible();
      const alt = dialogField(dialog, 'Alternative text');
      await expect(alt).toHaveAttribute('aria-invalid', 'true');
      await expect(alt).toBeFocused();
      const ids = ((await alt.getAttribute('aria-describedby')) ?? '').split(
        ' ',
      );
      const errorId = ids.find((i) => i.endsWith('-error'));
      expect(errorId).toBeTruthy();
      await expect(dialog.locator(`[id="${errorId}"]`)).toHaveText(
        'Fill in this field.',
      );
      expect(await rteHtml(page, ID)).toBe(BASE);
    });

    test('Details… muda a largura e um Mod+Z restaura o estado anterior', async ({
      page,
    }) => {
      await insertViaToolbar(page, { src: '/e2e.png', alt: 'Logo' });
      await expect(editableOf(page, ID).locator(IMG)).toHaveCount(1);
      const before = await rteHtml(page, ID);
      await page.waitForTimeout(UNDO_GROUP_MS);
      const dialog = await openDetails(page);
      await dialogField(dialog, 'Width (px)').fill('120');
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect.poll(() => rteHtml(page, ID)).toContain('width="120"');
      await expect(editableOf(page, ID)).toBeFocused();
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(() => rteHtml(page, ID)).toBe(before);
    });

    test('digitar logo depois de inserir substitui a imagem; Mod+Z a traz de volta', async ({
      page,
    }) => {
      await insertViaToolbar(page, { src: '/e2e.png', alt: 'Logo' });
      await expect(editableOf(page, ID)).toBeFocused();
      await expectFloating(page, ID, 'image');
      await page.waitForTimeout(UNDO_GROUP_MS);
      await page.keyboard.type('x');
      await expect(editableOf(page, ID).locator(IMG)).toHaveCount(0);
      await expect.poll(() => rteHtml(page, ID)).toContain('x');
      await page.keyboard.press('ControlOrMeta+z');
      await expect(editableOf(page, ID).locator(IMG)).toHaveCount(1);
    });
  });
}
