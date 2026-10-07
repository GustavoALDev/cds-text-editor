import { expect, test, type Locator, type Page } from '@playwright/test';
import type { RteE2eId } from './window';
import { caretAfter, editableOf, gotoApp, waitForEditor } from './helpers/app';
import {
  cancelDialog,
  dialogField,
  openDialogFrom,
  submitDialog,
} from './helpers/dialogs';
import {
  bigPngFile,
  pngFile,
  svgFile,
  uniqueName,
  uploadLog,
  webmFile,
  type PageFile,
} from './helpers/upload';

// N34 (spec 05c2a, E14, R9, R7; Tarefa 10): envio pelo diálogo de imagem e de
// vídeo, nos builds zoneless e zone.js. "Origem" com "Arquivo" (padrão) ou
// "Endereço"; o arquivo vai por `setInputFiles`; os erros de tipo e tamanho
// ficam no campo, ligados por `aria-describedby`; "Aplicar" fecha, cria o
// marcador e a mídia chega com os textos do diálogo.

const ID: RteE2eId = 'upload';

function html(page: Page): Promise<string | null> {
  return page.evaluate((id) => {
    const host = document.querySelector(`rte-editor[data-testid="${id}"]`);
    return host ? window.rteE2e.rteHtml(host) : null;
  }, ID);
}

/** Arquivo do ajudante no formato do `setInputFiles`. */
function payload(f: PageFile): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  return {
    name: f.name,
    mimeType: f.type,
    buffer: Buffer.from(f.base64, 'base64'),
  };
}

async function open(page: Page, kind: 'image' | 'video'): Promise<Locator> {
  const dialog = await openDialogFrom(page, ID, 'toolbar', kind);
  const source = dialog.locator(
    'fieldset.rte-dialog__fieldset.rte-dialog__source',
  );
  await expect(source).toBeVisible();
  await expect(source.locator('legend')).toHaveText('Source');
  await expect(dialogField(dialog, 'File')).toBeChecked();
  await expect(dialogField(dialog, 'File')).toBeFocused();
  return dialog;
}

for (const zone of [false, true]) {
  test.describe(`envio pelo diálogo (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, ID);
    });

    test('imagem: arquivo, alt, legenda e crédito → marcador → figura', async ({
      page,
      request,
    }) => {
      await caretAfter(page, ID, 'Upload here');
      const dialog = await open(page, 'image');
      const input = dialogField(dialog, 'Image file');
      await expect(input).toHaveAttribute(
        'accept',
        'image/png,image/jpeg,image/gif,image/webp,image/avif,.png,.jpg,.jpeg,.gif,.webp,.avif',
      );
      await expect(input).toHaveAccessibleDescription(
        'Accepted: PNG, JPEG, GIF, WebP, AVIF. Up to 1 MB.',
      );
      await expect(dialogField(dialog, 'Image address (URL)')).toBeHidden();
      const name = uniqueName('gato', 'png', 600);
      await input.setInputFiles(payload(pngFile(name)));
      await dialogField(dialog, 'Alternative text').fill('Gato');
      await dialogField(dialog, 'Caption').fill('Um gato');
      await dialogField(dialog, 'Credit').fill('Foto: Ana');
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect(editableOf(page, ID)).toBeFocused();
      await expect(
        editableOf(page, ID).locator('.rte-upload-marker'),
      ).toHaveCount(1);
      await expect
        .poll(() => html(page), { timeout: 15_000 })
        .toMatch(
          /^<p>Upload here<\/p><figure class="rt-figure rt-figure--center"><img src="\/__uploads\/\d+" alt="Gato"[^>]*><figcaption>Um gato <small class="rt-credit">Foto: Ana<\/small><\/figcaption><\/figure>$/,
        );
      await expect(
        editableOf(page, ID).locator('.rte-upload-marker'),
      ).toHaveCount(0);
      const entry = (await uploadLog(request)).find((e) => e.name === name);
      expect(entry?.kind).toBe('image');
      expect(
        await page.evaluate((id) => window.rteE2e.uploadErrors(id), ID),
      ).toEqual([]);
    });

    test('svg e arquivo de 1,1 MB: erro no campo, anunciado pela descrição', async ({
      page,
      request,
    }) => {
      await caretAfter(page, ID, 'Upload here');
      const dialog = await open(page, 'image');
      const input = dialogField(dialog, 'Image file');
      await dialogField(dialog, 'Alternative text').fill('Gato');
      await submitDialog(dialog);
      await expect(input).toBeFocused();
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toHaveAccessibleDescription(
        /Up to 1 MB\. Choose a file\.$/,
      );
      const svg = uniqueName('vetor', 'svg');
      await input.setInputFiles(payload(svgFile(svg)));
      await expect(input).toHaveAccessibleDescription(
        /This file type is not accepted\.$/,
      );
      await submitDialog(dialog);
      await expect(dialog).toBeVisible();
      const big = uniqueName('grande', 'png');
      await input.setInputFiles(payload(bigPngFile(big)));
      await expect(input).toHaveAccessibleDescription(
        /The file is larger than 1 MB\.$/,
      );
      await submitDialog(dialog);
      await expect(dialog).toBeVisible();
      expect(await html(page)).toBe('<p>Upload here</p>');
      expect(
        await page.evaluate((id) => window.rteE2e.uploadErrors(id), ID),
      ).toEqual([]);
      const log = await uploadLog(request);
      expect(log.filter((e) => e.name === svg || e.name === big)).toEqual([]);
    });

    test('"Endereço" valida como antes; voltar a "Arquivo" mantém o arquivo', async ({
      page,
    }) => {
      await caretAfter(page, ID, 'Upload here');
      const dialog = await open(page, 'image');
      const input = dialogField(dialog, 'Image file');
      await input.setInputFiles(payload(pngFile(uniqueName('volta', 'png'))));
      await dialogField(dialog, 'Address (URL)').check();
      await expect(input).toBeHidden();
      const src = dialogField(dialog, 'Image address (URL)');
      await src.fill('http://example.com/a.png');
      await dialogField(dialog, 'Alternative text').fill('Gato');
      await submitDialog(dialog);
      await expect(src).toBeFocused();
      await expect(src).toHaveAccessibleDescription(/Address not accepted/);
      await dialogField(dialog, 'File').check();
      await expect(input).toBeVisible();
      expect(
        await input.evaluate((el: HTMLInputElement) => el.files?.length),
      ).toBe(1);
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect
        .poll(() => html(page), { timeout: 15_000 })
        .toMatch(/<img src="\/__uploads\/\d+" alt="Gato"/);
    });

    test('vídeo WebM com faixa; pôster do diálogo', async ({
      page,
      request,
    }) => {
      await caretAfter(page, ID, 'Upload here');
      const dialog = await open(page, 'video');
      const input = dialogField(dialog, 'Video file');
      await expect(input).toHaveAttribute(
        'accept',
        'video/mp4,video/webm,.mp4,.webm',
      );
      const name = uniqueName('filme', 'webm');
      await input.setInputFiles(payload(webmFile(name)));
      await dialogField(dialog, 'Cover image address (optional)').fill(
        '/e2e.png',
      );
      await dialogField(dialog, 'Caption').fill('Um vídeo');
      await dialog.getByRole('button', { name: 'Add track' }).click();
      const track = dialog.locator('.rte-dialog__tracks fieldset').first();
      await dialogField(track, 'Track address (.vtt)').fill('/e2e.vtt');
      await dialogField(track, 'Language code (BCP 47)').fill('en');
      await dialogField(track, 'Label').fill('English');
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect
        .poll(() => html(page), { timeout: 15_000 })
        .toMatch(
          /^<p>Upload here<\/p><figure class="rt-figure rt-figure--video"><video src="\/__uploads\/\d+"[^>]* poster="\/e2e\.png"><track kind="captions" src="\/e2e\.vtt" srclang="en" label="English"><\/video><figcaption>Um vídeo<\/figcaption><\/figure>$/,
        );
      const entry = (await uploadLog(request)).find((e) => e.name === name);
      expect(entry?.kind).toBe('video');
    });

    test('ControlOrMeta+Z depois da chegada desfaz só a mídia', async ({
      page,
    }) => {
      await caretAfter(page, ID, 'Upload here');
      await page.keyboard.type(' X');
      const dialog = await open(page, 'image');
      await dialogField(dialog, 'Image file').setInputFiles(
        payload(pngFile(uniqueName('desfaz', 'png'))),
      );
      await dialogField(dialog, 'Alternative text').fill('Gato');
      await submitDialog(dialog);
      await expect
        .poll(() => html(page), { timeout: 15_000 })
        .toMatch(/^<p>Upload here X<\/p><figure/);
      await expect(editableOf(page, ID)).toBeFocused();
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(() => html(page)).toBe('<p>Upload here X</p>');
    });

    test('envio lento com o diálogo de link aberto na chegada: o diálogo segue e a imagem entra depois de cancelá-lo', async ({
      page,
    }) => {
      await caretAfter(page, ID, 'Upload here');
      const image = await open(page, 'image');
      await dialogField(image, 'Image file').setInputFiles(
        payload(pngFile(uniqueName('lento', 'png', 1500))),
      );
      await dialogField(image, 'Alternative text').fill('Gato');
      await submitDialog(image);
      await expect(image).toBeHidden();
      const link = await openDialogFrom(page, ID, 'toolbar', 'link');
      await expect
        .poll(
          () =>
            page.evaluate(
              (id) => window.rteE2e.uploads(id).map((u) => u.state),
              ID,
            ),
          { timeout: 15_000 },
        )
        .toEqual(['inserting']);
      await page.waitForTimeout(300);
      await expect(link).toBeVisible();
      expect(await html(page)).toBe('<p>Upload here</p>');
      await cancelDialog(link);
      await expect(link).toBeHidden();
      await expect
        .poll(() => html(page))
        .toMatch(
          /^<p>Upload here<\/p><figure[^>]*><img src="\/__uploads\/\d+" alt="Gato"/,
        );
    });
  });
}
