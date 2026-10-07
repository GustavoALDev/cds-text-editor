import { expect, test } from '@playwright/test';
import { gotoApp, waitForEditor } from './helpers/app';

// N8 (spec 05a, informativo, para a decisão de `updateOn` da 05d no ADR
// 0007): documento de 20 mil palavras num `[formField]` com `rteMaxChars`.
// Criação = do `toggle('show')` que liga o `@if` ao `editorReady` (pré-voo 16:
// inclui o render). Custo por tecla com a emissão síncrona: `handleTextInput`
// + `dispatch` (transação, `getRteHtml`, escrita no modelo) mais a leitura de
// `state('perf').valid` (validadores sobre o HTML novo). Mediana e p95 vão
// para as anotações (`N8`) e o console; só `mediana < 1000 ms` é conferida.

const KEYS = 50;

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

test('N8: criação e custo por tecla com 20 mil palavras (informativo)', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  await gotoApp(page, '/perf');
  await waitForEditor(page, 'perf');

  // Sem o editor, carrega o documento no modelo; depois liga o `@if`.
  await page.evaluate(() => window.rteE2e.toggle('show'));
  await expect(page.locator('rte-editor[data-testid="perf"]')).toHaveCount(0);
  const paragraph = `<p>${Array.from({ length: 10 }, () => 'palavra').join(' ')}</p>`;
  await page.evaluate(
    (html) => window.rteE2e.setValue('perf', html),
    paragraph.repeat(2000),
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
  const creation = await page.evaluate(
    () =>
      (window.rteE2e.readyAt.perf ?? Number.NaN) -
      (window.rteE2e.toggledAt ?? Number.NaN),
  );

  const times = await page.evaluate((keys) => {
    const host = document.querySelector('rte-editor[data-testid="perf"]');
    const editor = host && window.rteE2e.getRteEditor(host);
    if (!editor) throw new Error("editor 'perf' ausente");
    const { view } = editor;
    if (editor.getText().split(/\s+/).filter(Boolean).length !== 20_000) {
      throw new Error('o documento deveria ter 20 mil palavras');
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
    for (let i = 0; i < keys; i++) {
      const { from, to } = view.state.selection;
      const start = performance.now();
      // Caminho da digitação: `handleTextInput` (limite, `/`, regras de
      // entrada) e, se ninguém tratar, a transação padrão; a emissão é
      // síncrona (D8) e o estado do formulário é lido em seguida.
      const deflt = () => view.state.tr.insertText('x', from, to);
      const handled = view.someProp('handleTextInput', (f) =>
        f(view, from, to, 'x', deflt),
      );
      if (!handled) view.dispatch(deflt());
      if (!window.rteE2e.state('perf').valid) {
        throw new Error('o formulário deveria estar válido');
      }
      result.push(performance.now() - start);
    }
    if (
      view.state.doc.textBetween(target, target + keys) !== 'x'.repeat(keys)
    ) {
      throw new Error('as teclas não chegaram ao documento');
    }
    return result;
  }, KEYS);
  expect(times).toHaveLength(KEYS);
  // A emissão síncrona chegou ao modelo.
  expect(await page.evaluate(() => window.rteE2e.value('perf'))).toContain(
    `palavra${'x'.repeat(KEYS)}</p>`,
  );

  const { median, p95 } = summarize(times);
  const description = `${browserName}: criação ${creation.toFixed(0)} ms; tecla mediana ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms (${KEYS} teclas, 2000 parágrafos × 10 palavras, [formField] com rteMaxChars 1_000_000, leitura de valid)`;
  test.info().annotations.push({ type: 'N8', description });
  console.log(`N8 ${description}`);
  // Informativo: o orçamento por tecla é decidido na 05d (ADR 0007).
  expect(median).toBeLessThan(1000);
});
