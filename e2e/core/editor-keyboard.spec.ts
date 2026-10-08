// Sem armadilha de teclado nas tabelas (spec 03b, §6; WCAG 2.1.2): com o
// teclado real, `Tab` percorre as células e, na última, leva o foco para fora
// do editor sem criar linha; `Shift+Tab` na primeira célula sai para trás.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

test.describe('compat: core/editor-keyboard', { tag: '@compat' }, () => {
  const TABLE =
    '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>';

  const html = (page: Page) =>
    page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor));

  /** Campos de texto antes e depois do editor (tabuláveis nos 3 motores). */
  async function addFieldsAround(page: Page): Promise<void> {
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      if (!editor) throw new Error('#editor ausente');
      const before = document.createElement('input');
      before.id = 'before';
      before.setAttribute('aria-label', 'antes');
      const after = document.createElement('input');
      after.id = 'after';
      after.setAttribute('aria-label', 'depois');
      editor.before(before);
      editor.after(after);
    });
  }

  /** Foca o editor com o cursor no fim do texto `text`. */
  async function caret(page: Page, text: string): Promise<void> {
    await page.evaluate((text) => {
      const { editor } = window;
      let target = -1;
      editor.state.doc.descendants((node, pos) => {
        if (target < 0 && node.isText && node.text === text)
          target = pos + text.length;
        return target < 0;
      });
      if (target < 0) throw new Error(`texto "${text}" não encontrado`);
      editor.commands.focus(target);
    }, text);
    // O `focus` do Tiptap é assíncrono (lição 17): foca num quadro seguinte. Com
    // o editor já focado, o `toBeFocused` passa antes desse quadro e um `Tab`
    // logo depois seria desfeito por ele; espera o quadro.
    await expect(page.locator('#editor .ProseMirror')).toBeFocused();
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  }

  const cellText = (page: Page) =>
    page.evaluate(() => window.editor.state.selection.$from.parent.textContent);

  test('Tab percorre as células e, na última, sai do editor sem criar linha', async ({
    page,
  }) => {
    await loadEditorPage(page, { content: TABLE });
    await addFieldsAround(page);
    await caret(page, 'a');
    await page.keyboard.press('Tab');
    await expect(page.locator('#editor .ProseMirror')).toBeFocused();
    expect(await cellText(page)).toBe('b');
    await caret(page, 'd');
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
    expect(await html(page)).toBe(TABLE);
  });

  test('Shift+Tab na primeira célula sai do editor para trás', async ({
    page,
  }) => {
    await loadEditorPage(page, { content: TABLE });
    await addFieldsAround(page);
    await caret(page, 'c');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#editor .ProseMirror')).toBeFocused();
    expect(await cellText(page)).toBe('b');
    await caret(page, 'a');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#before')).toBeFocused();
    expect(await html(page)).toBe(TABLE);
  });
});
