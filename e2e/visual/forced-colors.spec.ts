import { expect, test } from '@playwright/test';
import { dialogField, openDialogFrom } from '../angular/helpers/dialogs';
import {
  centerScroller,
  expectFloating,
  floatingMenu,
  waitFloatingReady,
} from '../angular/helpers/floating';
import {
  frames,
  menuOf,
  openMenu,
  selectIn,
  toolbarButton,
} from '../angular/helpers/toolbar';
import { editorHost, openEditor, setDoc } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4 (só Chromium): `forced-colors: active` emulado (o bloco `@media (forced-colors: active)` do
// editor.css). A emulação é confiável só no Chromium.

test.use({ colorScheme: 'light' });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
});

const DOC = '<p>Texto com <strong>negrito</strong>.</p>';

test('editor', async ({ page }) => {
  await openEditor(page, '/toolbar', 'toolbar');
  await setDoc(page, 'toolbar', DOC);
  await expect
    .poll(() =>
      page.evaluate(() => matchMedia('(forced-colors: active)').matches),
    )
    .toBe(true);
  await expectShot(editorHost(page, 'toolbar'), 'forced-editor');
});

test('barra com item ativo e foco', async ({ page }) => {
  await openEditor(page, '/toolbar', 'toolbar');
  await setDoc(page, 'toolbar', DOC);
  await selectIn(page, 'toolbar', 'negrito', 2, 2);
  await expect(toolbarButton(page, 'toolbar', 'Bold')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#before-toolbar').focus();
  await page.keyboard.press('Tab');
  await expectShot(
    editorHost(page, 'toolbar').locator('.rte-toolbar'),
    'forced-toolbar-active-focus',
    {
      ready: () =>
        page.evaluate(
          () => !!document.activeElement?.matches(':focus-visible'),
        ),
    },
  );
});

test('menu de títulos', async ({ page }) => {
  await openEditor(page, '/toolbar', 'toolbar');
  await openMenu(page, 'toolbar', 'Text style');
  await frames(page);
  await expectShot(
    await menuOf(page, 'toolbar', 'Text style'),
    'forced-heading-menu',
  );
});

test('menu flutuante de texto', async ({ page }) => {
  await openEditor(page, '/floating', 'floating');
  await waitFloatingReady(page, 'floating');
  await centerScroller(page);
  await selectIn(page, 'floating', 'Segundo parágrafo.', 0, 7);
  await expectFloating(page, 'floating', 'text');
  await expectShot(
    floatingMenu(page, 'floating', 'text'),
    'forced-floating-text',
  );
});

test('diálogo de link', async ({ page }) => {
  await openEditor(page, '/dialogs', 'dialogs');
  await selectIn(page, 'dialogs', 'o site', 0, 0);
  const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
  await expect(dialogField(dialog, 'Address (URL)')).toBeFocused();
  await expectShot(dialog, 'forced-dialog-link');
});

test('seleção de texto', async ({ page }) => {
  await openEditor(page, '/toolbar', 'toolbar');
  await setDoc(page, 'toolbar', DOC);
  await selectIn(page, 'toolbar', 'Texto com', 0, 5);
  await expectShot(
    editorHost(page, 'toolbar').locator('.ProseMirror'),
    'forced-selection',
  );
});
