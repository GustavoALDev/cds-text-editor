import { expect, test, type Page } from '@playwright/test';
import {
  editableOf,
  editorHost,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import { contrastRatio, effectiveBackground, toRgb } from './helpers/contrast';
import {
  pngFile,
  tray,
  uniqueName,
  uploadChunk,
  uploadInPage,
  uploadLog,
} from './helpers/upload';

// N36 (spec 05c2a, E7, E8, E21, E25; Tarefa 8: *smoke* do CSS e da rota
// `upload` em navegador real; a Tarefa 12 completa estados e cancelamento).
// O *chunk* `rte-upload` (Ruling 28) chega em ocioso sem gesto: pelo
// `requestIdleCallback` (Chromium, Firefox) ou pelo `setTimeout` (WebKit, sem
// `requestIdleCallback`). Um arquivo `…__d800.png` (resposta 800 ms depois):
// marcador no editável, bandeja depois dele dentro da moldura, `<progress>`
// legível em claro e escuro; na chegada, `<img>` com o endereço do servidor e
// `alt: null` (V7), bandeja fora e uma requisição no log do servidor.

const PROGRESS = 'rte-editor[data-testid="upload"] .rte-uploads__progress';
const NAME = 'rte-editor[data-testid="upload"] .rte-uploads__name';

/** Cor computada de `prop` no primeiro elemento de `selector`, em `rgb()`. */
async function colorOf(
  page: Page,
  selector: string,
  prop: 'color' | 'borderTopColor' | 'accentColor',
): Promise<string> {
  const value = await page.evaluate(
    ({ selector, prop }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`sem ${selector}`);
      return getComputedStyle(el)[prop];
    },
    { selector, prop },
  );
  return toRgb(page, value);
}

for (const zone of [false, true]) {
  test.describe(`smoke (${zone ? 'zone' : 'zoneless'})`, () => {
    test('o chunk rte-upload é pedido em ocioso, sem gesto', async ({
      page,
    }) => {
      const chunk = await uploadChunk(page);
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      const idle = await page.evaluate(
        () => typeof window.requestIdleCallback === 'function',
      );
      test.info().annotations.push({
        type: 'carga',
        description: idle ? 'requestIdleCallback' : 'setTimeout (sem rIC)',
      });
      const url = await chunk.requested;
      expect(url).toMatch(/\.js$/);
      await expect(tray(page, 'upload')).toHaveCount(0);
      expect(
        await page.evaluate(() => window.rteE2e.pendingUploads('upload')),
      ).toBe(0);
    });

    test('o envio focado termina: o foco vai ao seguinte e, no fim, ao editável (Ruling 31)', async ({
      page,
    }) => {
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      const first = uniqueName('f1', 'png', 600);
      const second = uniqueName('f2', 'png', 1600);
      expect(
        await uploadInPage(page, 'upload', [pngFile(first), pngFile(second)]),
      ).toBe(2);
      const buttons = tray(page, 'upload').locator(
        'button.rte-uploads__cancel',
      );
      await expect(buttons).toHaveCount(2);
      await buttons.first().focus();
      await expect(buttons).toHaveCount(1, { timeout: 10_000 });
      await expect(buttons.first()).toBeFocused();
      await expect(tray(page, 'upload')).toHaveCount(0, { timeout: 10_000 });
      await expect(editableOf(page, 'upload')).toBeFocused();
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`um envio: marcador, bandeja, progresso legível e chegada (${scheme})`, async ({
        page,
        request,
      }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await gotoApp(page, '/upload', { zone });
        await waitForEditor(page, 'upload');
        const name = uniqueName('a', 'png', 800);
        expect(await uploadInPage(page, 'upload', [pngFile(name)])).toBe(1);

        // marcador no editável
        const marker = editableOf(page, 'upload').locator('.rte-upload-marker');
        await expect(marker).toBeVisible();
        await expect(marker).toHaveAttribute('contenteditable', 'false');
        const box = await marker.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(0);
        expect(box?.height ?? 0).toBeGreaterThan(0);

        // bandeja dentro da moldura, depois do editável
        const section = tray(page, 'upload');
        await expect(section).toBeVisible();
        await expect(section).toHaveAccessibleName('Uploads');
        const after = await editorHost(page, 'upload').evaluate((host) => {
          const frame = host.querySelector('.rte-editor__frame');
          const editable = host.querySelector('.ProseMirror');
          const t = host.querySelector('section.rte-uploads');
          return (
            !!frame &&
            !!editable &&
            !!t &&
            frame.contains(t) &&
            !!(
              editable.compareDocumentPosition(t) &
              Node.DOCUMENT_POSITION_FOLLOWING
            )
          );
        });
        expect(after).toBe(true);

        // <progress> com borda e cor visíveis; contraste ≥ 3 e nome ≥ 4,5
        const progress = section.locator('progress.rte-uploads__progress');
        await expect(progress).toHaveAccessibleName(`Uploading ${name}`);
        const border = await progress.evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            width: parseFloat(s.borderTopWidth),
            style: s.borderTopStyle,
          };
        });
        expect(border.width).toBeGreaterThan(0);
        expect(border.style).not.toBe('none');
        const bg = await effectiveBackground(page, PROGRESS);
        expect(
          contrastRatio(await colorOf(page, PROGRESS, 'borderTopColor'), bg),
          'borda do progresso',
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(await colorOf(page, PROGRESS, 'accentColor'), bg),
          'barra do progresso',
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(
            await colorOf(page, NAME, 'color'),
            await effectiveBackground(page, NAME),
          ),
          'nome',
        ).toBeGreaterThanOrEqual(4.5);

        // chegada
        await expect(section).toHaveCount(0, { timeout: 15_000 });
        await expect(marker).toHaveCount(0);
        const arrived = await page.evaluate(() => {
          const host = document.querySelector(
            'rte-editor[data-testid="upload"]',
          );
          const editor = host && window.rteE2e.getRteEditor(host);
          const attrs: { src: unknown; alt: unknown }[] = [];
          editor?.state.doc.descendants((node) => {
            const src: unknown = node.attrs['src'];
            if (typeof src === 'string' && src.startsWith('/__uploads/'))
              attrs.push({ src, alt: node.attrs['alt'] });
          });
          return {
            html: host ? window.rteE2e.rteHtml(host) : null,
            attrs,
            missing: window.rteE2e.imagesMissingAlt('upload'),
            pending: window.rteE2e.pendingUploads('upload'),
            errors: window.rteE2e.uploadErrors('upload'),
          };
        });
        // forma canônica: `alt: null` serializa `alt=""` (V7)
        expect(arrived.html).toMatch(/<img src="\/__uploads\/\d+" alt=""/);
        expect(arrived.attrs).toHaveLength(1);
        expect(arrived.attrs[0]?.alt).toBeNull();
        expect(arrived.missing).toBe(1);
        expect(arrived.pending).toBe(0);
        expect(arrived.errors).toEqual([]);
        const log = (await uploadLog(request)).filter((e) => e.name === name);
        expect(log).toHaveLength(1);
        expect(log[0]?.kind).toBe('image');
        expect(log[0]?.aborted).toBe(false);
        await settlePage(page);
        expect(await page.evaluate(() => window.__violations)).toEqual([]);
      });
    }
  });
}
