import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
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
  slowPngFile,
  tray,
  uniqueName,
  uploadChunk,
  uploadInPage,
  uploadLog,
} from './helpers/upload';

test.describe(
  'compat: angular/editor-upload-states',
  { tag: '@compat' },
  () => {
    // N36 (spec 05c2a, E7, E8, E21, E25; Tarefa 8: *smoke* do CSS e da rota
    // `upload` em navegador real; a Tarefa 12 completa estados e cancelamento).
    // O *chunk* `rte-upload` (Ruling 28) chega em ocioso sem gesto: pelo
    // `requestIdleCallback` (Chromium, Firefox) ou pelo `setTimeout` (WebKit, sem
    // `requestIdleCallback`). Um arquivo `…__d800.png` (resposta 800 ms depois):
    // marcador no editável, bandeja depois dele dentro da moldura, `<progress>`
    // legível em claro e escuro; na chegada, `<img>` com o endereço do servidor e
    // `alt: null` (V7), bandeja fora e uma requisição no log do servidor.
    // Estados (Tarefa 12): progresso, fila, cancelamento pelo teclado, erros,
    // `readonly`, carga externa, troca da configuração e miniatura (`upload-preview`).

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
            await uploadInPage(page, 'upload', [
              pngFile(first),
              pngFile(second),
            ]),
          ).toBe(2);
          const buttons = tray(page, 'upload').locator(
            'button.rte-uploads__cancel',
          );
          await expect(buttons).toHaveCount(2);
          await buttons.first().focus();
          await expect(buttons).toHaveCount(1, { timeout: 10_000 });
          await expect(buttons.first()).toBeFocused();
          await expect(tray(page, 'upload')).toHaveCount(0, {
            timeout: 10_000,
          });
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
            const marker = editableOf(page, 'upload').locator(
              '.rte-upload-marker',
            );
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
              contrastRatio(
                await colorOf(page, PROGRESS, 'borderTopColor'),
                bg,
              ),
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
            const log = (await uploadLog(request)).filter(
              (e) => e.name === name,
            );
            expect(log).toHaveLength(1);
            expect(log[0]?.kind).toBe('image');
            expect(log[0]?.aborted).toBe(false);
            await settlePage(page);
            expect(await page.evaluate(() => window.__violations)).toEqual([]);
          });
        }
      });
    }

    const ID = 'upload';

    /** Espera o servidor ver o envio `name`: o gesto já saiu do buffer do *chunk* (Ruling 28). */
    async function sent(
      request: APIRequestContext,
      name: string,
    ): Promise<void> {
      await expect
        .poll(async () =>
          (await uploadLog(request)).some((e) => e.name === name),
        )
        .toBe(true);
    }

    /** O `uploadError` mais recente do editor `upload`, ou `null`. */
    function lastError(page: Page) {
      return page.evaluate(() => window.rteE2e.lastUploadError('upload'));
    }

    /** O aviso `aria-live` do editor `upload`. */
    function status(page: Page) {
      return page.locator(
        `rte-editor[data-testid="${ID}"] .rte-uploads__status`,
      );
    }

    for (const zone of [false, true]) {
      test.describe(`estados (${zone ? 'zone' : 'zoneless'})`, () => {
        test.beforeEach(async ({ page }) => {
          await gotoApp(page, '/upload', { zone });
          await waitForEditor(page, ID);
        });

        test('progresso determinado (valor entre 0 e 1)', async ({ page }) => {
          await page.evaluate(() =>
            window.rteE2e.setUpload('upload', 'http', '?slow=1'),
          );
          const name = uniqueName('slow', 'png');
          expect(await uploadInPage(page, ID, [slowPngFile(name)])).toBe(1);
          const bar = tray(page, ID).locator('progress');
          const seen: number[] = [];
          await expect
            .poll(
              async () => {
                const v = await bar
                  .getAttribute('value', { timeout: 500 })
                  .catch(() => null);
                if (v !== null) seen.push(Number(v));
                // Firefox (e às vezes o Chromium sob carga) despeja o corpo no
                // soquete de uma vez: só o valor determinado vale aqui; o
                // crescimento é provado nos unitários (bandeja e gerenciador).
                return seen.length > 0;
              },
              { timeout: 20_000, intervals: [50] },
            )
            .toBe(true);
          expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
          expect(Math.max(...seen)).toBeLessThanOrEqual(1);
        });

        test('3 arquivos: 2 enviando e 1 na fila, indeterminado', async ({
          page,
        }) => {
          const names = ['a', 'b', 'c'].map((n) => uniqueName(n, 'png', 3000));
          expect(await uploadInPage(page, ID, names.map(pngFile))).toBe(3);
          const items = tray(page, ID).locator('.rte-uploads__item');
          await expect(items).toHaveCount(3);
          await expect(
            editableOf(page, ID).locator('.rte-upload-marker--queued'),
          ).toHaveCount(1);
          const queued = items.nth(2).locator('progress');
          await expect(queued).toHaveAccessibleName(`${names[2]} (waiting)`);
          expect(await queued.getAttribute('value')).toBeNull();
          expect(
            await queued.evaluate((el) => el.matches(':indeterminate')),
          ).toBe(true);
          await expect(items.first().locator('progress')).toHaveAccessibleName(
            `Uploading ${names[0]}`,
          );
        });

        test('cancelar pelo teclado aborta no servidor e leva o foco ao seguinte', async ({
          page,
          request,
        }) => {
          const first = uniqueName('k1', 'png', 6000);
          const second = uniqueName('k2', 'png', 6000);
          expect(
            await uploadInPage(page, ID, [pngFile(first), pngFile(second)]),
          ).toBe(2);
          await expect(tray(page, ID).locator('button')).toHaveCount(2);
          await editableOf(page, ID).focus();
          const target = `Cancel upload of ${first}`;
          let found = false;
          for (let i = 0; i < 12 && !found; i++) {
            await page.keyboard.press('Tab');
            found =
              (await page.evaluate(() =>
                document.activeElement?.getAttribute('aria-label'),
              )) === target;
          }
          expect(found, 'Tab chega ao botão de cancelar').toBe(true);
          await page.keyboard.press('Enter');
          await expect(tray(page, ID).locator('button')).toHaveCount(1);
          await expect(tray(page, ID).locator('button')).toBeFocused();
          await expect
            .poll(
              async () =>
                (await uploadLog(request)).find((e) => e.name === first)
                  ?.aborted,
            )
            .toBe(true);
          expect(await lastError(page)).toBeNull();
        });

        const errors: [string, string | null, string][] = [
          ['500', '?status=500', 'server'],
          ['JSON inválido', '?bad=json', 'response'],
          ['http:', '?bad=http', 'response'],
          ['rede', null, 'network'],
        ];
        for (const [what, query, reason] of errors) {
          test(`erro (${what}) vira uploadError '${reason}' e é anunciado`, async ({
            page,
          }) => {
            if (query === null) {
              await page.route('**/__upload', (r) => r.abort());
            } else {
              await page.evaluate(
                (q) => window.rteE2e.setUpload('upload', 'http', q),
                query,
              );
            }
            const name = uniqueName('e', 'png');
            expect(await uploadInPage(page, ID, [pngFile(name)])).toBe(1);
            await expect
              .poll(() => lastError(page))
              .toMatchObject({ fileName: name, type: 'image', reason });
            await expect(status(page)).toContainText(
              `Could not upload ${name}`,
            );
            await expect(
              editableOf(page, ID).locator('.rte-upload-marker'),
            ).toHaveCount(0);
            expect(
              await page.evaluate(() => window.rteE2e.pendingUploads('upload')),
            ).toBe(0);
          });
        }

        test('readonly ligado antes da chegada → unavailable', async ({
          page,
          request,
        }) => {
          const name = uniqueName('r', 'png', 1200);
          expect(await uploadInPage(page, ID, [pngFile(name)])).toBe(1);
          await sent(request, name);
          await page.evaluate(() => window.rteE2e.toggle('readonly'));
          await expect
            .poll(() => lastError(page))
            .toMatchObject({ fileName: name, reason: 'unavailable' });
          await page.evaluate(() => window.rteE2e.toggle('readonly'));
          expect(
            await page.evaluate(() => window.rteE2e.value('upload')),
          ).not.toContain('/__uploads/');
        });

        test('carga externa e troca da configuração abortam sem uploadError', async ({
          page,
          request,
        }) => {
          const a = uniqueName('x1', 'png', 4000);
          expect(await uploadInPage(page, ID, [pngFile(a)])).toBe(1);
          await sent(request, a);
          await page.evaluate(() =>
            window.rteE2e.setValue('upload', '<p>externo</p>'),
          );
          await expect
            .poll(
              async () =>
                (await uploadLog(request)).find((e) => e.name === a)?.aborted,
            )
            .toBe(true);
          const b = uniqueName('x2', 'png', 4000);
          expect(await uploadInPage(page, ID, [pngFile(b)])).toBe(1);
          await sent(request, b);
          await page.evaluate(() => window.rteE2e.setUpload('upload', 'other'));
          await expect
            .poll(
              async () =>
                (await uploadLog(request)).find((e) => e.name === b)?.aborted,
            )
            .toBe(true);
          await expect(tray(page, ID)).toHaveCount(0);
          expect(
            await page.evaluate(() => window.rteE2e.uploadErrors('upload')),
          ).toEqual([]);
        });
      });
    }

    test('axe sem violações graves com o envio em curso (claro, escuro e forced-colors)', async ({
      page,
      browserName,
    }) => {
      test.setTimeout(120_000);
      for (const scheme of ['light', 'dark', 'forced'] as const) {
        if (scheme === 'forced') {
          await page.emulateMedia({ forcedColors: 'active' });
        } else {
          await page.emulateMedia({
            colorScheme: scheme,
            forcedColors: 'none',
          });
        }
        await gotoApp(page, '/upload');
        await waitForEditor(page, ID);
        if (scheme === 'forced') {
          const active = await page.evaluate(
            () => matchMedia('(forced-colors: active)').matches,
          );
          if (browserName === 'chromium') expect(active).toBe(true);
          if (!active) break;
        }
        const names = ['p', 'q', 'r'].map((n) => uniqueName(n, 'png', 2500));
        expect(await uploadInPage(page, ID, names.map(pngFile))).toBe(3);
        await expect(tray(page, ID).locator('.rte-uploads__item')).toHaveCount(
          3,
        );
        const results = await new AxeBuilder({ page })
          .include(`rte-editor[data-testid="${ID}"]`)
          .analyze();
        const severe = results.violations.filter((v) =>
          ['serious', 'critical'].includes(v.impact ?? ''),
        );
        expect(
          severe.map((v) => v.id),
          scheme,
        ).toEqual([]);
        await page.evaluate(() => window.rteE2e.cancelAllUploads('upload'));
      }
    });

    for (const zone of [false, true]) {
      test(`rota upload-preview: miniatura blob: só no marcador, sem violação de CSP (${zone ? 'zone' : 'zoneless'})`, async ({
        page,
      }) => {
        await gotoApp(page, '/upload-preview', { zone });
        await waitForEditor(page, ID);
        const name = uniqueName('pv', 'png', 1500);
        expect(await uploadInPage(page, ID, [pngFile(name)])).toBe(1);
        const img = editableOf(page, ID).locator(
          'img.rte-upload-marker__preview',
        );
        await expect(img).toHaveCount(1);
        expect(await img.getAttribute('src')).toMatch(/^blob:/);
        expect(await img.getAttribute('alt')).toBe('');
        await expect
          .poll(() =>
            img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        const model = await page.evaluate(() => ({
          value: window.rteE2e.value('upload'),
          html: window.rteE2e.rteHtml(
            document.querySelector(
              'rte-editor[data-testid="upload"]',
            ) as Element,
          ),
        }));
        expect(model.value).not.toContain('blob:');
        expect(model.html).not.toContain('blob:');
        await expect(tray(page, ID)).toHaveCount(0, { timeout: 15_000 });
        await expect(img).toHaveCount(0);
        expect(await page.evaluate(() => window.__violations)).toEqual([]);
      });
    }
  },
);
