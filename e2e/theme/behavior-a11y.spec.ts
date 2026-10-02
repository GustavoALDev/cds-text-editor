import { expect, test } from '@playwright/test';
import { contrastRatio } from '../../packages/theme/src/color/convert';
import { loadThemePage } from './helpers/page';
import { computed, shownOne } from './helpers/behavior';

test.beforeEach(async ({ page }) => {
  await loadThemePage(page);
});

test('R8: forced-colors mapeia borda/foco/superfície/texto para cores do sistema distinguíveis', async ({
  page,
  browserName,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  // Firefox não reavalia @media de folhas já carregadas ao mudar a emulação: recarrega o conteúdo.
  await loadThemePage(page);
  const active = await page.evaluate(
    () => matchMedia('(forced-colors: active)').matches,
  );
  test.skip(
    !active,
    `${browserName}: emulateMedia({forcedColors}) não ativa (forced-colors: active) neste motor`,
  );
  // O valor bruto da variável prova o mapeamento; a cor do sistema é resolvida via canvas.
  expect(await computed(page, '--rte-border')).toBe('CanvasText');
  expect(await computed(page, '--rte-focus')).toBe('Highlight');
  expect(await computed(page, '--rte-surface')).toBe('Canvas');
  expect(await computed(page, '--rte-text')).toBe('CanvasText');
  const rgb = (css: string) =>
    page.evaluate((c) => {
      const ctx = (
        document.getElementById('cv') as HTMLCanvasElement
      ).getContext('2d', { willReadFrequently: true })!;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!] as [number, number, number];
    }, css);
  const [border, focus, surface, text] = await Promise.all(
    ['CanvasText', 'Highlight', 'Canvas', 'CanvasText'].map(rgb),
  );
  expect(border).not.toEqual(surface);
  expect(focus).not.toEqual(surface);
  expect(text).not.toEqual(surface);
  expect(contrastRatio(text!, surface!)).toBeGreaterThanOrEqual(7);
});

test('R8: prefers-contrast: more engrossa o foco e a borda tem contraste >= 3', async ({
  page,
  browserName,
}) => {
  await page.emulateMedia({ contrast: 'more' });
  // Firefox não reavalia @media de folhas já carregadas ao mudar a emulação: recarrega o conteúdo.
  await loadThemePage(page);
  const active = await page.evaluate(
    () => matchMedia('(prefers-contrast: more)').matches,
  );
  test.skip(
    !active,
    `${browserName}: emulateMedia({contrast:'more'}) não ativa (prefers-contrast: more) neste motor`,
  );
  expect(await computed(page, '--rte-focus-width')).toBe('3px');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ contrast: 'more', colorScheme: scheme });
    await loadThemePage(page);
    const border = await shownOne(page, 'border');
    const surface = await shownOne(page, 'surface');
    expect(contrastRatio(border, surface), scheme).toBeGreaterThanOrEqual(3);
  }
  // sem a preferência, volta a 2px
  await page.emulateMedia({ contrast: 'no-preference' });
  await loadThemePage(page);
  expect(await computed(page, '--rte-focus-width')).toBe('2px');
});

test('R10: custo de trocar --rte-primary (mediana ms por troca, 300 trocas)', async ({
  page,
  browserName,
}, testInfo) => {
  const { perChange, batched } = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    const seeds = ['#8514f5', '#f637e3', '#0546ff', '#1db954', '#ff8800'];
    const change = (i: number): void => {
      root.style.setProperty('--rte-primary', seeds[i % 5]!);
      getComputedStyle(root).getPropertyValue('--rte-primary-hover');
      void root.offsetHeight;
    };
    const median = (xs: number[]): number =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    for (let i = 0; i < 30; i++) change(i); // aquecimento
    // Firefox e WebKit arredondam performance.now() (até 1 ms): além da mediana por troca,
    // mede 10 lotes de 30 trocas e usa a mediana dos lotes / 30 (resolução efetiva ~0,03 ms).
    const each: number[] = [];
    const lots: number[] = [];
    for (let l = 0; l < 10; l++) {
      const lot0 = performance.now();
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now();
        change(l * 30 + i);
        each.push(performance.now() - t0);
      }
      lots.push((performance.now() - lot0) / 30);
    }
    return { perChange: median(each), batched: median(lots) };
  });
  testInfo.annotations.push({
    type: 'cost-ms',
    description: `${browserName}: mediana por lote ${batched.toFixed(4)} ms por troca (mediana individual ${perChange.toFixed(4)} ms, limitada pela resolução do relógio)`,
  });
  // 0,5 ms (R10) foi medido só no Chromium; Firefox/WebKit têm limite de 2 ms.
  const limit = browserName === 'chromium' ? 0.5 : 2;
  expect(batched, `${browserName} mediana ${batched} ms`).toBeLessThanOrEqual(
    limit,
  );
});
