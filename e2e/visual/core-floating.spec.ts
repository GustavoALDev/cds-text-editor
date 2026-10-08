import { expect, test, type Page } from '@playwright/test';
import {
  centerScroller,
  expectFloating,
  floatingMenu,
  waitFloatingReady,
  type FloatingKind,
} from '../angular/helpers/floating';
import { selectMediaByClick } from '../angular/helpers/media';
import { selectIn } from '../angular/helpers/toolbar';
import { openEditor, routeMedia } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4: menus flutuantes de texto, link, tabela, imagem, vídeo e embed. A cor e a forma do menu
// não dependem do conteúdo atrás dele: captura-se só o menu.

async function shoot(
  page: Page,
  id: 'floating' | 'media',
  kind: FloatingKind,
): Promise<void> {
  await expectFloating(page, id, kind);
  await expectShot(floatingMenu(page, id, kind), `floating-${kind}`);
}

test.describe('página floating', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page, '/floating', 'floating');
    await expect(
      page.locator('rte-editor[data-testid="floating"] .ProseMirror'),
    ).toContainText('Segundo parágrafo.');
    await waitFloatingReady(page, 'floating');
    await centerScroller(page);
  });

  test('menu de texto', async ({ page }) => {
    await selectIn(page, 'floating', 'Segundo parágrafo.', 0, 7);
    await shoot(page, 'floating', 'text');
  });

  test('menu de link', async ({ page }) => {
    await selectIn(page, 'floating', 'um link', 3, 3);
    await shoot(page, 'floating', 'link');
  });

  test('menu de tabela', async ({ page }) => {
    await selectIn(page, 'floating', 'A1', 1, 1);
    await shoot(page, 'floating', 'table');
  });

  test('menu de imagem', async ({ page }) => {
    await selectMediaByClick(page, 'floating', 'image');
    await shoot(page, 'floating', 'image');
  });
});

test.describe('página media', () => {
  test.beforeEach(async ({ page }) => {
    await routeMedia(page.context());
    await openEditor(page, '/media', 'media');
    await expect(
      page.locator('rte-editor[data-testid="media"] video'),
    ).toHaveCount(1);
    await waitFloatingReady(page, 'media');
  });

  test('menu de vídeo', async ({ page }) => {
    await selectMediaByClick(page, 'media', 'video');
    await shoot(page, 'media', 'video');
  });

  test('menu de embed', async ({ page }) => {
    await selectMediaByClick(page, 'media', 'embed');
    await shoot(page, 'media', 'embed');
  });
});
