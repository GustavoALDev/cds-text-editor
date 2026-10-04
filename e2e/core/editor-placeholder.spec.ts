// E8 (spec 03c, §6.3): o placeholder do documento vazio aparece pelo
// `::before` computado do motor e no `aria-placeholder` do elemento editável;
// digitar remove, apagar tudo devolve; título vazio de caixa mostra o rótulo;
// nada disso chega ao HTML (C19).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

const before = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`${selector} ausente`);
    return getComputedStyle(element, '::before').content;
  }, selector);

const html = (page: Page) =>
  page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor));

test('E8: placeholder do documento vazio some ao digitar e volta ao apagar tudo', async ({
  page,
}) => {
  await loadEditorPage(page, { editor: "{ placeholder: 'Escreva aqui' }" });
  const editable = page.locator('#editor .ProseMirror');
  const paragraph = '#editor .ProseMirror > p';

  expect(await before(page, paragraph)).toBe('"Escreva aqui"');
  await expect(editable).toHaveAttribute('aria-placeholder', 'Escreva aqui');
  await expect(page.locator(paragraph)).toHaveClass(
    'rte-placeholder rte-placeholder--doc',
  );

  await editable.click();
  await expect(editable).toBeFocused();
  await page.keyboard.type('a');
  expect(await html(page)).toBe('<p>a</p>');
  expect(await before(page, paragraph)).toBe('none');
  await expect(editable).not.toHaveAttribute('aria-placeholder');
  await expect(page.locator('#editor .rte-placeholder')).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<p></p>');
  expect(await before(page, paragraph)).toBe('"Escreva aqui"');
  await expect(editable).toHaveAttribute('aria-placeholder', 'Escreva aqui');

  // Sem vazamento (C19) com o placeholder visível.
  const raw = await page.evaluate(() => window.editor.getHTML());
  for (const output of [await html(page), raw]) {
    expect(output).not.toContain('rte-');
    expect(output).not.toContain('placeholder');
  }
});

test('E8: título vazio de caixa mostra o rótulo e não vaza', async ({
  page,
}) => {
  await loadEditorPage(page, {
    content:
      '<aside class="rt-callout rt-callout--warning"><p class="rt-callout__title"></p><p>corpo</p></aside>',
    editor: "{ placeholder: 'Escreva aqui' }",
  });
  const title = '#editor p.rt-callout__title';
  expect(await before(page, title)).toBe('"Warning"');
  await expect(page.locator(title)).toHaveClass(/\brte-placeholder\b/);
  await expect(page.locator('#editor .ProseMirror')).not.toHaveAttribute(
    'aria-placeholder',
  );
  const output = await html(page);
  expect(output).not.toContain('rte-');
  expect(output).not.toContain('data-placeholder');
  const raw = await page.evaluate(() => window.editor.getHTML());
  expect(raw).not.toContain('rte-');
  expect(raw).not.toContain('data-placeholder');
});
