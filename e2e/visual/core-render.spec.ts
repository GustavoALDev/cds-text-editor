import { expect, test } from '@playwright/test';
import { gotoApp } from '../angular/helpers/app';
import { blockExternal, capHeight } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4: `rte-render` com o mesmo fixture do editor, claro e escuro (captura da página, não do
// editor: duas baselines, sem comparação cruzada de pixels; a equivalência estrita é a H20).

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test('página renderizada com all-features.html', async ({ page }) => {
      await blockExternal(page);
      await gotoApp(page, '/render');
      const main = page.locator('[data-testid="render-main"]');
      await expect(main.locator('h2').first()).toBeVisible();
      await capHeight(main);
      await expectShot(main, `render-all-features-${scheme}`);
    });
  });
}
