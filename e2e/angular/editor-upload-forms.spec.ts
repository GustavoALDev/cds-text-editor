import { expect, test, type Page } from '@playwright/test';
import type { RteE2eId } from './window';
import {
  caretAfter,
  formState,
  gotoApp,
  modelValue,
  settlePage,
  waitForEditor,
} from './helpers/app';
import { dialogField, openDialogOf, submitDialog } from './helpers/dialogs';
import { expectFloating, floatingItem, floatingMenu } from './helpers/floating';
import {
  pasteFiles,
  pngFile,
  uniqueName,
  uploadInPage,
  webmFile,
} from './helpers/upload';

// N37 (spec 05c2a, E19, R13; Tarefa 11): `rteUploadsFinished` e
// `rteImagesHaveAlt` nos três modos de formulário da página `upload` —
// Signal Forms (`upload`, funções no schema), Reactive Forms
// (`upload-reactive`) e `ngModel` (`upload-template`), os dois com as
// diretivas —, nos builds zoneless e zone.js. Inválidos durante o envio e
// válidos depois (também depois de falhar, sem mudar o valor); imagem colada
// sem `alt` até o "Image details…"; mensagens da página por `formatRteError`.

const FORMS = ['upload', 'upload-reactive', 'upload-template'] as const;
type FormId = (typeof FORMS)[number];

/** Primeiro texto de cada editor (o valor inicial da página). */
const TEXT: Record<FormId, string> = {
  upload: 'Upload here',
  'upload-reactive': 'Reactive',
  'upload-template': 'Template',
};

/** Atraso da resposta (ms): o envio fica "em curso" por tempo observável. */
const SLOW = 2500;

/** Mensagens que a página mostra para o formulário `id`. */
function messages(page: Page, id: FormId): Promise<string[]> {
  return page
    .getByTestId(`${id === 'upload' ? 'upload' : id}-messages`)
    .locator('li')
    .allTextContents();
}

function pending(page: Page, id: RteE2eId): Promise<number> {
  return page.evaluate((i) => window.rteE2e.pendingUploads(i), id);
}

function missingAlt(page: Page, id: RteE2eId): Promise<number> {
  return page.evaluate((i) => window.rteE2e.imagesMissingAlt(i), id);
}

async function errorsOf(page: Page, id: FormId): Promise<string[]> {
  return (await formState(page, id)).errors;
}

async function expectValid(page: Page, id: FormId): Promise<void> {
  await expect.poll(() => errorsOf(page, id)).toEqual([]);
  expect((await formState(page, id)).valid).toBe(true);
  await expect.poll(() => messages(page, id)).toEqual([]);
}

for (const zone of [false, true]) {
  test.describe(`N37 formulários e validadores (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/upload', { zone });
      for (const id of FORMS) await waitForEditor(page, id);
    });

    test('envio lento: os três inválidos durante e válidos depois', async ({
      page,
    }) => {
      for (const id of FORMS) {
        await expectValid(page, id);
        const name = uniqueName(`slow-${id}`, 'webm', SLOW);
        expect(await uploadInPage(page, id, [webmFile(name)])).toBe(1);
        await expect
          .poll(() => errorsOf(page, id))
          .toEqual(['rteUploadsPending']);
        expect((await formState(page, id)).valid).toBe(false);
        await expect
          .poll(() => messages(page, id))
          .toEqual(['Wait for 1 upload to finish.']);
      }
      for (const id of FORMS) {
        await expect.poll(() => pending(page, id), { timeout: 10_000 }).toBe(0);
        await expectValid(page, id);
        expect(await modelValue(page, id)).toContain('<video src="/__uploads/');
      }
    });

    test('envio que falha (?status=500): inválidos durante, válidos depois, valor igual', async ({
      page,
    }) => {
      const before: Record<string, string> = {};
      for (const id of FORMS) {
        await page.evaluate(
          (i) => window.rteE2e.setUpload(i, 'http', '?status=500'),
          id,
        );
      }
      // A troca de `[upload]` aborta os envios em curso (E17) quando o
      // efeito roda, na detecção de mudanças: o envio vem depois dela.
      await settlePage(page);
      for (const id of FORMS) {
        before[id] = await modelValue(page, id);
        const name = uniqueName(`fail-${id}`, 'png', SLOW);
        expect(await uploadInPage(page, id, [pngFile(name)])).toBe(1);
        await expect
          .poll(() => errorsOf(page, id))
          .toEqual(['rteUploadsPending']);
      }
      for (const id of FORMS) {
        await expect.poll(() => pending(page, id), { timeout: 10_000 }).toBe(0);
        await expectValid(page, id);
        expect(await modelValue(page, id)).toBe(before[id]);
        expect(
          await page.evaluate((i) => window.rteE2e.lastUploadError(i), id),
        ).toMatchObject({ reason: 'server' });
      }
    });

    test('imagem colada: rteImagesMissingAlt nos três; "Image details…" com texto valida', async ({
      page,
    }) => {
      for (const id of FORMS) {
        await caretAfter(page, id, TEXT[id]);
        const r = await pasteFiles(page, id, [
          pngFile(uniqueName(`alt-${id}`, 'png')),
        ]);
        expect(r.prevented['paste']).toBe(true);
        await expect.poll(() => missingAlt(page, id)).toBe(1);
        await expect
          .poll(() => errorsOf(page, id))
          .toEqual(['rteImagesMissingAlt']);
        await expect
          .poll(() => messages(page, id))
          .toEqual(['1 image has no alternative text.']);
        const src = /src="(\/__uploads\/\d+)"/.exec(
          await modelValue(page, id),
        )?.[1];
        expect(src).toBeTruthy();
        // Com foco e o cursor no marcador, a imagem chega selecionada (E9):
        // o menu da imagem já está aberto (o `e2e.png` é 1 x 1, coberto
        // pelas alças, então não há onde clicar na imagem).
        await expectFloating(page, id, 'image');
        await floatingItem(
          floatingMenu(page, id, 'image'),
          'Image details…',
        ).click();
        const dialog = openDialogOf(page, id);
        await expect(dialog).toBeVisible();
        await dialogField(dialog, 'Alternative text').fill('Logo');
        await submitDialog(dialog);
        await expect(dialog).toBeHidden();
        await expect.poll(() => missingAlt(page, id)).toBe(0);
        await expectValid(page, id);
        const value = await modelValue(page, id);
        expect(value).toContain(`src="${src}"`);
        expect(value).toContain('alt="Logo"');
      }
    });

    test('mensagens em pt-BR pelo formatRteError', async ({ page }) => {
      await page.evaluate(() => window.rteE2e.setLang('pt-BR'));
      for (const id of FORMS) {
        const name = uniqueName(`pt-${id}`, 'png', SLOW);
        expect(await uploadInPage(page, id, [pngFile(name)])).toBe(1);
        await expect
          .poll(() => messages(page, id))
          .toEqual(['Aguarde o fim de 1 envio.']);
      }
      for (const id of FORMS) {
        await expect.poll(() => pending(page, id), { timeout: 10_000 }).toBe(0);
        // `uploadFiles` insere com `alt: null` (E9): o outro validador acusa
        await expect
          .poll(() => messages(page, id))
          .toEqual(['1 imagem sem texto alternativo.']);
        expect(await errorsOf(page, id)).toEqual(['rteImagesMissingAlt']);
      }
    });
  });
}
