import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  API_ROUTES,
  BROWSER,
  GUIDE_ROUTES,
  ORIGIN,
  ORIGIN_NO_CSP_HEADER,
  ROUTES,
  ready,
  url,
  watch,
} from './helpers';

// I1 (spec 07c): todas as rotas (nav.json + API) abrem sem erro de console, sem violação de CSP,
// sem requisição fora da origem e sem violação séria ou crítica do axe, nos dois esquemas de
// cor. Duas voltas: com o cabeçalho de CSP e com `--no-csp-header` (vale só a `<meta>`). O HTML
// pré-renderizado é lido do disco: sem `style=` nem `<style>`.

test.describe('I1: o conjunto de rotas', () => {
  test('o guia tem as 3 páginas e a API tem uma página por entry', () => {
    expect(GUIDE_ROUTES).toEqual([
      'guia/inicio-rapido',
      'guia/instalacao',
      'guia/configuracao',
    ]);
    expect(API_ROUTES.length).toBeGreaterThanOrEqual(15);
  });
});

for (const [label, origin] of [
  ['cabeçalho e <meta>', ORIGIN],
  ['só a <meta> (--no-csp-header)', ORIGIN_NO_CSP_HEADER],
] as const) {
  test.describe(`I1 (${label})`, () => {
    for (const route of ROUTES) {
      test(`${route}: sem erros, sem CSP, sem requisição externa, axe limpo`, async ({
        page,
      }) => {
        // A página de API do angular é grande: o axe leva mais tempo.
        test.setTimeout(route.startsWith('api/') ? 240_000 : 90_000);
        const problems = await watch(page);
        await page.goto(url(origin, route));
        await ready(page);
        expect(problems.messages).toEqual([]);
        expect([...problems.origins]).toEqual([origin]);

        // O axe roda só na volta do cabeçalho, nos dois esquemas de cor.
        if (origin !== ORIGIN) return;
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          const results = await new AxeBuilder({ page }).analyze();
          const severe = results.violations
            .filter((v) => v.impact === 'serious' || v.impact === 'critical')
            .map((v) => ({
              id: v.id,
              impact: v.impact,
              targets: v.nodes.map((n) => n.target.join(' ')),
            }));
          expect(severe, `axe (${scheme})`).toEqual([]);
        }
      });
    }
  });
}

test.describe('I1: HTML pré-renderizado', () => {
  test.skip(!BROWSER, 'RTE_CONSUMER_DIR não definido');

  for (const route of ROUTES) {
    test(`${route}: sem style= nem <style> no disco`, () => {
      const file = join(BROWSER ?? '', route, 'index.html');
      expect(existsSync(file), file).toBe(true);
      const html = readFileSync(file, 'utf8');
      expect(html).not.toMatch(/\sstyle\s*=/i);
      expect(html).not.toMatch(/<style[\s>]/i);
    });
  }
});
