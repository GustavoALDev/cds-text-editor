import { expect, test } from '@playwright/test';
import { expectShot } from '../../../../e2e/visual/helpers/shot';

// O5: playground do tema do demo em 2 estados (padrão e `ocean` escuro). Captura só a prévia do editor
// (a página inteira ficava em ~287/274 KB, perto do teto de 300 KB por arquivo) com o demo servido pelo
// `serve.mjs` (CSP estrita, sem rede).

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto('/theme');
  await expect(
    page.locator('[data-testid="preview-editor"] .ProseMirror'),
  ).toBeVisible({ timeout: 30_000 });
});

const playground = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="preview-editor"]');

test('playground do tema: padrão', async ({ page }) => {
  await expectShot(playground(page), 'theme-playground-default');
});

test('playground do tema: ocean escuro', async ({ page }) => {
  await page.getByTestId('preset-ocean').click();
  await page.getByTestId('mode').selectOption('dark');
  await expectShot(playground(page), 'theme-playground-ocean-dark', {
    ready: () =>
      page
        .locator('[data-testid="preview-editor"]')
        .evaluate((el) => el.getAttribute('data-rte-mode') === 'dark'),
  });
});
