// E6 (spec 03b, §7.6, lição 10): autolink ao digitar cria link `https` sem
// `target`; os ids de título já estão na saída logo após criar o editor.
import { expect, test } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

test('E6: digitar "site.com " cria link https sem target', async ({ page }) => {
  await loadEditorPage(page);
  await page.locator('#editor .ProseMirror').click();
  await page.evaluate(() => window.editor.commands.focus('end'));
  await expect(page.locator('#editor .ProseMirror')).toBeFocused();
  await page.keyboard.type('site.com ');
  expect(
    await page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor)),
  ).toBe('<p><a href="https://site.com/">site.com</a> </p>');
});

test('E6: ids de título na carga inicial', async ({ page }) => {
  await loadEditorPage(page, { content: '<h2>A</h2><h2>A</h2>' });
  expect(
    await page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor)),
  ).toBe('<h2 id="rt-a">A</h2><h2 id="rt-a-2">A</h2>');
});
