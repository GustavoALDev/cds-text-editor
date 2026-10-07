import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp } from './helpers/app';
import { productivityReady } from './helpers/productivity';
import { loadDoc, selectIn } from './helpers/toolbar';

// N44 (spec 05d1, R5, K11, K12): contadores e limite em navegador real — os
// contadores mudam ao digitar, mostram o estado "perto" e, no limite, a tecla
// recusada gera o anúncio na região viva. (Os validadores de conteúdo, K13,
// entram com a 05d1 T5.)

const ID = 'productivity';

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/productivity');
  await productivityReady(page);
});

const chars = (page: Page) =>
  editorHost(page, ID).locator('.rte-counter--chars');
const words = (page: Page) =>
  editorHost(page, ID).locator('.rte-counter--words');
const live = (page: Page) => editorHost(page, ID).locator('.rte-live--limit');

async function charCount(page: Page): Promise<number> {
  const text = (await chars(page).textContent()) ?? '';
  const m = /^(\d+)\/200$/.exec(text.trim());
  expect(m, text).not.toBeNull();
  return Number(m![1]);
}

test('N44: os contadores mudam ao digitar', async ({ page }) => {
  await expect(chars(page)).toHaveText(/^\d+\/200$/);
  await expect(words(page)).toHaveText(/\d+ words · 1 min read/);
  const c0 = await charCount(page);
  const w0 = Number(/^(\d+)/.exec((await words(page).textContent()) ?? '')![1]);
  await selectIn(page, ID, 'Segundo parágrafo com banana.', 29);
  await page.keyboard.type(' uma duas');
  await expect.poll(() => charCount(page)).toBe(c0 + 9);
  await expect(words(page)).toHaveText(new RegExp(`^${w0 + 2} words`));
  await expect(chars(page)).not.toHaveClass(/rte-counter--(near|over)/);
});

test('N44: no limite, a tecla recusada gera o anúncio na região viva', async ({
  page,
}) => {
  await loadDoc(page, ID, `<p>${'a'.repeat(190)}</p>`);
  await expect(chars(page)).toHaveText('190/200');
  await expect(chars(page)).toHaveClass(/rte-counter--near/);
  // Nada foi anunciado pela carga externa.
  await expect(live(page)).toHaveText('');
  await selectIn(page, ID, 'aaaa', 0, 0);
  await editableOf(page, ID).press('End');
  await page.keyboard.type('b'.repeat(15));
  await expect(chars(page)).toHaveText('200/200');
  await expect(live(page)).toContainText('Character limit of 200 reached.');
});
