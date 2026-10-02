import { expect, test } from '@playwright/test';
import { evaluateChecks } from './helpers/contrast';
import {
  loadThemePage,
  probeProblems,
  readSupport,
  readTokenGrid,
} from './helpers/page';
import { srgbSeeds, thresholdSeeds, wideSeeds } from './helpers/seeds';

test('native relative-color support is present in this engine', async ({
  page,
  browser,
}) => {
  await loadThemePage(page);
  const s = await readSupport(page);
  const msg = `${browser.browserType().name()} ${browser.version()}: os 3 motores do ADR 0002 (Chromium 153, Firefox 155, WebKit 26.6) suportam cores relativas, light-dark() e @property; se uma versão futura perder suporte, atualize o ADR e a expectativa de forma explícita.`;
  expect(s.relativeColors, msg).toBe(true);
  expect(
    await page.evaluate(() => CSS.supports('color', 'light-dark(red, blue)')),
    msg,
  ).toBe(true);
  expect(
    await page.evaluate(() => typeof CSSPropertyRule !== 'undefined'),
    msg,
  ).toBe(true);
});

test('seed lists match the spike', () => {
  expect(srgbSeeds()).toHaveLength(223);
  expect(wideSeeds()).toHaveLength(148);
  expect(thresholdSeeds()).toHaveLength(12);
});

const grids = [
  ['sRGB', srgbSeeds()],
  ['wide gamut', wideSeeds()],
  ['threshold', thresholdSeeds()],
] as const;

for (const variant of ['native', 'plan B'] as const) {
  for (const [name, seeds] of grids) {
    test(`0 contrast failures on the ${name} grid (${variant})`, async ({
      page,
      browser,
    }) => {
      test.setTimeout(120_000);
      await loadThemePage(page);
      const support = await readSupport(page);
      test.info().annotations.push(
        { type: 'engine-version', description: browser.version() },
        {
          type: 'engine-native-relative-colors',
          description: String(support.relativeColors),
        },
        { type: 'engine-light-dark', description: String(support.lightDark) },
        { type: 'engine-property', description: String(support.property) },
      );
      test.skip(
        variant === 'native' && !support.relativeColors,
        'relative colors unsupported: plan B only',
      );

      const grid = await readTokenGrid(page, {
        seeds,
        forcePlanB: variant === 'plan B',
      });
      const planProblems = grid.flatMap((e) => probeProblems(e, variant));
      expect(planProblems, planProblems.slice(0, 10).join('\n')).toEqual([]);
      const failures: string[] = [];
      const mins: Record<string, number> = {};
      for (const { seed, mode, tokens } of grid) {
        for (const c of evaluateChecks(tokens)) {
          const key = c.id.split(':')[0]!;
          mins[key] = Math.min(mins[key] ?? Infinity, c.ratio);
          if (!c.ok)
            failures.push(
              `${seed} ${mode} ${c.id} ${c.ratio.toFixed(3)} < ${c.min}`,
            );
        }
      }
      const summary = Object.entries(mins)
        .map(([k, v]) => `${k}=${v.toFixed(3)}`)
        .join(' ');
      test
        .info()
        .annotations.push({ type: 'min-ratios', description: summary });
      console.log(
        `[${browser.browserType().name()} ${browser.version()}] ${variant} ${name}: ${seeds.length} seeds, ${failures.length} failures; min ${summary}`,
      );
      expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
    });
  }
}
