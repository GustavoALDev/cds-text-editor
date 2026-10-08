import { test, type Page } from '@playwright/test';
import {
  frames,
  menuOf,
  openMenu,
  selectIn,
  toolbarButton,
} from '../angular/helpers/toolbar';
import { editorHost, openEditor, setDoc } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4: barra `full` em repouso, com item ativo, com foco visível e com o menu de títulos aberto.

const ID = 'toolbar';

test.beforeEach(async ({ page }) => {
  await openEditor(page, '/toolbar', ID);
  await setDoc(page, ID, '<p>Texto com <strong>negrito</strong> no meio.</p>');
});

const bar = (page: Page) => editorHost(page, ID).locator('.rte-toolbar');

test('barra full em repouso', async ({ page }) => {
  await expectShot(bar(page), 'toolbar-full-rest');
});

test('barra com item ativo (negrito)', async ({ page }) => {
  await selectIn(page, ID, 'negrito', 2, 2);
  await expectShot(bar(page), 'toolbar-bold-active', {
    ready: async () =>
      (await toolbarButton(page, ID, 'Bold').getAttribute('aria-pressed')) ===
      'true',
  });
});

test('barra com foco visível no primeiro item', async ({ page }) => {
  await page.locator('#before-toolbar').focus();
  await page.keyboard.press('Tab');
  await expectShot(bar(page), 'toolbar-focus-visible', {
    ready: () =>
      page.evaluate(() => !!document.activeElement?.matches(':focus-visible')),
  });
});

test('menu de títulos aberto', async ({ page }) => {
  await openMenu(page, ID, 'Text style');
  await frames(page);
  const menu = await menuOf(page, ID, 'Text style');
  await expectShot(menu, 'toolbar-heading-menu-open');
});
