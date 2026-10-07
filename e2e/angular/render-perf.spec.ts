// Spec 06, §6.2 L7 (R13, R14): desempenho da exibição e ticks ao redimensionar.
// R14 (informativo): documento de prosa com >= 20 000 palavras e >= 400 000 caracteres
// (parágrafos, títulos, listas e tabelas repetidos, mais os embeds do fixture uma vez;
// montado no Node) em `setRenderInput` (sanitizar, transformar, inserir; o `tick` é
// síncrono) mais um `getBoundingClientRect()` do host (força o leiaute): 3 aquecimentos e
// 11 medições; mediana, p95 e as 11 amostras vão para a anotação `R14` e o console, e só
// `mediana < 5000 ms` é conferida (com n = 11 o p95 é o máximo). R13 (build zone.js): as
// voltas da zona (`zoneTurns`, cada uma um `tick`) não mudam em 10 redimensionamentos da
// janela em que o rolador da tabela larga alterna o transbordo (os atributos mudam,
// nenhum tick), nem com `Home`/`End` no rolador.
import { expect, test } from '@playwright/test';
import { readFixture } from './helpers/app';
import { blockThirdParty, gotoRender, renderHost } from './helpers/render';

const WARMUPS = 3;
const RUNS = 11;
const MIN_CHARS = 400_000;
const MIN_WORDS = 20_000;

const countWords = (html: string): number =>
  html
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

/** Bloco de prosa n: título, 3 parágrafos, lista e tabela (~300 palavras). */
function proseBlock(n: number): string {
  const sentence = (k: number) =>
    `Texto ${n}.${k} com <strong>destaque</strong>, <em>ênfase</em> e um <a href="https://example.com/artigo/${n}/${k}">link de referência</a> no meio da frase longa de exemplo`;
  const paragraph = (k: number) =>
    `<p>${sentence(k)} para o leiaute, seguido de mais palavras comuns que completam o parágrafo de ${n} e ${k} como em qualquer artigo de blog.</p>`;
  const items = Array.from(
    { length: 5 },
    (_, i) =>
      `<li><p>item ${i} da lista ${n} com oito palavras no total</p></li>`,
  ).join('');
  const rows = Array.from(
    { length: 6 },
    (_, r) =>
      `<tr>${Array.from({ length: 4 }, (_, c) => `<td><p>célula ${r} ${c} de ${n}</p></td>`).join('')}</tr>`,
  ).join('');
  return `<h2>Seção ${n} do documento longo</h2>${[1, 2, 3].map(paragraph).join('')}<ul>${items}</ul><table><tbody>${rows}</tbody></table>`;
}

/** Mediana e p95 (método do posto mais próximo), em ms. */
function summarize(times: readonly number[]): { median: number; p95: number } {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (index: number) => sorted[index] ?? Number.NaN;
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0 ? (at(mid - 1) + at(mid)) / 2 : at(mid);
  return { median, p95: at(Math.ceil(0.95 * sorted.length) - 1) };
}

test.describe('L7 desempenho e ticks', () => {
  test.beforeEach(async ({ context }) => {
    await blockThirdParty(context);
  });

  test('R14: exibir 20 mil palavras (informativo)', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    const parts = [readFixture('all-features.html')];
    let words = countWords(parts[0] ?? '');
    let chars = parts[0]?.length ?? 0;
    for (let n = 1; words < MIN_WORDS || chars < MIN_CHARS; n++) {
      const block = proseBlock(n);
      parts.push(block);
      words += countWords(block);
      chars += block.length;
    }
    const bigHtml = parts.join('');
    expect(words).toBeGreaterThanOrEqual(MIN_WORDS);
    expect(bigHtml.length).toBeGreaterThanOrEqual(MIN_CHARS);

    await gotoRender(page, '/render');
    const times = await page.evaluate(
      ({ html, warmups, runs }) => {
        const host = document.querySelector('[data-testid="render-input"]');
        if (!host) throw new Error('sem render-input');
        const result: number[] = [];
        for (let i = 0; i < warmups + runs; i++) {
          // Esvazia antes de cada volta para que a entrada seja sempre uma mudança
          // (essa troca para '' não é cronometrada).
          window.rteE2e.setRenderInput('');
          const start = performance.now();
          window.rteE2e.setRenderInput(html);
          host.getBoundingClientRect();
          const elapsed = performance.now() - start;
          if (i >= warmups) result.push(elapsed);
        }
        return result;
      },
      { html: bigHtml, warmups: WARMUPS, runs: RUNS },
    );
    expect(times).toHaveLength(RUNS);
    const rendered = await page.evaluate(
      () => window.rteE2e.renderedHtml('render-input').length,
    );
    expect(rendered).toBeGreaterThan(MIN_CHARS / 2);
    expect(
      await page.evaluate(() => window.rteE2e.renderError('render-input')),
    ).toBeFalsy();
    const { median, p95 } = summarize(times);
    const description = `${browserName}: mediana ${median.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (${RUNS} medições, ${WARMUPS} aquecimentos, ${bigHtml.length} caracteres, ${words} palavras, ${rendered} caracteres exibidos; p95 com n=${RUNS} é o máximo; amostras ${times.map((t) => t.toFixed(0)).join(', ')})`;
    test.info().annotations.push({ type: 'R14', description });
    console.log(`R14 ${description}`);
    expect(median).toBeLessThan(5000);
  });

  test('R13: redimensionar e Home/End no rolador não causam tick (build zone.js)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 400, height: 800 });
    await gotoRender(page, '/render', { zone: true });
    const scroller = renderHost(page, 'render-wide').locator(
      '.rte-table-scroll',
    );
    await expect(scroller).toHaveAttribute('tabindex', '0');
    // Zona no build zone.js: o contador existe e anda quando a zona gira.
    const idle = () => page.evaluate(() => window.rteE2e.zoneTurns());
    const untilIdle = () =>
      expect
        .poll(async () => {
          const before = await idle();
          await page.waitForTimeout(150);
          return (await idle()) === before;
        })
        .toBe(true);
    await untilIdle();
    const control = await idle();
    await page.evaluate(() => window.rteE2e.setLang('pt-BR'));
    await expect.poll(idle).toBeGreaterThan(control);
    await expect(scroller).toHaveAttribute(
      'aria-label',
      'Tabela com rolagem horizontal',
    );
    await untilIdle();

    const before = await idle();
    let withAttr = 0;
    let withoutAttr = 0;
    for (let i = 0; i < 10; i++) {
      const narrow = i % 2 === 1;
      await page.setViewportSize({ width: narrow ? 400 : 1600, height: 800 });
      // O atributo acompanha o transbordo (mudou sem tick).
      await expect
        .poll(() => scroller.evaluate((el) => el.hasAttribute('tabindex')))
        .toBe(narrow);
      if (narrow) withAttr++;
      else withoutAttr++;
    }
    expect(withAttr).toBe(5);
    expect(withoutAttr).toBe(5);
    expect(await idle()).toBe(before);

    // Home/End no rolador focado.
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(scroller).toHaveAttribute('tabindex', '0');
    const still = await idle();
    await scroller.focus();
    await page.keyboard.press('End');
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    await page.keyboard.press('Home');
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBe(0);
    expect(await idle()).toBe(still);
    test.info().annotations.push({
      type: 'R13',
      description: `voltas da zona antes ${before}, depois ${await idle()} (10 redimensionamentos 400/1600 e Home/End)`,
    });
  });
});
