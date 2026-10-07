import { expect, test, type Page } from '@playwright/test';
import type { RteE2eId } from './window';
import { caretAfter, editableOf, gotoApp, waitForEditor } from './helpers/app';
import {
  dropFiles,
  pasteFiles,
  pngFile,
  uniqueName,
  uploadChunk,
  uploadLog,
} from './helpers/upload';

// N35 (spec 05c2a, E12, E13, R8; Tarefa 9): colar e soltar arquivos no
// editor, nos builds zoneless e zone.js. Os gestos são despachados com um
// `DataTransfer` real (o Playwright não arrasta arquivos do sistema): o
// `defaultPrevented` do `drop` é a prova de que o navegador não abriria o
// arquivo. O tratador fica no *chunk* principal (Ruling 29): vale antes de o
// *chunk* `rte-upload` chegar e depois de a carga falhar.

const IMG =
  '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" alt="A" width="200" height="100" loading="lazy" decoding="async"></figure>';

/** `rteHtml` do editor `id` (o documento vivo). */
function html(page: Page, id: RteE2eId): Promise<string | null> {
  return page.evaluate((id) => {
    const host = document.querySelector(`rte-editor[data-testid="${id}"]`);
    return host ? window.rteE2e.rteHtml(host) : null;
  }, id);
}

/** Endereços `/__uploads/<id>` do documento, em ordem. */
async function uploadedSrcs(page: Page, id: RteE2eId): Promise<string[]> {
  return [
    ...((await html(page, id)) ?? '').matchAll(/src="(\/__uploads\/\d+)"/g),
  ].map((m) => m[1] as string);
}

/** Espera o modelo do editor `id` refletir a carga pela ponte. */
async function load(page: Page, id: RteE2eId, value: string): Promise<void> {
  await page.evaluate(({ id, value }) => window.rteE2e.setValue(id, value), {
    id,
    value,
  });
  await expect.poll(() => html(page, id)).toBe(value);
}

/** Centro do `n`-ésimo parágrafo do editável `id` (coordenadas da janela). */
async function paragraphCenter(
  page: Page,
  id: RteE2eId,
  n: number,
): Promise<{ x: number; y: number }> {
  const box = await editableOf(page, id).locator('p').nth(n).boundingBox();
  if (!box) throw new Error('parágrafo sem caixa');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

for (const zone of [false, true]) {
  test.describe(`colar e soltar (${zone ? 'zone' : 'zoneless'})`, () => {
    test('print colado (só arquivo) → imagem com alt null', async ({
      page,
    }) => {
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      await caretAfter(page, 'upload', 'Upload here');
      const name = uniqueName('print', 'png');
      const r = await pasteFiles(page, 'upload', [pngFile(name)]);
      expect(r.prevented['paste']).toBe(true);
      await expect.poll(() => uploadedSrcs(page, 'upload')).toHaveLength(1);
      expect(await html(page, 'upload')).toMatch(
        /^<p>Upload here<\/p><figure[^>]*><img src="\/__uploads\/\d+"/,
      );
      await expect
        .poll(() =>
          page.evaluate(() => window.rteE2e.imagesMissingAlt('upload')),
        )
        .toBe(1);
      expect(
        await page.evaluate(() => window.rteE2e.uploadErrors('upload')),
      ).toEqual([]);
    });

    test('texto + imagem → o texto vence', async ({ page, request }) => {
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      await caretAfter(page, 'upload', 'Upload here');
      const name = uniqueName('text', 'png');
      await pasteFiles(page, 'upload', [pngFile(name)], {
        text: 'pasted',
        html: '<p>pasted</p>',
      });
      await expect
        .poll(() => html(page, 'upload'))
        .toBe('<p>Upload herepasted</p>');
      expect(
        await page.evaluate(() => window.rteE2e.pendingUploads('upload')),
      ).toBe(0);
      expect((await uploadLog(request)).filter((e) => e.name === name)).toEqual(
        [],
      );
    });

    test('três arquivos colados chegam na ordem do gesto', async ({
      page,
      request,
    }) => {
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      await caretAfter(page, 'upload', 'Upload here');
      const names = [
        uniqueName('a', 'png', 900),
        uniqueName('b', 'png', 100),
        uniqueName('c', 'png', 500),
      ];
      await pasteFiles(page, 'upload', names.map(pngFile));
      await expect
        .poll(() => uploadedSrcs(page, 'upload'), { timeout: 15_000 })
        .toHaveLength(3);
      const log = await uploadLog(request);
      const byId = new Map(log.map((e) => [`/__uploads/${e.id}`, e.name]));
      const order = (await uploadedSrcs(page, 'upload')).map((s) =>
        byId.get(s),
      );
      expect(order).toEqual(names);
    });

    test('soltar num ponto do segundo parágrafo → imagem depois dele', async ({
      page,
    }) => {
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      await load(page, 'upload', '<p>first</p><p>second</p><p>third</p>');
      const at = await paragraphCenter(page, 'upload', 1);
      const r = await dropFiles(
        page,
        'upload',
        [pngFile(uniqueName('drop', 'png'))],
        at,
      );
      expect(r.prevented['drop']).toBe(true);
      expect(r.prevented['dragover']).toBe(true);
      await expect.poll(() => uploadedSrcs(page, 'upload')).toHaveLength(1);
      expect(await html(page, 'upload')).toMatch(
        /^<p>first<\/p><p>second<\/p><figure[^>]*><img src="\/__uploads\/\d+"[^>]*><\/figure><p>third<\/p>$/,
      );
    });

    test('soltar no upload-none: sem navegação, sem imagem, sem requisição', async ({
      page,
      request,
    }) => {
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload-none');
      const url = page.url();
      const name = uniqueName('none', 'png');
      const r = await dropFiles(page, 'upload-none', [pngFile(name)]);
      expect(r.prevented['drop']).toBe(true);
      await page.waitForTimeout(300);
      expect(page.url()).toBe(url);
      expect(await html(page, 'upload-none')).toBe('<p>No upload</p>');
      expect((await uploadLog(request)).filter((e) => e.name === name)).toEqual(
        [],
      );
      expect(
        await page.evaluate(() => window.rteE2e.uploadErrors('upload-none')),
      ).toEqual([]);
    });

    test('arrastar uma imagem existente continua movendo o nó', async ({
      page,
    }) => {
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      await load(page, 'upload', `<p>one</p>${IMG}<p>two</p><p>three</p>`);
      const img = editableOf(page, 'upload').locator('img');
      // sem clicar antes: a imagem selecionada mostra as alças do redimensionamento
      await img.dragTo(editableOf(page, 'upload').locator('p').nth(2));
      await expect
        .poll(async () => {
          const h = (await html(page, 'upload')) ?? '';
          return h.indexOf('<img') > h.indexOf('<p>two</p>');
        })
        .toBe(true);
      const h = (await html(page, 'upload')) ?? '';
      expect(h.match(/<img/g)).toHaveLength(1);
      expect(
        await page.evaluate(() => window.rteE2e.pendingUploads('upload')),
      ).toBe(0);
    });

    test('soltar antes de o chunk chegar: sem navegação; depois envia', async ({
      page,
    }) => {
      const chunk = await uploadChunk(page);
      const release = chunk.hold();
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      await chunk.requested;
      const url = page.url();
      const r = await dropFiles(page, 'upload', [
        pngFile(uniqueName('early', 'png')),
      ]);
      expect(r.prevented['drop']).toBe(true);
      await page.waitForTimeout(300);
      expect(page.url()).toBe(url);
      expect(await uploadedSrcs(page, 'upload')).toEqual([]);
      // Ruling 33: o aceito em espera do *chunk* já conta como pendente (um
      // `rteUploadsFinished` não deixa o formulário passar antes).
      expect(
        await page.evaluate(() => window.rteE2e.pendingUploads('upload')),
      ).toBe(1);
      release();
      await expect
        .poll(() => uploadedSrcs(page, 'upload'), { timeout: 15_000 })
        .toHaveLength(1);
      expect(
        await page.evaluate(() => window.rteE2e.uploadErrors('upload')),
      ).toEqual([]);
    });

    test("falha da carga do chunk: sem navegação, 'unavailable'", async ({
      page,
      request,
    }) => {
      const chunk = await uploadChunk(page);
      chunk.abort();
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, 'upload');
      await chunk.requested;
      const url = page.url();
      const name = uniqueName('fail', 'png');
      const r = await dropFiles(page, 'upload', [pngFile(name)]);
      expect(r.prevented['drop']).toBe(true);
      await expect
        .poll(() => page.evaluate(() => window.rteE2e.uploadErrors('upload')))
        .toEqual([{ fileName: name, type: 'image', reason: 'unavailable' }]);
      expect(page.url()).toBe(url);
      expect(await uploadedSrcs(page, 'upload')).toEqual([]);
      expect((await uploadLog(request)).filter((e) => e.name === name)).toEqual(
        [],
      );
    });
  });
}
