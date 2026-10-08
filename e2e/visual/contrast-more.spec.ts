import { expect, test } from '@playwright/test';
import { dialogField, openDialogFrom } from '../angular/helpers/dialogs';
import { selectIn } from '../angular/helpers/toolbar';
import { editableOf, editorHost, openEditor, setDoc } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4 (só Chromium): `prefers-contrast: more` (`contrast: 'more'` emulado) sobe o anel de foco para
// 3 px (`--rte-focus-width` do theme.css).

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ contrast: 'more' });
});

test('anel de foco na barra', async ({ page }) => {
  await openEditor(page, '/toolbar', 'toolbar');
  await setDoc(page, 'toolbar', '<p>Texto.</p>');
  await page.locator('#before-toolbar').focus();
  await page.keyboard.press('Tab');
  await expectShot(
    editorHost(page, 'toolbar').locator('.rte-toolbar'),
    'contrast-more-toolbar-focus',
    {
      ready: () =>
        page.evaluate(
          () => !!document.activeElement?.matches(':focus-visible'),
        ),
    },
  );
});

test('anel de foco no editável', async ({ page }) => {
  await openEditor(page, '/toolbar', 'toolbar');
  await setDoc(page, 'toolbar', '<p>Texto.</p>');
  await editableOf(page, 'toolbar').focus();
  await expectShot(
    editorHost(page, 'toolbar'),
    'contrast-more-editable-focus',
    {
      ready: () =>
        editableOf(page, 'toolbar').evaluate(
          (el) => el === document.activeElement,
        ),
    },
  );
});

test('anel de foco nos botões do diálogo', async ({ page }) => {
  await openEditor(page, '/dialogs', 'dialogs');
  await selectIn(page, 'dialogs', 'o site', 0, 0);
  const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
  await expect(dialogField(dialog, 'Address (URL)')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expectShot(dialog, 'contrast-more-dialog-focus', {
    ready: () =>
      page.evaluate(
        () =>
          !!document.activeElement?.matches('.rte-dialog button:focus-visible'),
      ),
  });
});
