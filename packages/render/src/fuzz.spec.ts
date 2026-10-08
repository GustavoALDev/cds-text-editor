// Fuzz da revisão R9: custo linear de `prepareRteHtml` e `restoreContentStyles` sobre a saída do
// sanitizador, com geradores de pior caso. Semente e execuções por ambiente (`FC_SEED`, `FC_RUNS`).
import { createSanitizer } from '@cds/rte-sanitizer';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { restoreContentStyles } from './content/restore-styles';
import { prepareRteHtml } from './prepare-html';

const SEED = Number(process.env['FC_SEED'] ?? 20261008);
const PERF_RUNS = Math.min(Number(process.env['FC_RUNS'] ?? 2000), 6);
const FLOOR_MS = 4;
/** Linear ≈ 2, quadrático ≈ 4: o limite fica no meio, folgado para runners ruidosos. */
const MAX_RATIO = 3.2;

function cost(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function median(run: () => unknown, reps = 5): number {
  const xs: number[] = [];
  for (let i = 0; i < reps; i++) xs.push(cost(run));
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
}

/** Tamanho da entrada de N: 2N cabe no `maxInputLength` do sanitizador (1 000 000). */
const TARGET_LENGTH = 450_000;
/** O jsdom escreve `cssText` devagar: `restoreContentStyles` mede um documento menor. */
const RESTORE_TARGET_LENGTH = 60_000;

/**
 * custo(2N)/custo(N) pela mediana; até 3 medidas, fica com a menor (o ruído só infla; uma
 * regressão quadrática infla todas).
 */
function doublingRatio(
  prepare: (html: string) => () => unknown,
  gen: (n: number) => string,
  target = TARGET_LENGTH,
): number {
  const n = Math.max(1, Math.floor((target * 100) / gen(100).length));
  const small = prepare(gen(n));
  const large = prepare(gen(2 * n));
  large(); // aquece o JIT
  const measure = (): number =>
    median(large) / Math.max(median(small), FLOOR_MS);
  // Até 3 medidas: o ruído (GC, núcleos disputados) só infla; uma regressão quadrática infla todas.
  let best = measure();
  for (let i = 0; i < 2 && best > MAX_RATIO; i++)
    best = Math.min(best, measure());
  return best;
}

const CELL = '<tbody><tr><td><p>x</p></td></tr></tbody>';

const GENERATORS: Record<
  string,
  { arbitrary: fc.Arbitrary<(n: number) => string> }
> = {
  'tabelas com caption e sem colgroup': {
    arbitrary: fc
      .constantFrom(
        '<table><caption></caption></table>',
        `<table><caption>c</caption>${CELL}</table>`,
        `<table><caption><strong>c</strong></caption>${CELL}</table>`,
      )
      .map((unit) => (n) => unit.repeat(n)),
  },
  'tabelas com colgroup de larguras': {
    arbitrary: fc
      .constantFrom(
        `<table><colgroup><col style="width: 10px"><col></colgroup>${CELL}</table>`,
        `<table><caption>c</caption><colgroup><col style="width: 10px"></colgroup>${CELL}</table>`,
        `<table><colgroup><col><col></colgroup>${CELL}</table>`,
      )
      .map((unit) => (n) => unit.repeat(n)),
  },
  'tabelas aninhadas': {
    arbitrary: fc
      .integer({ min: 20, max: 60 })
      .map(
        (d) => (n) =>
          (
            '<table><tbody><tr><td>'.repeat(d) +
            'x' +
            '</td></tr></tbody></table>'.repeat(d)
          ).repeat(Math.ceil(n / d)),
      ),
  },
  'âncoras de fragmento': {
    arbitrary: fc
      .constantFrom('#a', '#rt-intro', '#x&amp;y')
      .map((href) => (n) => `<p><a href="${href}">t</a></p>`.repeat(n)),
  },
  'elementos com style': {
    arbitrary: fc
      .constantFrom(
        '<p style="text-align: center">x</p>',
        '<h2 style="text-align: right">x</h2>',
        '<p><span style="color: red">x</span></p>',
      )
      .map((unit) => (n) => unit.repeat(n)),
  },
};

describe('fuzz (1): custo linear da exibição', () => {
  const sanitize = createSanitizer();
  for (const [name, { arbitrary }] of Object.entries(GENERATORS)) {
    it(`prepareRteHtml, ${name}: custo(2N)/custo(N) ≤ 3,2`, () => {
      fc.assert(
        fc.property(arbitrary, (gen) => {
          const ratio = doublingRatio((html) => {
            const canonical = sanitize(html);
            return () =>
              prepareRteHtml(canonical, { fragmentBase: '/blog/post' });
          }, gen);
          expect(ratio).toBeLessThanOrEqual(MAX_RATIO);
        }),
        { seed: SEED, numRuns: PERF_RUNS },
      );
    });

    it(`restoreContentStyles, ${name}: custo(2N)/custo(N) ≤ 3,2`, () => {
      fc.assert(
        fc.property(arbitrary, (gen) => {
          const ratio = doublingRatio(
            (html) => {
              const canonical = prepareRteHtml(sanitize(html), {
                fragmentBase: null,
              });
              const root = document.createElement('div');
              root.innerHTML = canonical;
              return () => restoreContentStyles(root, canonical);
            },
            gen,
            RESTORE_TARGET_LENGTH,
          );
          expect(ratio).toBeLessThanOrEqual(MAX_RATIO);
        }),
        { seed: SEED, numRuns: Math.min(PERF_RUNS, 2) },
      );
    });
  }
});
