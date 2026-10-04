// E10 (spec 03c, §6.3, R8): resultados decorados e visíveis com o ativo
// distinto; ir ao resultado anterior a partir do primeiro seleciona o do fim e
// rola até ele; substituir tudo num documento com marcas e um `Mod+Z` com o
// teclado real restaura o original. Mais a medição informativa de R8.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

const FILLER = Array.from(
  { length: 60 },
  (_, i) => `<p>linha ${i + 1}</p>`,
).join('');
const CONTENT = `<p>gato <strong>gato</strong></p>${FILLER}<p>gato</p>`;

const html = (page: Page) =>
  page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor));

test('E10: resultados visíveis, anterior circular rola até o fim e substituir tudo se desfaz', async ({
  page,
}) => {
  await loadEditorPage(page, { content: CONTENT });
  const matches = page.locator('#editor .rte-search-match');
  const active = page.locator('#editor .rte-search-match--active');

  await page.evaluate(() => window.editor.commands.setSearchQuery('gato'));
  await expect(matches).toHaveCount(3);
  await expect(active).toHaveCount(1);
  await expect(matches.nth(0)).toHaveClass(/rte-search-match--active/);
  for (let i = 0; i < 3; i++) await expect(matches.nth(i)).toBeVisible();
  // Ativo distinto dos demais pelo CSS da página de teste.
  const background = (index: number) =>
    matches
      .nth(index)
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await background(0)).not.toBe(await background(1));
  // O resultado dentro de `<strong>` também é decorado.
  await expect(page.locator('#editor strong .rte-search-match')).toHaveCount(1);
  await expect(matches.nth(2)).not.toBeInViewport();

  const state = await page.evaluate(() => {
    window.editor.commands.previousSearchMatch();
    const search = window.RteEditorLab.getSearchState(window.editor);
    const { from, to } = window.editor.state.selection;
    return { search, from, to };
  });
  expect(state.search?.activeIndex).toBe(2);
  expect(state.search?.total).toBe(3);
  const last = state.search?.matches[2];
  expect({ from: state.from, to: state.to }).toEqual({
    from: last?.from,
    to: last?.to,
  });
  await expect(matches.nth(2)).toHaveClass(/rte-search-match--active/);
  await expect(matches.nth(2)).toBeInViewport();

  await page.evaluate(() =>
    window.editor.commands.replaceAllSearchMatches('cão'),
  );
  expect(await html(page)).toBe(
    `<p>cão <strong>cão</strong></p>${FILLER}<p>cão</p>`,
  );
  await page.evaluate(() => window.editor.commands.focus());
  await expect(page.locator('#editor .ProseMirror')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Z');
  expect(await html(page)).toBe(CONTENT);
});

/** Mediana e p95 (método do posto mais próximo), em ms. */
function summarize(times: readonly number[]): { median: number; p95: number } {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (index: number) => sorted[index] ?? Number.NaN;
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0 ? (at(mid - 1) + at(mid)) / 2 : at(mid);
  const p95 = at(Math.ceil(0.95 * sorted.length) - 1);
  return { median, p95 };
}

test('E10 (R8): tempo por tecla com busca ativa e limite em 20 mil palavras', async ({
  page,
  browserName,
}) => {
  const paragraph = `<p>${Array.from({ length: 10 }, () => 'palavra').join(' ')}</p>`;
  await loadEditorPage(page, {
    content: paragraph.repeat(2000),
    editor: '{ charLimit: 1_000_000 }',
  });
  const times = await page.evaluate(() => {
    const { editor } = window;
    const { view } = editor;
    editor.commands.setSearchQuery('palavra');
    const search = window.RteEditorLab.getSearchState(editor);
    if (search?.matches.length !== 1000 || !search.capped) {
      throw new Error('busca "palavra" deveria estar ativa e no teto');
    }
    // Cursor no meio do documento (fim do parágrafo 1000).
    let target = -1;
    let index = 0;
    view.state.doc.forEach((node, offset) => {
      index += 1;
      if (index === 1000) target = offset + node.nodeSize - 1;
    });
    editor.commands.setTextSelection(target);
    const result: number[] = [];
    for (let i = 0; i < 50; i++) {
      const { from, to } = view.state.selection;
      const start = performance.now();
      // Caminho da digitação: `handleTextInput` (limite, `/`, regras de
      // entrada) e, se ninguém tratar, a transação padrão.
      const deflt = () => view.state.tr.insertText('x', from, to);
      const handled = view.someProp('handleTextInput', (f) =>
        f(view, from, to, 'x', deflt),
      );
      if (!handled) view.dispatch(deflt());
      result.push(performance.now() - start);
    }
    if (view.state.doc.textBetween(target, target + 50) !== 'x'.repeat(50)) {
      throw new Error('as teclas não chegaram ao documento');
    }
    return result;
  });
  expect(times).toHaveLength(50);
  const { median, p95 } = summarize(times);
  const description = `${browserName}: mediana ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms (50 teclas, 2000 parágrafos × 10 palavras, busca "palavra", charLimit 1_000_000)`;
  test.info().annotations.push({ type: 'R8', description });
  console.log(`R8 ${description}`);
  // Informativo (spec 03c, R8): o orçamento é da spec 05 R4.
  expect(median).toBeLessThan(1000);
});
