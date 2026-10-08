import { expect, test } from '@playwright/test';
import { ORIGIN, watch } from './helpers';

// J6 (spec 07b, W12): `[rteContent]` exibe o HTML do editor sanitizado, o `<script>` colado some
// e o `rte-toc` lista os títulos.

test('J6: exibição sanitizada, script some e sumário', async ({ page }) => {
  const problems = await watch(page);
  await page.goto(`${ORIGIN}/render`);
  await expect(page.locator('.ProseMirror').first()).toBeVisible({
    timeout: 30_000,
  });
  const view = page.getByTestId('render-view');
  const raw = page.getByTestId('render-raw-view');

  // O que se digita no editor aparece na exibição.
  await page.locator('.ProseMirror').first().click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' novidade-e2e');
  await expect(view).toContainText('novidade-e2e');

  // HTML bruto: o <script> e os on* somem; o texto seguro fica.
  await page
    .locator('#render-raw')
    .fill(
      '<h2>Titulo raw</h2><p onclick="window.__pwned=1">seguro</p><script>window.__pwned=1</script>',
    );
  await expect(raw).toContainText('seguro');
  await expect(raw.locator('script')).toHaveCount(0);
  expect(await raw.innerHTML()).not.toMatch(/onclick|<script/i);
  expect(
    await page.evaluate(
      () => (window as unknown as { __pwned?: number }).__pwned,
    ),
  ).toBeUndefined();

  // Sumário a partir dos títulos da exibição.
  const toc = page.locator('rte-toc');
  await expect(toc).toBeVisible();
  await expect(toc.getByRole('link').first()).toBeVisible();
  expect(problems.messages).toEqual([]);
});
