// E9 (spec 03c, §6.3, C6): com o teclado real, a digitação além do limite não
// muda o texto (nem no modelo nem no DOM) e incrementa `rejected`; apagar
// funciona; a colagem é cortada no maior prefixo; `setContent` acima do limite
// fica `overLimit`; a composição IME (CDP, só Chromium) nunca é recusada.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

const html = (page: Page) =>
  page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor));

const limitState = (page: Page) =>
  page.evaluate(() => {
    const { characters, limit, remaining, overLimit, rejected } =
      window.RteEditorLab.getCharLimitState(window.editor);
    return { characters, limit, remaining, overLimit, rejected };
  });

/** Texto do parágrafo como o motor o mostra (não o modelo). */
const paragraphText = (page: Page) =>
  page.locator('#editor .ProseMirror > p').first().textContent();

async function focusEnd(page: Page): Promise<void> {
  await page.evaluate(() => window.editor.commands.focus('end'));
  // O `focus` do Tiptap é assíncrono (lição 17).
  await expect(page.locator('#editor .ProseMirror')).toBeFocused();
}

test('E9: digitação além do limite é recusada e Backspace apaga', async ({
  page,
}) => {
  await loadEditorPage(page, {
    content: '<p>abcd</p>',
    editor: '{ charLimit: 5 }',
  });
  await focusEnd(page);
  await page.keyboard.type('xyz');
  expect(await html(page)).toBe('<p>abcdx</p>');
  // A tecla recusada não fica visível no DOM (o `DOMObserver` redesenha).
  await expect.poll(() => paragraphText(page)).toBe('abcdx');
  expect(await limitState(page)).toEqual({
    characters: 5,
    limit: 5,
    remaining: 0,
    overLimit: false,
    rejected: 2,
  });

  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<p>abcd</p>');
  expect(await paragraphText(page)).toBe('abcd');
  expect((await limitState(page)).rejected).toBe(2);
});

test('E9: colagem cortada no maior prefixo e setContent acima fica overLimit', async ({
  page,
}) => {
  await loadEditorPage(page, {
    content: '<p>abcdx</p>',
    editor: '{ charLimit: 10 }',
  });
  await focusEnd(page);
  await page.evaluate(() => window.editor.view.pasteHTML('<p>123456</p>'));
  expect(await html(page)).toBe('<p>abcdx12345</p>');
  expect(await limitState(page)).toMatchObject({
    characters: 10,
    overLimit: false,
    rejected: 1,
  });

  await page.evaluate(() =>
    window.editor.commands.setContent('<p>abcdefghijkl</p>'),
  );
  expect(await html(page)).toBe('<p>abcdefghijkl</p>');
  expect(await limitState(page)).toEqual({
    characters: 12,
    limit: 10,
    remaining: -2,
    overLimit: true,
    rejected: 1,
  });
});

test('E9: composição IME no limite não é recusada', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'IME por CDP só no Chromium (spec 03c, E9)',
  );
  await loadEditorPage(page, {
    content: '<p>abcde</p>',
    editor: '{ charLimit: 5 }',
  });
  await focusEnd(page);
  const { rejected } = await limitState(page);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.imeSetComposition', {
    text: 'あ',
    selectionStart: 1,
    selectionEnd: 1,
  });
  await client.send('Input.insertText', { text: 'あ' });
  await expect
    .poll(() => page.evaluate(() => window.editor.state.doc.textContent))
    .toContain('あ');
  expect(await html(page)).toBe('<p>abcdeあ</p>');
  expect(await paragraphText(page)).toBe('abcdeあ');
  expect(await limitState(page)).toMatchObject({
    characters: 6,
    overLimit: true,
    rejected,
  });
});
