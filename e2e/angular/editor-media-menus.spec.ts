import { expect, test, type Page } from '@playwright/test';
import {
  editableOf,
  editorHost,
  formState,
  gotoApp,
  waitForEditor,
} from './helpers/app';
import { contrastRatio, toRgb } from './helpers/contrast';
import { cancelDialog, openDialogFrom } from './helpers/dialogs';
import { expectFloating, floatingItem, floatingMenu } from './helpers/floating';
import { mediaDialog, routeMedia, selectMediaByClick } from './helpers/media';
import { rteHtml, selectIn, toolbarButton } from './helpers/toolbar';

// Spec 05c1 em navegador real: o *smoke* do CSS dos diálogos e dos menus de
// mídia (Tarefa 10) e o N29 (Tarefa 12, R2/R8): itens da barra, `--active`,
// seleção por clique, menus de vídeo e *embed*, origem ao cancelar e a
// segunda instância (`media-alt`). Rota `media` com CSP própria: abrir
// `/media` direto.

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
      // como duplo clique (e não seleciona o nó): um clique num parágrafo
      // entre os dois os separa.
      await clickParagraph(page);
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

const ALT = 'media-alt';
const TOOLBAR_MEDIA = [
  'Insert image',
  'Insert video',
  'Insert embedded content',
];
const ACTIVE = /rte-toolbar__button--active/;

/** Clique real no primeiro parágrafo (separa dois cliques de mídia seguidos). */
async function clickParagraph(page: Page): Promise<void> {
  await editableOf(page, ID).locator('p').first().click();
}

for (const zone of [false, true]) {
  test.describe(`N29${zone ? ' (zone.js)' : ''}`, () => {
    test.beforeEach(async ({ page }) => {
      await routeMedia(page.context());
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, ID);
      await expect(editableOf(page, ID).locator('video')).toHaveCount(1);
    });

    /** Rótulos dos botões da barra, na ordem do DOM. */
    const barLabels = (page: Page) =>
      editorHost(page, ID)
        .locator('.rte-toolbar > .rte-toolbar__button')
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute('aria-label') ?? ''),
        );

    test('itens image, video e embed na ordem do preset full, antes da tabela', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Mídia', 5);
      const labels = await barLabels(page);
      const first = labels.indexOf('Insert image');
      expect(first).toBeGreaterThan(0);
      expect(labels.slice(first, first + 3)).toEqual(TOOLBAR_MEDIA);
      expect(labels[first + 3]).toContain('Table');
      for (const label of TOOLBAR_MEDIA) {
        const button = toolbarButton(page, ID, label);
        await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
        await expect(button).not.toHaveAttribute('aria-pressed', /.*/);
        await expect(button).not.toHaveClass(ACTIVE);
      }
    });

    test('Edit … e --active só com a mídia do tipo selecionada', async ({
      page,
    }) => {
      const cases = [
        { kind: 'image', edit: 'Edit image', insert: 'Insert image' },
        { kind: 'video', edit: 'Edit video', insert: 'Insert video' },
        {
          kind: 'embed',
          edit: 'Edit embedded content',
          insert: 'Insert embedded content',
        },
      ] as const;
      for (const selected of cases) {
        await clickParagraph(page);
        await selectMediaByClick(page, ID, selected.kind);
        await expectFloating(page, ID, selected.kind);
        for (const c of cases) {
          if (c.kind === selected.kind) {
            await expect(toolbarButton(page, ID, c.edit)).toHaveClass(ACTIVE);
            await expect(toolbarButton(page, ID, c.insert)).toHaveCount(0);
          } else {
            await expect(toolbarButton(page, ID, c.insert)).not.toHaveClass(
              ACTIVE,
            );
            await expect(toolbarButton(page, ID, c.edit)).toHaveCount(0);
          }
        }
      }
      // sem mídia selecionada tudo volta a "Insert …"
      await clickParagraph(page);
      for (const label of TOOLBAR_MEDIA) {
        await expect(toolbarButton(page, ID, label)).not.toHaveClass(ACTIVE);
      }
    });

    test('editável: o clique seleciona o nó; readonly: o ponteiro chega ao elemento', async ({
      page,
    }) => {
      const targets = {
        video: { figure: '.rt-figure--video', tag: 'VIDEO' },
        embed: { figure: '.rt-embed', tag: 'IFRAME' },
      } as const;
      /** Elemento sob o centro do `figure` (depois de levá-lo à viewport). */
      const hit = (figure: string) =>
        editableOf(page, ID)
          .locator(figure)
          .evaluate((el) => {
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            return document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2,
            )?.tagName;
          });
      for (const kind of ['video', 'embed'] as const) {
        await clickParagraph(page);
        await selectMediaByClick(page, ID, kind);
        await expect(
          editableOf(page, ID).locator(targets[kind].figure),
        ).toHaveClass(/ProseMirror-selectednode/);
        // editável: o ponteiro cai na figure, não no elemento
        expect(await hit(targets[kind].figure)).not.toBe(targets[kind].tag);
      }
      await page.evaluate(() => window.rteE2e.toggle('readonly'));
      await expect
        .poll(() => hit(targets.video.figure))
        .toBe(targets.video.tag);
      expect(await hit(targets.embed.figure)).toBe(targets.embed.tag);
    });

    for (const { kind, details, remove, tag } of [
      {
        kind: 'video',
        details: 'Video details…',
        remove: 'Remove video',
        tag: 'video',
      },
      {
        kind: 'embed',
        details: 'Embedded content details…',
        remove: 'Remove embedded content',
        tag: 'iframe',
      },
    ] as const) {
      test(`menu de ${kind}: Detalhes e Remover; cancelar devolve o foco ao editável e o menu`, async ({
        page,
      }) => {
        await selectMediaByClick(page, ID, kind);
        const menu = floatingMenu(page, ID, kind);
        await expectFloating(page, ID, kind);
        await expect(floatingItem(menu, details)).toBeVisible();
        await expect(floatingItem(menu, remove)).toBeVisible();
        await expect(menu.locator('button, a')).toHaveCount(2);

        await floatingItem(menu, details).click();
        const dialog = mediaDialog(page, ID);
        await expect(dialog).toBeVisible();
        await cancelDialog(dialog);
        await expect(dialog).toBeHidden();
        await expect(editableOf(page, ID)).toBeFocused();
        await expectFloating(page, ID, kind);
        expect(await page.evaluate(() => window.__violations)).toEqual([]);

        // Remover tira só esse nó
        await floatingItem(menu, remove).click();
        await expect(editableOf(page, ID).locator(tag)).toHaveCount(0);
        expect(await rteHtml(page, ID)).not.toContain(`<${tag}`);
        await expect(editableOf(page, ID)).toBeFocused();
      });
    }

    test('touched do [formField] continua false ao abrir e cancelar', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Mídia', 5);
      const dialog = await openDialogFrom(page, ID, 'toolbar', 'image');
      await cancelDialog(dialog);
      await expect(dialog).toBeHidden();
      // origem = o botão da barra (G4)
      await expect(toolbarButton(page, ID, 'Insert image')).toBeFocused();
      expect((await formState(page, ID)).touched).toBe(false);
      await selectIn(page, ID, 'Mídia', 5);
      const opened = await page.evaluate(() =>
        window.rteE2e.openDialog('media', 'video'),
      );
      expect(opened).toBe(true);
      await cancelDialog(mediaDialog(page, ID));
      await expect(editableOf(page, ID)).toBeFocused();
      expect((await formState(page, ID)).touched).toBe(false);
    });
  });

  test.describe(`N29 media-alt${zone ? ' (zone.js)' : ''}`, () => {
    test.beforeEach(async ({ page }) => {
      await routeMedia(page.context());
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, ALT);
    });

    test('sem provedor: sem barra nem menu de embed; openDialog(embed) → false', async ({
      page,
    }) => {
      await expect(editorHost(page, ALT).locator('.rte-toolbar')).toHaveCount(
        0,
      );
      const embed = page.getByTestId('media-open-embed');
      await embed.click();
      await expect(embed).toHaveAttribute('data-result', 'false');
      await expect(mediaDialog(page, ALT)).toHaveCount(0);
      await expect(editableOf(page, ALT).locator('.rt-embed')).toHaveCount(0);
      await selectIn(page, ALT, 'Mídia', 5);
      await expectFloating(page, ALT, null);
    });

    test('openDialog(image) abre e cancelar devolve o foco ao editável (a origem de um pedido da API fora do host)', async ({
      page,
    }) => {
      await selectIn(page, ALT, 'Mídia', 5);
      const button = page.getByTestId('media-open-image');
      // pelo teclado: o clique não foca o botão no Firefox e no WebKit do macOS
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('data-result', 'true');
      const dialog = mediaDialog(page, ALT);
      await expect(dialog).toBeVisible();
      await cancelDialog(dialog);
      await expect(dialog).toBeHidden();
      // G4: o botão da página está fora do host, então a origem é o editável
      await expect(editableOf(page, ALT)).toBeFocused();
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });
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
