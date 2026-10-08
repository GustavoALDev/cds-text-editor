import { expect, test } from '@playwright/test';
import fc from 'fast-check';
import { checkRteTheme } from '../../packages/theme/src/check-theme';
import { parseColor } from '../../packages/theme/src/color/parse';
import { createRteTheme } from '../../packages/theme/src/create-theme';
import {
  anySeed,
  garbage,
  mode,
  mutatedColor,
  neutral,
  srgbSeed,
  hexColor,
  hslFn,
  oklchAny,
  rgbFn,
} from '../../packages/theme/src/testing/arbitraries';
import { deltaE } from './helpers/delta-e';
import { LIMITS, groupOf, withinQuantStep, type Group } from './helpers/limits';
import {
  loadThemePage,
  readSupport,
  readTokensBoth,
  type BothCase,
} from './helpers/page';

/*
 * Propriedades do tema nos 3 motores (fast-check no processo do Playwright; cada caso é avaliado
 * na página). `FC_SEED` (padrão fixo) e `FC_RUNS` (padrão 200) mudam a semente e o número de
 * execuções; a falha imprime a semente e o caso mínimo.
 */
const SEED = Number(process.env['FC_SEED'] ?? 20261002);
const RUNS = Number(process.env['FC_RUNS'] ?? 200);
const opts = { numRuns: RUNS, seed: SEED, verbose: 1 } as const;

const TIMEOUT = Math.max(300_000, RUNS * 1_500);
const RATIO_REL_TOL = 1e-9;
type Trio = [string, string, string];
const trio = fc.tuple(anySeed, anySeed, anySeed);

test.describe(`propriedades do tema (FC_SEED=${SEED}, FC_RUNS=${RUNS})`, () => {
  test.beforeEach(async ({ page }) => {
    await loadThemePage(page);
  });

  test('(a) createRteTheme na página é igual ao do Node, chave a chave', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUT);
    await fc.assert(
      fc.asyncProperty(trio, mode, neutral, async (seeds, m, n) => {
        const opt = {
          primary: seeds[0],
          secondary: seeds[1],
          tertiary: seeds[2],
          mode: m,
          neutral: n,
        };
        const node = createRteTheme(opt);
        const browser = await page.evaluate(
          (o) => window.RteTheme.createRteTheme(o),
          opt,
        );
        expect(browser).toEqual(node);
      }),
      opts,
    );
  });

  test('(b) tokens do theme.css (cores relativas) ≈ plano B, dentro dos limites', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUT);
    const support = await readSupport(page);
    test.skip(!support.relativeColors, 'no-native: sem cores relativas');
    const srgbTrio = fc.tuple(srgbSeed, srgbSeed, srgbSeed);
    await fc.assert(
      fc.asyncProperty(srgbTrio, mode, neutral, async (seeds, m, n) => {
        const c: BothCase = { seeds: seeds as Trio, mode: m, neutral: n };
        const [e] = await readTokensBoth(page, [c]);
        for (const [token, nat] of Object.entries(e!.native)) {
          const g: Group | null = groupOf(token);
          if (!g) continue;
          const planB = e!.planB[token]!;
          const label = `${token} ${g} native=${nat} planB=${planB}`;
          // Passa no ΔE do grupo OU a no máximo 1 unidade de 8 bits por canal (empate de
          // arredondamento do canvas perto do preto, onde 1 unidade vale ΔE ~0,012).
          if (withinQuantStep(nat, planB)) continue;
          expect(deltaE(nat, planB), label).toBeLessThanOrEqual(LIMITS[g]);
        }
      }),
      opts,
    );
  });

  test('(c) parseColor(x) !== null ⇔ CSS.supports("color", x)', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUT);
    expect(typeof document).toBe('undefined'); // Node: só o caminho puro
    const grammar = fc.oneof(hexColor, rgbFn, hslFn, oklchAny, mutatedColor);
    await fc.assert(
      fc.asyncProperty(grammar, async (s) => {
        const css = await page.evaluate((x) => CSS.supports('color', x), s);
        expect(
          parseColor(s) !== null,
          `${JSON.stringify(s)} CSS.supports=${css}`,
        ).toBe(css);
      }),
      opts,
    );
    // Lixo qualquer: direção segura (o puro aceita => o CSS aceita).
    await fc.assert(
      fc.asyncProperty(garbage, async (s) => {
        if (parseColor(s) === null) return;
        const css = await page.evaluate((x) => CSS.supports('color', x), s);
        expect(css, JSON.stringify(s)).toBe(true);
      }),
      opts,
    );
  });

  test('(d) checkRteTheme na página é igual ao do Node (mesmas reprovações)', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUT);
    const maybe = fc.oneof(anySeed, garbage);
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(maybe, maybe, maybe),
        mode,
        async (seeds, m) => {
          const opt = {
            primary: seeds[0],
            secondary: seeds[1],
            tertiary: seeds[2],
            mode: m,
          };
          // Fora da gramática pura o navegador cai no canvas e pode aceitar o que o Node recusa
          // (ex.: `rgb(-1e309, 5, 5)`: CSS válido, saturado): é o caminho de (c), não de (d).
          const { canvasOnly, browser } = await page.evaluate(
            (o) => ({
              canvasOnly: [o.primary, o.secondary, o.tertiary].map((x) =>
                CSS.supports('color', x),
              ),
              browser: window.RteTheme.checkRteTheme(o),
            }),
            opt,
          );
          fc.pre(
            seeds.every((x, i) => parseColor(x) !== null || !canvasOnly[i]),
          );
          const node = checkRteTheme(opt);
          const want = JSON.parse(JSON.stringify(node)) as typeof browser;
          // Reprovações idênticas (ids, pass, ok, invalid); a razão de contraste admite 1e-9
          // relativo: Math.pow/cbrt diferem em 1 ulp (~1e-16) entre o Node e o motor da página.
          expect(browser.ok).toBe(want.ok);
          expect(browser.invalid).toEqual(want.invalid);
          expect(browser.checks.map(({ ratio, ...rest }) => rest)).toEqual(
            want.checks.map(({ ratio, ...rest }) => rest),
          );
          // Um único `expect` (cada `expect` do Playwright vira um passo do relatório: 72 por caso
          // deixavam o caso 10x mais lento).
          const worst = browser.checks.reduce(
            (acc, c, i) => {
              const w = want.checks[i]!.ratio;
              const rel = Math.abs(c.ratio - w) / Math.max(1, Math.abs(w));
              return rel > acc.rel ? { rel, id: c.id } : acc;
            },
            { rel: 0, id: '' },
          );
          expect(worst.rel, worst.id).toBeLessThanOrEqual(RATIO_REL_TOL);
        },
      ),
      opts,
    );
  });
});
