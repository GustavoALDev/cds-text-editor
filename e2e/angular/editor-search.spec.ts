import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp } from './helpers/app';
import { productivityReady, severeViolations } from './helpers/productivity';
import { frames, loadDoc, rteHtml, selectIn } from './helpers/toolbar';

// N43 (spec 05d1, R4, K7–K10): busca e substituição em navegador real —
// `Mod+F` com seleção vira a consulta; `Enter`/`Shift+Enter`/`F3` andam e o
// resultado ativo fica visível; substituir tudo e um `Mod+Z` restaura;
// `Escape` fecha, limpa as decorações e devolve o foco ao editável; mais de
// 1000 ocorrências mostram "1000+"; axe na barra aberta.

const ID = 'productivity-free';
const FILLER = Array.from({ length: 40 }, (_, i) => `<p>Linha ${i}</p>`).join('');
const DOC = `<p>Primeira banana aqui.</p>${FILLER}<p>Última banana aqui.</p>`;

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/productivity');
  await productivityReady(page, ID, 'vazio');
  await loadDoc(page, ID, DOC);
});

const bar = (page: Page) => editorHost(page, ID).locator('.rte-search');
const queryInput = (page: Page) =>
  bar(page).locator('.rte-search__input').first();
const count = (page: Page) => bar(page).locator('.rte-search__count');
const matches = (page: Page) =>
  editableOf(page, ID).locator('[class*="rte-search-match"]');
const active = (page: Page) =>
  editableOf(page, ID).locator('.rte-search-match--active');

async function openWithBanana(page: Page): Promise<void> {
  await selectIn(page, ID, 'banana');
  await page.keyboard.press('ControlOrMeta+f');
  await expect(bar(page)).toBeVisible();
  await expect(queryInput(page)).toBeFocused();
  await expect(queryInput(page)).toHaveValue('banana');
}

async function inViewport(page: Page, locator: ReturnType<typeof active>) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= -2 && r.bottom <= window.innerHeight + 2;
  });
}

test('N43: Mod+F com seleção vira consulta; Enter, Shift+Enter e F3 andam', async ({
  page,
}) => {
  await openWithBanana(page);
  await expect(count(page)).toHaveText('1 of 2');
  await expect(matches(page)).toHaveCount(2);
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('2 of 2');
  await expect.poll(() => inViewport(page, active(page))).toBe(true);
  await page.keyboard.press('Shift+Enter');
  await expect(count(page)).toHaveText('1 of 2');
  await expect.poll(() => inViewport(page, active(page))).toBe(true);
  await page.keyboard.press('F3');
  await expect(count(page)).toHaveText('2 of 2');
  await expect.poll(() => inViewport(page, active(page))).toBe(true);
  await page.keyboard.press('Shift+F3');
  await expect(count(page)).toHaveText('1 of 2');
});

test('N43: substituir tudo e um Mod+Z restaura', async ({ page }) => {
  await openWithBanana(page);
  const before = await rteHtml(page, ID);
  await bar(page).locator('[aria-expanded]').click();
  await bar(page).locator('.rte-search__input').nth(1).fill('laranja');
  await bar(page).getByRole('button', { name: 'Replace all' }).click();
  await expect.poll(() => rteHtml(page, ID)).toContain('Primeira laranja aqui.');
  expect(await rteHtml(page, ID)).not.toContain('banana');
  await editableOf(page, ID).focus();
  await frames(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => rteHtml(page, ID)).toBe(before);
});

test('N43: Escape fecha, limpa as decorações e devolve o foco', async ({
  page,
}) => {
  await openWithBanana(page);
  await expect(matches(page)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(bar(page)).toBeHidden();
  await expect(matches(page)).toHaveCount(0);
  await expect(editableOf(page, ID)).toBeFocused();
});

test('N43: mais de 1000 ocorrências mostram 1000+', async ({ page }) => {
  await loadDoc(page, ID, `<p>${'x '.repeat(1100).trim()}</p>`);
  await selectIn(page, ID, 'x ', 0, 1);
  await page.keyboard.press('ControlOrMeta+f');
  await expect(queryInput(page)).toHaveValue('x');
  await expect(count(page)).toContainText('1000+');
});

test('N43: axe sem violações serious/critical com a barra aberta', async ({
  page,
}) => {
  await openWithBanana(page);
  await bar(page).locator('[aria-expanded]').click();
  await frames(page);
  expect(await severeViolations(page)).toEqual([]);
});
