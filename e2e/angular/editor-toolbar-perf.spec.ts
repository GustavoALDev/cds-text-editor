import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import { expectSelection, frames } from './helpers/toolbar';

// N15 (spec 05b1, R6, U5): documento de 20 mil palavras na página `perf`
// (`[formField]` com `rteMaxChars`, barra `full`). Obrigatório: 50 teclas num
// parágrafo pelo teclado real geram 0 mutações de DOM na barra. Informativo
// (pré-voo 17, para os orçamentos da 05d no ADR 0008): custo por tecla com a
// barra desligada (`false`) e `full` na mesma rodada, com a medida do N8
// (`handleTextInput` + `dispatch` + leitura de `valid`) e com a detecção de
// mudanças síncrona depois de cada tecla (`ApplicationRef.tick`: estado da
// barra e render), mediana e p95 por motor na anotação `N15` e no console.
// Cada caso mede num contexto novo (o custo por tecla sobe em degrau depois de
// ~200 transações no documento grande no Chromium e no WebKit, com ou sem a
// barra; medir tudo numa página só misturaria os regimes), em duas voltas
// alternadas (false, full, false, full), editor sem foco como no N8.

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

/** Posição do fim do parágrafo 1000 (meio do documento). */
function middle(page: Page): Promise<number> {
  return editorHost(page, 'perf').evaluate((host) => {
    const editor = window.rteE2e.getRteEditor(host);
    if (!editor) throw new Error("editor 'perf' ausente");
    let target = -1;
    let index = 0;
    editor.state.doc.forEach((node, offset) => {
      index += 1;
      if (index === 1000) target = offset + node.nodeSize - 1;
    });
    return target;
  });
}

/**
 * Custo de `keys` teclas no meio do documento: a medida do N8 e, com
 * `render`, também `ApplicationRef.tick()` depois de cada tecla.
 */
function measure(page: Page, render: boolean): Promise<number[]> {
  return editorHost(page, 'perf').evaluate(
    (host, { keys, render }) => {
      const editor = window.rteE2e.getRteEditor(host);
      if (!editor) throw new Error("editor 'perf' ausente");
      const { view } = editor;
      let target = -1;
      let index = 0;
      view.state.doc.forEach((node, offset) => {
        index += 1;
        if (index === 1000) target = offset + node.nodeSize - 1;
      });
      editor.commands.setTextSelection(target);
      window.rteE2e.tick();
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

/**
 * Abre `/perf` e cria o editor com o documento grande e a barra `toolbar`
 * (o `@if` liga depois da carga no modelo).
 */
async function freshEditor(page: Page, toolbar: false | 'full'): Promise<void> {
  await gotoApp(page, '/perf');
  await waitForEditor(page, 'perf');
  await page.evaluate(() => window.rteE2e.toggle('show'));
  await expect(page.locator('rte-editor[data-testid="perf"]')).toHaveCount(0);
  const paragraph = `<p>${Array.from({ length: 10 }, () => 'palavra').join(' ')}</p>`;
  await page.evaluate(
    ({ html, toolbar }) => {
      window.rteE2e.setValue('perf', html);
      window.rteE2e.setToolbar('perf', toolbar);
    },
    { html: paragraph.repeat(PARAGRAPHS), toolbar },
  );
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
  await expect(editorHost(page, 'perf').locator('.rte-toolbar')).toHaveCount(
    toolbar ? 1 : 0,
  );
}

test('N15 (R6): 50 teclas num parágrafo pelo teclado real, 0 mutações na barra', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await freshEditor(page, 'full');
  const host = editorHost(page, 'perf');
  expect(
    await host.locator('.rte-toolbar > .rte-toolbar__button').count(),
  ).toBeGreaterThan(25);
  const target = await middle(page);
  await host.evaluate((el, pos) => {
    window.rteE2e.getRteEditor(el)?.commands.focus(pos);
  }, target);
  await expect(editableOf(page, 'perf')).toBeFocused();
  await expectSelection(page, 'perf', { from: target, to: target });
  // A primeira tecla habilita o `Undo` (mutação esperada); a observação
  // começa depois dela.
  await page.keyboard.type('y');
  await frames(page);
  await page.evaluate(() => window.rteE2e.watchToolbar('perf'));
  await page.keyboard.type('x'.repeat(KEYS));
  await expect
    .poll(() => page.evaluate(() => window.rteE2e.value('perf')))
    .toContain(`palavray${'x'.repeat(KEYS)}</p>`);
  await frames(page);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  expect(
    await page.evaluate(() => window.rteE2e.toolbarMutations('perf')),
  ).toBe(0);
});

test('N15: custo por tecla com e sem a barra (informativo)', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(240_000);
  const samples: Record<string, number[]> = {};
  for (let round = 0; round < 2; round++) {
    for (const toolbar of [false, 'full'] as const) {
      // Contexto novo por caso: outro processo, sem o regime do anterior.
      const context = await browser.newContext();
      const page = await context.newPage();
      await freshEditor(page, toolbar);
      const name = toolbar === false ? 'false' : toolbar;
      for (const render of [false, true]) {
        const key = `${name} ${render ? '+render' : 'N8'}`;
        (samples[key] ??= []).push(...(await measure(page, render)));
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
  const description = `${browserName}: ${cases} (2 contextos × ${KEYS} teclas por caso, editor sem foco; ${PARAGRAPHS} parágrafos × 10 palavras, [formField] com rteMaxChars 1_000_000)`;
  test.info().annotations.push({ type: 'N15', description });
  console.log(`N15 ${description}`);
  // Informativo: só um teto folgado (como o N8).
  for (const r of Object.values(results)) expect(r.median).toBeLessThan(1000);
});
