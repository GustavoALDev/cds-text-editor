import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import { perfDocument, PERF_TARGET_PARAGRAPH } from './helpers/perf-doc';
import { selectIn } from './helpers/toolbar';

// N45 (spec 05d2, Z1-Z5): orçamentos de desempenho do cenário completo
// (`/perf?full`: 20 mil palavras, tabela, link, 20 imagens, barra `full`,
// menus, mídia, busca aberta com ~50 resultados, contadores, limite,
// validadores e `draftKey`, editor focado no parágrafo 1000). Bloqueantes só
// com `RTE_PERF_ENFORCE=1` (verificação local, Chromium); sem a variável vale
// a guarda grosseira de 2x o orçamento, sempre ativa. Sem retry. Cada medida
// por tecla roda num contexto novo, em duas voltas alternadas (N15/N26/N32).

const ENFORCE = process.env['RTE_PERF_ENFORCE'] === '1';
const GUARD = 2;
const KEYS = 50;
const WARM_KEYS = 250;

/** Orçamentos da Z3 (ms). */
const BUDGET = {
  keyP95: 50,
  cappedP95: 50,
  createFull: 300,
  createEmpty: 50,
  inp: 200,
  draftWrite: 16,
} as const;

function summarize(times: readonly number[]): { median: number; p95: number } {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (index: number) => sorted[index] ?? Number.NaN;
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0 ? (at(mid - 1) + at(mid)) / 2 : at(mid);
  return { median, p95: at(Math.ceil(0.95 * sorted.length) - 1) };
}

const fmt = (r: { median: number; p95: number }) =>
  `mediana ${r.median.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms`;

/** Guarda de 2x sempre; orçamento só com `RTE_PERF_ENFORCE=1`. */
function check(name: string, value: number, budget: number, on = true): void {
  expect
    .soft(value, `${name}: guarda de ${GUARD}x o orçamento (${budget} ms)`)
    .toBeLessThanOrEqual(budget * GUARD);
  if (ENFORCE && on) {
    expect
      .soft(value, `${name}: orçamento ${budget} ms`)
      .toBeLessThanOrEqual(budget);
  }
}

function report(type: string, text: string, browserName: string): void {
  const description = `${browserName}: ${text}`;
  test.info().annotations.push({ type, description });
  console.log(`${type} ${description}`);
}

/** Cria o editor com o documento no `@if`; devolve a criação (toggle -> editorReady) em ms. */
async function create(page: Page): Promise<number> {
  await page.evaluate(() => window.rteE2e.toggle('show'));
  await expect(page.locator('rte-editor[data-testid="perf"]')).toHaveCount(0);
  await page.evaluate(
    (html) => window.rteE2e.setValue('perf', html),
    perfDocument(),
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
      { timeout: 120_000 },
    )
    .toBe(true);
  return page.evaluate(
    () =>
      (window.rteE2e.readyAt.perf ?? Number.NaN) -
      (window.rteE2e.toggledAt ?? Number.NaN),
  );
}

/** Foca o editor com o cursor no fim do parágrafo `PERF_TARGET_PARAGRAPH`. */
async function focusMiddle(page: Page): Promise<void> {
  await editorHost(page, 'perf').evaluate((host, paragraph) => {
    const editor = window.rteE2e.getRteEditor(host);
    if (!editor) throw new Error("editor 'perf' ausente");
    let target = -1;
    let index = 0;
    editor.state.doc.forEach((node, offset) => {
      index += 1;
      if (index === paragraph) target = offset + node.nodeSize - 1;
    });
    editor.commands.focus(target);
    editor.commands.setTextSelection(target);
  }, PERF_TARGET_PARAGRAPH);
  // o `focus(posição)` do Tiptap age num `requestAnimationFrame`
  await expect(editableOf(page, 'perf')).toBeFocused();
}

interface Scenario {
  full: boolean;
  /** Consulta da busca aberta (`null`: sem busca). */
  search: 'banana' | 'palavra' | null;
}

/** Contexto novo já com o editor criado, a busca aberta e o foco no meio. */
async function fresh(page: Page, { full, search }: Scenario): Promise<number> {
  await gotoApp(page, full ? '/perf?full' : '/perf');
  await waitForEditor(page, 'perf');
  const creation = await create(page);
  if (search !== null) {
    await selectIn(page, 'perf', search);
    await page.keyboard.press('ControlOrMeta+f');
    const bar = editorHost(page, 'perf').locator('.rte-search');
    await expect(bar).toBeVisible();
    await expect(bar.locator('.rte-search__input').first()).toHaveValue(search);
    await expect(bar.locator('.rte-search__count')).toContainText(
      search === 'banana' ? 'of 50' : '1000+',
    );
  }
  await focusMiddle(page);
  return creation;
}

/**
 * `keys` teclas (N15 com render ou N8 sem), depois de `skip` descartadas. Cede
 * ao navegador entre as teclas, como uma digitação real; a espera fica fora da
 * medida.
 */
function measure(
  page: Page,
  keys: number,
  skip: number,
  render: boolean,
): Promise<number[]> {
  return editorHost(page, 'perf').evaluate(
    async (host, { keys, skip, render }) => {
      const editor = window.rteE2e.getRteEditor(host);
      if (!editor) throw new Error("editor 'perf' ausente");
      const { view } = editor;
      const result: number[] = [];
      for (let i = 0; i < skip + keys; i++) {
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
        if (i >= skip) result.push(performance.now() - start);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return result;
    },
    { keys, skip, render },
  );
}

test('N45: custo por tecla nos dois regimes, criação completa e linha de base N8', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(900_000);
  const samples: Record<string, number[]> = {};
  const creations: number[] = [];
  const add = (key: string, times: number[]) =>
    (samples[key] ??= []).push(...times);

  for (let round = 0; round < 2; round++) {
    // linha de base: cenário do N8 (sem ?full), regime frio, sem render
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await fresh(page, { full: false, search: null });
      add('base N8 frio', await measure(page, KEYS, 0, false));
      await context.close();
    }
    for (const regime of ['frio', 'quente'] as const) {
      for (const render of [true, false]) {
        const context = await browser.newContext();
        const page = await context.newPage();
        creations.push(await fresh(page, { full: true, search: 'banana' }));
        add(
          `completo ${regime} ${render ? '+render' : 'N8'}`,
          await measure(page, KEYS, regime === 'frio' ? 0 : WARM_KEYS, render),
        );
        await context.close();
      }
    }
  }
  const results = Object.fromEntries(
    Object.entries(samples).map(([k, t]) => [k, summarize(t)]),
  );
  const creation = summarize(creations);
  report(
    'N45',
    `${Object.entries(results)
      .map(([k, r]) => `${k}: ${fmt(r)}`)
      .join(
        '; ',
      )}; criação completa ${fmt(creation)} (${creations.length} amostras) (2 contextos x ${KEYS} teclas por caso; regime quente = teclas ${WARM_KEYS + 1}-${WARM_KEYS + KEYS}; ENFORCE=${ENFORCE})`,
    browserName,
  );
  check(
    'tecla frio (+render)',
    results['completo frio +render']?.p95 ?? Number.NaN,
    BUDGET.keyP95,
  );
  check(
    'tecla quente (+render)',
    results['completo quente +render']?.p95 ?? Number.NaN,
    BUDGET.keyP95,
  );
  check('criação completa', creation.median, BUDGET.createFull);
  expect
    .soft(Math.max(...creations), 'criação completa: guarda 2x')
    .toBeLessThanOrEqual(BUDGET.createFull * GUARD);
});

test('N45: busca capada (1000+) por tecla', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(600_000);
  const times: number[] = [];
  for (let round = 0; round < 2; round++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await fresh(page, { full: true, search: 'palavra' });
    times.push(...(await measure(page, KEYS, 0, true)));
    await context.close();
  }
  const r = summarize(times);
  report(
    'N45',
    `busca capada (consulta com 20 mil ocorrências): ${fmt(r)}`,
    browserName,
  );
  check('busca capada', r.p95, BUDGET.cappedP95);
});

test('N45: criação de editor vazio com barra minimal', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300_000);
  await gotoApp(page, '/perf');
  await waitForEditor(page, 'perf');
  await page.evaluate(() => window.rteE2e.setToolbar('perf', 'minimal'));
  const times = await page.evaluate(async () => {
    const selector = 'rte-editor[data-testid="perf"]';
    const until = async (cond: () => boolean) => {
      const deadline = performance.now() + 10_000;
      while (!cond()) {
        if (performance.now() > deadline) throw new Error('tempo esgotado');
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    const result: number[] = [];
    // 2 de aquecimento (chunks e caches) + 20 medidas
    for (let i = 0; i < 22; i++) {
      window.rteE2e.toggle('show');
      await until(() => !document.querySelector(selector));
      window.rteE2e.toggle('show');
      await until(() => {
        const { readyAt, toggledAt } = window.rteE2e;
        return (
          readyAt.perf !== undefined &&
          toggledAt !== null &&
          readyAt.perf > toggledAt
        );
      });
      if (i >= 2) {
        result.push(
          (window.rteE2e.readyAt.perf ?? Number.NaN) -
            (window.rteE2e.toggledAt ?? Number.NaN),
        );
      }
    }
    return result;
  });
  expect(times).toHaveLength(20);
  const r = summarize(times);
  report(
    'N45',
    `criação vazia (minimal, 20 criações): ${fmt(r)}; max ${Math.max(...times).toFixed(1)} ms`,
    browserName,
  );
  check('criação vazia', r.median, BUDGET.createEmpty);
});

test('N45: INP da digitação com teclado real (só o Chromium bloqueia)', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300_000);
  await fresh(page, { full: true, search: 'banana' });
  await page.evaluate(() => {
    const w = window as unknown as { __inp: Map<number, number> };
    w.__inp = new Map();
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEventTiming[]) {
        if (!e.interactionId) continue;
        w.__inp.set(
          e.interactionId,
          Math.max(w.__inp.get(e.interactionId) ?? 0, e.duration),
        );
      }
    }).observe({
      type: 'event',
      durationThreshold: 16,
      buffered: false,
    } as PerformanceObserverInit);
  });
  await focusMiddle(page);
  await page.keyboard.type('x'.repeat(KEYS), { delay: 50 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  expect(await page.evaluate(() => window.rteE2e.value('perf'))).toContain(
    'x'.repeat(KEYS),
  );
  const durations = await page.evaluate(() => [
    ...(window as unknown as { __inp: Map<number, number> }).__inp.values(),
  ]);
  // INP: a pior interação (menos de 50), a do percentil 98 acima disso.
  const sorted = [...durations].sort((a, b) => b - a);
  const inp =
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))] ?? 0;
  report(
    'N45',
    `INP ${inp} ms (${durations.length} interações >= 16 ms observadas de ${KEYS} teclas; 0 = abaixo de 16 ms ou sem interactionId)`,
    browserName,
  );
  check('INP', inp, BUDGET.inp, browserName === 'chromium');
});

test('N45: gravação do rascunho por gravação', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300_000);
  interface DraftProbe {
    __draftFlushMs: number[];
    __draftWrites: number;
  }
  await page.addInitScript(() => {
    const w = window as unknown as DraftProbe;
    w.__draftFlushMs = [];
    w.__draftWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('rte-draft:')) w.__draftWrites++;
      return setItem.call(this, key, value);
    };
    const orig = window.setTimeout.bind(window);
    // O agendador do rascunho usa `setTimeout(fn, 1000)`: mede a volta inteira
    // (HTML atual + serialização + `setItem`) quando ela gravou.
    window.setTimeout = ((
      fn: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 1000 && typeof fn === 'function') {
        const inner = fn as (...a: unknown[]) => void;
        return orig(
          (...a: unknown[]) => {
            const before = w.__draftWrites;
            const t0 = performance.now();
            try {
              inner(...a);
            } finally {
              if (w.__draftWrites > before) {
                w.__draftFlushMs.push(performance.now() - t0);
              }
            }
          },
          delay,
          ...args,
        );
      }
      return orig(fn, delay, ...args);
    }) as typeof window.setTimeout;
  });
  await fresh(page, { full: true, search: 'banana' });
  await focusMiddle(page);
  const flushes = () =>
    page.evaluate(() => (window as unknown as DraftProbe).__draftFlushMs);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.type('y');
    await expect
      .poll(async () => (await flushes()).length, { timeout: 15_000 })
      .toBe(i + 1);
  }
  const times = await flushes();
  report(
    'N45',
    `gravação do rascunho: ${times.map((t) => t.toFixed(2)).join(', ')} ms (3 gravações)`,
    browserName,
  );
  check('gravação do rascunho', Math.max(...times), BUDGET.draftWrite);
});
