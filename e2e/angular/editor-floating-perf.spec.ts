import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import { expectFloating, waitFloatingReady } from './helpers/floating';
import { frames, rteHtml, selectIn } from './helpers/toolbar';

// N26 (spec 05b2b, R12, R17). Obrigatório (R12): na página `floating`, com o
// cursor numa célula da tabela de larguras fixas (`colgroup`) e o menu de
// tabela visível, 50 teclas pelo teclado real geram 0 mutações de DOM no menu
// (inclusive de `style`). Informativo (R17): na página `perf`, documento de
// 20 mil palavras com uma tabela e um link no parágrafo 1000 e o editor
// focado, custo por tecla com o menu de tabela e com o de link visíveis pela
// medida do N15 (`handleTextInput` + `dispatch` + leitura de `valid`, e com a
// detecção de mudanças síncrona), mediana e p95 por motor na anotação `N26` e
// no console. Cada caso mede num contexto novo, em duas voltas alternadas,
// como o N15.

const KEYS = 50;
const PARAGRAPHS = 2000;

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

for (const zone of [false, true]) {
  test(`N26 (R12, ${zone ? 'zone' : 'zoneless'}): 50 teclas numa célula com o menu de tabela visível, 0 mutações no menu`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoApp(page, '/floating', { zone });
    await waitForEditor(page, 'floating');
    await expect
      .poll(() => rteHtml(page, 'floating'))
      .toContain('Segundo parágrafo.');
    await waitFloatingReady(page, 'floating');
    // A tabela de uma linha com `colgroup` largo (560 px): 50 teclas não quebram a linha.
    await editableOf(page, 'floating')
      .locator('td', { hasText: 'Larga' })
      .scrollIntoViewIfNeeded();
    await selectIn(page, 'floating', 'Larga', 5, 5);
    await expectFloating(page, 'floating', 'table');
    // A primeira tecla pode mexer no menu (estado de `Undo` etc.): a observação
    // começa depois dela, com o menu já visível.
    await page.keyboard.type('y');
    await frames(page);
    const cell = editableOf(page, 'floating').locator('td', {
      hasText: 'Larga',
    });
    const lineBefore = await cell.evaluate((el) => el.clientHeight);
    await page.evaluate(() => window.rteE2e.watchFloating('floating'));
    await page.keyboard.type('x'.repeat(KEYS));
    await expect
      .poll(() => rteHtml(page, 'floating'))
      .toContain(`Largay${'x'.repeat(KEYS)}`);
    await frames(page);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
    // o fixture não quebrou linha (senão a âncora mudaria e o *fixture* é que está errado)
    expect(await cell.evaluate((el) => el.clientHeight)).toBe(lineBefore);
    expect(
      await page.evaluate(() => window.rteE2e.floatingMutations('floating')),
    ).toEqual({ total: 0, style: 0 });
    await expectFloating(page, 'floating', 'table');
  });
}

type Case = 'table' | 'link';

/** HTML da página `perf`: 2000 parágrafos, link no 1000 e uma tabela logo depois. */
function perfDoc(): string {
  const words = Array.from({ length: 10 }, () => 'palavra').join(' ');
  const plain = `<p>${words}</p>`;
  const withLink = `<p>${words} <a href="https://example.com/">um link</a> fim</p>`;
  const table =
    '<table><tbody><tr><td><p>celula</p></td><td><p>outra</p></td></tr></tbody></table>';
  return plain.repeat(999) + withLink + table + plain.repeat(PARAGRAPHS - 1000);
}

/** Abre `/perf` com o documento grande e espera o menu `kind` ficar visível. */
async function freshEditor(page: Page, kind: Case): Promise<void> {
  await gotoApp(page, '/perf');
  await waitForEditor(page, 'perf');
  await page.evaluate(() => window.rteE2e.toggle('show'));
  await expect(page.locator('rte-editor[data-testid="perf"]')).toHaveCount(0);
  await page.evaluate((html) => {
    window.rteE2e.setValue('perf', html);
    window.rteE2e.setToolbar('perf', 'full');
  }, perfDoc());
  await page.evaluate(() => window.rteE2e.toggle('show'));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { readyAt, toggledAt } = window.rteE2e;
          return (
            readyAt.perf !== undefined &&
            toggledAt !== null &&
            readyAt.perf > toggledAt
          );
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await waitFloatingReady(page, 'perf');
  // editor focado, cursor no alvo do caso
  await editorHost(page, 'perf').evaluate((host, kind) => {
    const editor = window.rteE2e.getRteEditor(host);
    if (!editor) throw new Error("editor 'perf' ausente");
    let target = -1;
    editor.state.doc.descendants((node, pos) => {
      if (target >= 0) return false;
      if (kind === 'table' && node.type.name === 'tableCell') {
        target = pos + 3; // dentro do parágrafo da célula, depois de "c"
        return false;
      }
      if (
        kind === 'link' &&
        node.isText &&
        node.marks.some((m) => m.type.name === 'link')
      ) {
        target = pos + 3;
        return false;
      }
      return true;
    });
    if (target < 0) throw new Error('alvo ausente');
    editor.chain().focus().setTextSelection(target).run();
  }, kind);
  await expect(editableOf(page, 'perf')).toBeFocused();
  await expectFloating(page, 'perf', kind);
  await frames(page);
}

/**
 * Custo de `KEYS` teclas no cursor atual (menu visível): a medida do N8
 * (`handleTextInput` + `dispatch` + leitura de `valid`) e, com `render`,
 * também `ApplicationRef.tick()` depois de cada tecla.
 */
function measure(page: Page, render: boolean): Promise<number[]> {
  return editorHost(page, 'perf').evaluate(
    (host, { keys, render }) => {
      const editor = window.rteE2e.getRteEditor(host);
      if (!editor) throw new Error("editor 'perf' ausente");
      const { view } = editor;
      const result: number[] = [];
      for (let i = 0; i < keys; i++) {
        const { from, to } = view.state.selection;
        const start = performance.now();
        const deflt = () => view.state.tr.insertText('x', from, to);
        const handled = view.someProp('handleTextInput', (f) =>
          f(view, from, to, 'x', deflt),
        );
        if (!handled) view.dispatch(deflt());
        if (!window.rteE2e.state('perf').valid) {
          throw new Error('o formulário deveria estar válido');
        }
        if (render) window.rteE2e.tick();
        result.push(performance.now() - start);
      }
      return result;
    },
    { keys: KEYS, render },
  );
}

test('N26 (R17): custo por tecla no documento de 20 mil palavras com o menu de tabela e o de link visíveis (informativo)', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(300_000);
  const samples: Record<string, number[]> = {};
  for (let round = 0; round < 2; round++) {
    for (const kind of ['table', 'link'] as const) {
      // Contexto novo por caso: outro processo, sem o regime do anterior.
      const context = await browser.newContext();
      const page = await context.newPage();
      await freshEditor(page, kind);
      for (const render of [false, true]) {
        const key = `${kind} ${render ? '+render' : 'N8'}`;
        (samples[key] ??= []).push(...(await measure(page, render)));
        // o menu continua visível depois das teclas (o cursor segue no alvo)
        await expectFloating(page, 'perf', kind);
      }
      await context.close();
    }
  }
  const results = Object.fromEntries(
    Object.entries(samples).map(([k, times]) => [k, summarize(times)]),
  );
  const fmt = (r: { median: number; p95: number }) =>
    `mediana ${r.median.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms`;
  const cases = Object.entries(results)
    .map(([k, r]) => `${k}: ${fmt(r)}`)
    .join('; ');
  const description = `${browserName}: ${cases} (2 contextos × ${KEYS} teclas por caso, editor focado com o menu visível; ${PARAGRAPHS} parágrafos × 10 palavras, tabela e link no parágrafo 1000)`;
  test.info().annotations.push({ type: 'N26', description });
  console.log(`N26 ${description}`);
  // Informativo: só um teto folgado (como o N15).
  for (const r of Object.values(results)) expect(r.median).toBeLessThan(1000);
});
