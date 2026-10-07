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
