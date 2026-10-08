import { expect, test } from '@playwright/test';
import { frames, ORIGIN, textOf, watch } from './helpers';

// J2 (spec 07b, W12): o fluxo principal do editor na página /editor — digitar, negrito pela
// barra, item pelo menu `/`, `Mod-F` abre a busca, contador e, ao recarregar, a oferta de
// restaurar o rascunho.

const DRAFT_KEY = 'rte-draft:demo:editor';

test('J2: digitar, negrito, menu /, busca, contador e rascunho', async ({
  page,
}) => {
  const problems = await watch(page);
  await page.goto(`${ORIGIN}/editor`);
  const editor = page.locator('.ProseMirror').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  const counter = page.locator('.rte-counter--chars');
  const before = (await counter.textContent()) ?? '';

  // Digitar num parágrafo novo no fim do documento.
  await editor.locator('p').last().click();
  await page.keyboard.press('End');
  await frames(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('frase-e2e');
  await expect.poll(() => textOf(page, 'editor-html')).toContain('frase-e2e');
  await expect(counter).not.toHaveText(before);

  // Menu `/`: num parágrafo vazio, `/tab` + Enter insere a tabela.
  await page.keyboard.press('Enter');
  await page.keyboard.type('/tab');
  const list = page.locator('.rte-slash-menu');
  await expect(list).toBeVisible();
  await expect(list.getByRole('option', { name: 'Tabela' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => textOf(page, 'editor-html')).toContain('<table');

  // Negrito pela barra: seleciona o parágrafo digitado e aciona o botão. O menu flutuante da
  // tabela (cursor na primeira célula) cobre o parágrafo acima no Firefox/WebKit e intercepta o
  // clique; a seleção vai por teclado (sobe para o parágrafo e seleciona a linha).
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page
    .getByRole('toolbar', { name: 'Formatação', exact: true })
    .getByRole('button', { name: 'Negrito' })
    .click();
  await expect
    .poll(() => textOf(page, 'editor-html'))
    .toContain('<strong>frase-e2e</strong>');

  // Mod-F abre a busca (campo focado); o contador de resultados responde.
  await editor.click();
  await page.keyboard.press('ControlOrMeta+f');
  const search = page.getByRole('search', { name: 'Buscar e substituir' });
  await expect(search).toBeVisible();
  const query = search.getByLabel('Buscar', { exact: true });
  await expect(query).toBeFocused();
  await query.fill('frase-e2e');
  await expect(search.locator('.rte-search__count')).toHaveText(/1/);
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();

  // O rascunho local é gravado (com atraso) e, ao recarregar, o editor oferece restaurá-lo.
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY), {
      timeout: 10_000,
    })
    .toContain('frase-e2e');
  await page.reload();
  await expect(page.locator('.ProseMirror').first()).toBeVisible({
    timeout: 30_000,
  });
  const prompt = page.locator('section.rte-draft');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Restaurar' }).click();
  await expect
    .poll(() => textOf(page, 'editor-html'))
    .toContain('<strong>frase-e2e</strong>');
  expect(problems.messages).toEqual([]);
});
