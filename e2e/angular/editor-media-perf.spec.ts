import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import { frames } from './helpers/toolbar';

// N32 (spec 05c1, R14, pré-voo 17). Informativo com guarda: na página `perf`
// (com `?media`, que liga `features.media`), documento de 20 mil palavras sem
// mídia (A) e com 200 imagens espalhadas (B), editor focado, custo por tecla
// pela medida do N15 (`handleTextInput` + `dispatch` + leitura de `valid`, e
// com a detecção de mudanças síncrona). Mediana e p95 por motor na anotação
// `N32` e no console. Cada caso mede num contexto novo, em duas voltas
// alternadas, como o N15/N26. Guarda (R14, Ruling 12): o rastreador — ouvintes
// `transaction` do Tiptap menos a serialização do documento, pareados por
// tecla — custa no máximo 1 ms a mais em B que em A e no máximo 1 ms em B. O
// B-A da tecla inteira fica só na anotação: soma o desenho das 200 imagens, o
// validador e a serialização do documento maior, que não são o rastreador.

const KEYS = 50;
const PARAGRAPHS = 2000;
const IMAGES = 200;
/**
 * Sentinela: a mediana dos ouvintes cobre pelo menos esta fração da mediana de
 * uma serialização avulsa. Folga relativa: no WebKit sob carga as duas sobem
 * juntas (27 ms) e a diferença passa do relógio de 1 ms; sem a serialização
 * do `value` nos ouvintes, a razão cai para perto de 0.
 */
const SERIALIZE_SHARE = 0.5;
/** Teto de alarme do B-A da tecla inteira (informativo; não é a guarda da R14). */
const WHOLE_KEY_ALARM = 5;
// ADR 0016/0019: tetos bloqueiam com `RTE_PERF_ENFORCE=1`; sem a variável (CI)
// vale a guarda frouxa de 2x. Os números seguem sempre logados/anotados.
const GUARD = process.env['RTE_PERF_ENFORCE'] === '1' ? 1 : 2;

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

type Case = 'A' | 'B';

/** 2000 parágrafos de 10 palavras; em B, uma imagem a cada 10 parágrafos. */
function perfDoc(withImages: boolean): string {
  const words = Array.from({ length: 10 }, () => 'palavra').join(' ');
  const plain = `<p>${words}</p>`;
  const image =
    '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" alt="Imagem de teste" loading="lazy" decoding="async"></figure>';
  const every = PARAGRAPHS / IMAGES;
  let html = '';
  for (let i = 1; i <= PARAGRAPHS; i++) {
    html += plain;
    if (withImages && i % every === 0) html += image;
  }
  return html;
}

/** Abre `/perf?media` com o documento do caso e foca o parágrafo 1000. */
async function freshEditor(page: Page, kase: Case): Promise<void> {
  await gotoApp(page, '/perf?media');
  await waitForEditor(page, 'perf');
  await page.evaluate(() => window.rteE2e.toggle('show'));
  await expect(page.locator('rte-editor[data-testid="perf"]')).toHaveCount(0);
  await page.evaluate(
    (html) => {
      window.rteE2e.setValue('perf', html);
      window.rteE2e.setToolbar('perf', 'full');
    },
    perfDoc(kase === 'B'),
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
  const images = await editorHost(page, 'perf').evaluate((host) => {
    const editor = window.rteE2e.getRteEditor(host);
    if (!editor) throw new Error("editor 'perf' ausente");
    let count = 0;
    let target = -1;
    let paragraphs = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'rtImage') count++;
      if (node.type.name === 'paragraph') {
        paragraphs++;
        if (paragraphs === 1000 && target < 0) target = pos + 3;
      }
      return true;
    });
    if (target < 0) throw new Error('alvo ausente');
    editor.chain().focus().setTextSelection(target).run();
    return count;
  });
  // O documento B tem mesmo as 200 imagens (a mídia não foi descartada).
  expect(images).toBe(kase === 'B' ? IMAGES : 0);
  await expect(editableOf(page, 'perf')).toBeFocused();
  await frames(page);
}

interface Sample {
  /** Tecla inteira (a medida do N15). */
  total: number;
  /** Ouvintes `transaction` do Tiptap na tecla (rastreador, `value`, ...). */
  listeners: number;
  /** Uma serialização (`getRteHtml`) do documento depois da tecla. */
  serialize: number;
}

/**
 * Custo de `KEYS` teclas no cursor atual (a medida do N15) e, na mesma tecla,
 * o tempo dos ouvintes `transaction` do Tiptap — o do `RteEditor` roda o
 * rastreador de mídia (R14) e serializa o documento para o `value` — e o de
 * uma serialização avulsa logo depois (fora do total). `listeners −
 * serialize`, pareado por tecla, isola o rastreador do resto do custo do
 * documento maior (desenho das imagens, validador, detecção de mudanças).
 */
async function measure(page: Page, render: boolean): Promise<Sample[]> {
  const { samples, calls } = await editorHost(page, 'perf').evaluate(
    (host, { keys, render }) => {
      const editor = window.rteE2e.getRteEditor(host);
      if (!editor) throw new Error("editor 'perf' ausente");
      const { view } = editor;
      // Campo privado do EventEmitter do Tiptap (`callbacks`): só para medir.
      const emitter = editor as unknown as {
        callbacks: Record<string, ((...args: unknown[]) => void)[]>;
      };
      const original = emitter.callbacks['transaction'] ?? [];
      if (original.length === 0) throw new Error('sem ouvintes transaction');
      let spent = 0;
      let calls = 0;
      emitter.callbacks['transaction'] = original.map(
        (fn) =>
          function (this: unknown, ...args: unknown[]) {
            calls++;
            const t0 = performance.now();
            try {
              fn.apply(this, args);
            } finally {
              spent += performance.now() - t0;
            }
          },
      );
      const result: {
        total: number;
        listeners: number;
        serialize: number;
      }[] = [];
      try {
        for (let i = 0; i < keys; i++) {
          const { from, to } = view.state.selection;
          spent = 0;
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
          const total = performance.now() - start;
          const listeners = spent;
          const s0 = performance.now();
          if (window.rteE2e.rteHtml(host) === null) throw new Error('sem html');
          result.push({ total, listeners, serialize: performance.now() - s0 });
        }
      } finally {
        emitter.callbacks['transaction'] = original;
      }
      return { samples: result, calls };
    },
    { keys: KEYS, render },
  );
  // Sentinelas: a medida depende do campo privado `callbacks` do Tiptap. Se
  // ele mudar, os envoltórios deixam de ser chamados (ou deixam de cobrir a
  // serialização do `value`) e o "rastreador" daria 0 sem medir nada.
  expect(
    calls,
    'Tiptap EventEmitter mudou; revisar N32 (ouvintes transaction não chamados)',
  ).toBeGreaterThanOrEqual(KEYS);
  const med = (values: number[]) => summarize(values).median;
  expect(
    med(samples.map((r) => r.listeners)),
    'Tiptap EventEmitter mudou; revisar N32 (ouvintes sem a serialização do value)',
  ).toBeGreaterThanOrEqual(
    med(samples.map((r) => r.serialize)) * SERIALIZE_SHARE,
  );
  return samples;
}

test('N32 (R14): custo por tecla com 200 imagens no documento de 20 mil palavras (A sem mídia x B com 200 imagens; guarda de 1 ms na mediana)', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(420_000);
  const samples: Record<string, number[]> = {};
  const push = (key: string, values: number[]) =>
    (samples[key] ??= []).push(...values);
  for (let round = 0; round < 2; round++) {
    for (const kase of ['A', 'B'] as const) {
      // Contexto novo por caso: outro processo, sem o regime do anterior.
      const context = await browser.newContext();
      const page = await context.newPage();
      await freshEditor(page, kase);
      for (const render of [false, true]) {
        const mode = render ? '+render' : 'N8';
        const run = await measure(page, render);
        push(
          `${kase} ${mode}`,
          run.map((r) => r.total),
        );
        push(
          `${kase} ${mode} ouvintes`,
          run.map((r) => r.listeners),
        );
        push(
          `${kase} serialize`,
          run.map((r) => r.serialize),
        );
        // Rastreador (R14): ouvintes menos a serialização, pareados por tecla.
        push(
          `${kase} rastreador`,
          run.map((r) => r.listeners - r.serialize),
        );
      }
      await context.close();
    }
  }
  const results = Object.fromEntries(
    Object.entries(samples).map(([k, times]) => [k, summarize(times)]),
  );
  const at = (key: string) => {
    const r = results[key];
    if (!r) throw new Error(`sem amostras para ${key}`);
    return r;
  };
  const fmt = (r: { median: number; p95: number }) =>
    `mediana ${r.median.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms`;
  const delta = (key: string) => at(`B ${key}`).median - at(`A ${key}`).median;
  const deltaN8 = delta('N8');
  const deltaRender = delta('+render');
  const deltaSerialize = delta('serialize');
  const deltaTracker = delta('rastreador');
  const cases = Object.entries(results)
    .map(([k, r]) => `${k}: ${fmt(r)}`)
    .join('; ');
  const description = `${browserName}: ${cases}; B-A (mediana) N8 ${deltaN8.toFixed(2)} ms, +render ${deltaRender.toFixed(2)} ms, serialização ${deltaSerialize.toFixed(2)} ms, rastreador (ouvintes − serialização, pareado) ${deltaTracker.toFixed(2)} ms (2 contextos × ${KEYS} teclas por caso e modo, editor focado; ${PARAGRAPHS} parágrafos × 10 palavras, B com ${IMAGES} imagens)`;
  test.info().annotations.push({ type: 'N32', description });
  console.log(`N32 ${description}`);
  // Guarda da R14: o custo do rastreador com 200 imagens. B-A da tecla
  // inteira (informativo acima) soma também a serialização do documento
  // maior, o validador, o desenho das imagens e a detecção de mudanças — nada
  // disso é o rastreador (Ruling 12 e ADR 0011). A guarda isola o rastreador:
  // ouvintes `transaction` menos a serialização, pareados por tecla.
  expect(
    deltaTracker,
    'B-A do rastreador (ouvintes − serialização)',
  ).toBeLessThanOrEqual(1 * GUARD);
  expect(
    at('B rastreador').median,
    'rastreador com 200 imagens (mediana por tecla)',
  ).toBeLessThanOrEqual(1 * GUARD);
  // Informativo, teto de alarme: a tecla inteira com 200 imagens não pode
  // disparar (medido 2-2,3 ms em N8 nos 3 motores).
  expect(
    deltaN8,
    'B-A da tecla inteira, N8 (informativo, teto de alarme)',
  ).toBeLessThanOrEqual(WHOLE_KEY_ALARM * GUARD);
});
