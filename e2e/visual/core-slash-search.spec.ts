import { expect, test, type Page } from '@playwright/test';
import { gotoApp } from '../angular/helpers/app';
import { productivityReady } from '../angular/helpers/productivity';
import { loadDoc, selectIn } from '../angular/helpers/toolbar';
import { blockExternal, editorHost } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4: menu `/` com opção ativa; barra de busca com resultados e sem resultados.

test('menu / com opção ativa', async ({ page }) => {
  const id = 'productivity';
  const last = 'Segundo parágrafo com banana.';
  await blockExternal(page);
  await gotoApp(page, '/productivity');
  await productivityReady(page);
  await selectIn(page, id, last, last.length);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  const list = editorHost(page, id).locator('.rte-slash-menu');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expectShot(list, 'slash-menu-active-option', {
    ready: async () =>
      (await list.locator('[role=option][aria-selected=true]').count()) === 1,
  });
});

test.describe('busca', () => {
  const id = 'productivity-free';
  const doc = '<p>Primeira banana aqui.</p><p>Outra banana depois.</p>';

  async function openSearch(page: Page): Promise<void> {
    await blockExternal(page);
    await gotoApp(page, '/productivity');
    await productivityReady(page, id, 'vazio');
    await loadDoc(page, id, doc);
    await selectIn(page, id, 'banana');
    await page.keyboard.press('ControlOrMeta+f');
    await expect(editorHost(page, id).locator('.rte-search')).toBeVisible();
  }

  test('com resultados', async ({ page }) => {
    await openSearch(page);
    const bar = editorHost(page, id).locator('.rte-search');
    await expectShot(bar, 'search-bar-with-results', {
      ready: async () =>
        /1 of 2/.test(
          (await bar.locator('.rte-search__count').textContent()) ?? '',
        ),
    });
  });

  test('sem resultados', async ({ page }) => {
    await openSearch(page);
    const bar = editorHost(page, id).locator('.rte-search');
    await bar.locator('.rte-search__input').first().fill('zzzz');
    await expectShot(bar, 'search-bar-no-results', {
      ready: async () =>
        !/of/.test(
          (await bar.locator('.rte-search__count').textContent()) ?? '',
        ),
    });
  });
});
