import { expect, test } from '@playwright/test';
import {
  dialogField,
  openDialogFrom,
  submitDialog,
} from '../angular/helpers/dialogs';
import { selectIn } from '../angular/helpers/toolbar';
import {
  pngFile,
  tray,
  uniqueName,
  uploadInPage,
} from '../angular/helpers/upload';
import { openEditor } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4: diálogos de link e de imagem (com erro de validação) e a bandeja de envio. O erro de envio
// só é anunciado pela região viva (fora da tela, E8): não há o que capturar; fica no ARIA (O8).

test.describe('diálogos', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page, '/dialogs', 'dialogs');
  });

  test('diálogo de link', async ({ page }) => {
    await selectIn(page, 'dialogs', 'o site', 0, 0);
    const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
    await expect(dialogField(dialog, 'Address (URL)')).toBeFocused();
    await expectShot(dialog, 'dialog-link');
  });

  test('diálogo de imagem com erro de validação', async ({ page }) => {
    await selectIn(page, 'dialogs', 'Fim', 3);
    const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'image');
    await dialogField(dialog, 'Image address (URL)').fill(
      'http://media.example.test/a.png',
    );
    await submitDialog(dialog);
    await expect(dialog.locator('.rte-dialog__error').first()).toBeVisible();
    await expectShot(dialog, 'dialog-image-validation-error');
  });
});

test('bandeja de envio com progresso e fila', async ({ page }) => {
  await openEditor(page, '/upload', 'upload');
  const names = ['a', 'b', 'c'].map((n) => uniqueName(n, 'png', 20_000));
  expect(await uploadInPage(page, 'upload', names.map(pngFile))).toBe(3);
  const t = tray(page, 'upload');
  await expect(t.locator('.rte-uploads__item')).toHaveCount(3);
  // Os nomes levam sufixo único (dinâmico por natureza): troca-se o texto mostrado.
  await t
    .locator('.rte-uploads__name')
    .evaluateAll((els) =>
      els.forEach((el, i) => (el.textContent = `arquivo-${i + 1}.png`)),
    );
  await expectShot(t, 'upload-tray-progress-and-queue');
});
