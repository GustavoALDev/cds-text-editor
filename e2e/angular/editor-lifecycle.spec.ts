import { expect, test } from '@playwright/test';
import { gotoApp, waitForEditor } from './helpers/app';

// N7 (spec 05a, R2, D23): o editor entra e sai de um `@if` 100 vezes; a
// contagem de `.ProseMirror`/`[contenteditable]` volta à inicial e o gancho
// do último host removido é `null`. No Chromium, o heap depois de coleta
// forçada (CDP) antes e depois vai para as anotações (`N7`, informativo).

const TOGGLES = 100;
const WARM_UP = 10;

test('N7: alternar o editor 100× não deixa editor nem editável para trás', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120_000);
  await gotoApp(page, '/lifecycle');
  await waitForEditor(page, 'lifecycle');

  const counts = () =>
    page.evaluate(() => ({
      prosemirror: document.querySelectorAll('.ProseMirror').length,
      editable: document.querySelectorAll('[contenteditable]').length,
    }));
  const initial = await counts();
  expect(initial).toEqual({ prosemirror: 1, editable: 1 });

  const cdp =
    browserName === 'chromium'
      ? await page.context().newCDPSession(page)
      : null;
  const heap = async () => {
    if (!cdp) return null;
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  const cycle = (count: number) =>
    page.evaluate(async (toggles) => {
      const selector = 'rte-editor[data-testid="lifecycle"]';
      const until = async (cond: () => boolean, what: string) => {
        const deadline = performance.now() + 10_000;
        while (!cond()) {
          if (performance.now() > deadline) throw new Error(`sem ${what}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      };
      let removed: Element | null = null;
      let removals = 0;
      for (let i = 0; i < toggles; i++) {
        const host = document.querySelector(selector);
        window.rteE2e.toggle('show');
        if (host) {
          removed = host;
          removals++;
          await until(() => !document.querySelector(selector), 'remoção');
        } else {
          await until(() => {
            const next = document.querySelector(selector);
            return !!next && window.rteE2e.getRteEditor(next) !== null;
          }, 'criação');
        }
      }
      return {
        removals,
        removedConnected: removed?.isConnected ?? null,
        removedHookNull:
          removed !== null && window.rteE2e.getRteEditor(removed) === null,
      };
    }, count);

  // Aquecimento (chunks preguiçosos, caches do Angular e do JIT) fora da
  // medida do heap.
  await cycle(WARM_UP);
  const heapBefore = await heap();
  const result = await cycle(TOGGLES);
  expect(result).toEqual({
    removals: TOGGLES / 2,
    removedConnected: false,
    removedHookNull: true,
  });
  await waitForEditor(page, 'lifecycle');
  expect(await counts()).toEqual(initial);

  const heapAfter = await heap();
  if (heapBefore !== null && heapAfter !== null) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(2);
    const description = `${browserName}: heap depois de GC ${mb(heapBefore)} MB → ${mb(heapAfter)} MB (${TOGGLES} alternâncias depois de ${WARM_UP} de aquecimento; Δ ${mb(heapAfter - heapBefore)} MB)`;
    test.info().annotations.push({ type: 'N7', description });
    console.log(`N7 ${description}`);
  }
});

// N46 (spec 05d2, Z11, R5): o N7 ampliado, obrigatório. Cenário completo
// (`/lifecycle?full`, documento pequeno, sem `[formField]`: o Signal Forms segura o último `FormField` destruído até o próximo), 100 alternâncias depois de 10 de
// aquecimento. Nos 3 motores: a contagem de nós do documento, de
// `.ProseMirror` e de `[popover]` volta à inicial. No Chromium, depois de
// coleta forçada por CDP: 0 `Editor` vivo (`WeakRef` na ponte, que não retém
// nenhum), `JSEventListeners` (`Performance.getMetrics`) sem crescimento acima
// de 5% e o heap com crescimento de no máximo 1 MB entre as alternâncias 50 e
// 100 (o crescimento inicial é cache, ADR 0007).

test('N46: 100 alternâncias do cenário completo não vazam editor, nós nem ouvintes', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300_000);
  await gotoApp(page, '/lifecycle?full');
  await waitForEditor(page, 'lifecycle');

  const counts = () =>
    page.evaluate(() => ({
      prosemirror: document.querySelectorAll('.ProseMirror').length,
      popover: document.querySelectorAll('[popover]').length,
      nodes: document.getElementsByTagName('*').length,
    }));
  // os menus flutuantes e o resto dos `@defer` chegam depois do `editorReady`
  const settled = async () => {
    let previous = JSON.stringify(await counts());
    for (let i = 0; i < 50; i++) {
      await page.waitForTimeout(100);
      const now = JSON.stringify(await counts());
      if (now === previous)
        return JSON.parse(now) as Awaited<ReturnType<typeof counts>>;
      previous = now;
    }
    throw new Error('o DOM não estabilizou');
  };
  const initial = await settled();
  expect(initial.prosemirror).toBe(1);
  expect(initial.popover).toBeGreaterThan(0);

  const cdp =
    browserName === 'chromium'
      ? await page.context().newCDPSession(page)
      : null;
  if (cdp) await cdp.send('Performance.enable');
  const measure = async () => {
    if (!cdp) return null;
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    const { metrics } = await cdp.send('Performance.getMetrics');
    const listeners = metrics.find((m) => m.name === 'JSEventListeners')?.value;
    return { heap, listeners: listeners ?? Number.NaN };
  };
  const cycle = (count: number) =>
    page.evaluate(async (toggles) => {
      const selector = 'rte-editor[data-testid="lifecycle"]';
      const until = async (cond: () => boolean, what: string) => {
        const deadline = performance.now() + 10_000;
        while (!cond()) {
          if (performance.now() > deadline) throw new Error(`sem ${what}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      };
      for (let i = 0; i < toggles; i++) {
        const host = document.querySelector(selector);
        window.rteE2e.toggle('show');
        if (host) {
          await until(() => !document.querySelector(selector), 'remoção');
        } else {
          await until(() => {
            const next = document.querySelector(selector);
            return !!next && window.rteE2e.getRteEditor(next) !== null;
          }, 'criação');
        }
      }
    }, count);

  await cycle(10); // aquecimento
  // O DOM da primeira criação (hidratação, chunks ainda chegando) pode diferir
  // do estável em poucos nós: a referência é o estado depois do aquecimento.
  const steady = await settled();
  const base = await measure();
  await cycle(40);
  expect(await settled()).toEqual(steady);
  const at50 = await measure();
  await cycle(50);
  const final = await settled();
  const at100 = await measure();

  expect(final).toEqual(steady);
  test.info().annotations.push({
    type: 'N46',
    description: `${browserName}: DOM inicial ${JSON.stringify(initial)}, estável ${JSON.stringify(steady)}`,
  });

  if (cdp && base && at50 && at100) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(2);
    const description = `${browserName}: heap ${mb(base.heap)} → ${mb(at50.heap)} → ${mb(at100.heap)} MB (aquecimento, 50, 100; Δ50→100 ${mb(at100.heap - at50.heap)} MB); ouvintes ${base.listeners} → ${at50.listeners} → ${at100.listeners}`;
    test.info().annotations.push({ type: 'N46', description });
    console.log(`N46 ${description}`);
    expect(at100.listeners).toBeLessThanOrEqual(base.listeners * 1.05);
    expect(at100.heap - at50.heap).toBeLessThanOrEqual(1024 * 1024);
    // Só o editor atual está vivo; escondido, nenhum.
    expect(await page.evaluate(() => window.rteE2e.liveEditors())).toBe(1);
    await page.evaluate(() => window.rteE2e.toggle('show'));
    await expect(
      page.locator('rte-editor[data-testid="lifecycle"]'),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        return page.evaluate(() => window.rteE2e.liveEditors());
      })
      .toBe(0);
  }
});
