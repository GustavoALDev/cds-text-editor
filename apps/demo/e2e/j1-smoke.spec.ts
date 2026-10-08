import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ORIGIN, ORIGIN_NO_CSP_HEADER, ROUTES, watch } from './helpers';

// J1 (spec 07b, W12): todas as rotas abrem sem erro de console, sem violação de CSP, sem
// requisição fora da origem e sem violação séria ou crítica do axe. Duas voltas: com o cabeçalho
// de CSP e com `--no-csp-header` (vale só a `<meta>` do index.html). O HTML pré-renderizado é
// lido do disco: sem `style=` nem `<style>` (W4).

const consumer = process.env['RTE_CONSUMER_DIR'];
const BROWSER = consumer ? resolve(consumer, 'dist', 'demo', 'browser') : null;

for (const [label, origin] of [
  ['cabeçalho e <meta>', ORIGIN],
  ['só a <meta> (--no-csp-header)', ORIGIN_NO_CSP_HEADER],
] as const) {
  test.describe(`J1 (${label})`, () => {
    for (const route of ROUTES) {
      test(`${route}: sem erros, sem CSP, sem requisição externa, axe limpo`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        const problems = await watch(page);
        await page.goto(`${origin}${route}`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1')).toBeVisible();
        if (route !== '/') {
          await expect(page.locator('.ProseMirror').first()).toBeVisible({
            timeout: 30_000,
          });
        }
        expect(problems.messages).toEqual([]);
        expect([...problems.origins]).toEqual([origin]);

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

test.describe('J1: HTML pré-renderizado', () => {
  test.skip(!BROWSER, 'RTE_CONSUMER_DIR não definido');

  for (const route of ROUTES) {
    test(`${route}: sem style= nem <style> no disco`, () => {
      const file = join(
        BROWSER ?? '',
        route === '/' ? '' : route,
        'index.html',
      );
      expect(existsSync(file), file).toBe(true);
      const html = readFileSync(file, 'utf8');
      expect(html).not.toMatch(/\sstyle\s*=/i);
      expect(html).not.toMatch(/<style[\s>]/i);
    });
  }
});
