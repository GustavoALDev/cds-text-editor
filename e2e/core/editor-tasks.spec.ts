// E4 (spec 03b, §6 e §7.6): o checkbox da tarefa (fora da área editável)
// alterna `checked` por clique e por `Space`, é alcançado por `Tab`, não rouba
// a seleção no `mousedown` e tem `aria-label`; `Enter`/`Backspace` nos itens
// seguem a §6. Asserções na saída canônica.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

const task = (text: string, checked = false) =>
  `<li class="rt-task"><label><input type="checkbox" disabled=""${checked ? ' checked=""' : ''}>${text}</label></li>`;
const list = (...items: string[]) =>
  `<ul class="rt-tasks">${items.join('')}</ul>`;

const html = (page: Page) =>
  page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor));

/** Foca o editor com o cursor em `offset` do primeiro bloco de texto `text`. */
async function caret(page: Page, text: string, offset: number): Promise<void> {
  await page.evaluate(
    ({ text, offset }) => {
      const { editor } = window;
      let target = -1;
      editor.state.doc.descendants((node, pos) => {
        if (target < 0 && node.isTextblock && node.textContent === text)
          target = pos + 1 + offset;
        return target < 0;
      });
      if (target < 0) throw new Error(`bloco "${text}" não encontrado`);
      editor.commands.focus(target);
    },
    { text, offset },
  );
  // O `focus` do Tiptap é assíncrono (lição 17).
  await expect(page.locator('#editor .ProseMirror')).toBeFocused();
}

test('E4: clique alterna checked sem roubar a seleção', async ({ page }) => {
  await loadEditorPage(page, { content: `${list(task('A'))}<p>fim</p>` });
  await caret(page, 'fim', 2);
  const selection = () =>
    page.evaluate(() => window.editor.state.selection.toJSON() as unknown);
  const before = await selection();
  const box = page.locator('#editor .rte-task__check input');
  await box.click();
  expect(await html(page)).toBe(`${list(task('A', true))}<p>fim</p>`);
  await expect(box).toBeChecked();
  expect(await selection()).toEqual(before);
  await expect(page.locator('#editor .ProseMirror')).toBeFocused();
  await box.click();
  expect(await html(page)).toBe(`${list(task('A'))}<p>fim</p>`);
  await expect(box).not.toBeChecked();
});

test('E4: Tab alcança o checkbox e Space o alterna', async ({ page }) => {
  // O Firefox começa a navegação por Tab no cursor (o checkbox de um item vem
  // antes do texto dele no DOM); Chromium e WebKit, no início da área
  // editável. Com o cursor num parágrafo antes da lista, os três chegam ao
  // 1º checkbox (no Firefox, com o cursor dentro de A, o Tab pula o 1º e só
  // Shift+Tab volta a ele: comportamento do motor; o checkbox segue na ordem).
  const before = '<p>antes</p>';
  await loadEditorPage(page, {
    content: before + list(task('A'), task('B', true)),
  });
  await caret(page, 'antes', 5);
  const boxes = page.locator('#editor .rte-task__check input');
  await page.keyboard.press('Tab');
  await expect(boxes.nth(0)).toBeFocused();
  await page.keyboard.press('Space');
  expect(await html(page)).toBe(
    before + list(task('A', true), task('B', true)),
  );
  await page.keyboard.press('Tab');
  await expect(boxes.nth(1)).toBeFocused();
  await page.keyboard.press('Space');
  expect(await html(page)).toBe(before + list(task('A', true), task('B')));
  await page.keyboard.press('Shift+Tab');
  await expect(boxes.nth(0)).toBeFocused();
});

test('E4: aria-label "Task: <texto>" acompanha o texto', async ({ page }) => {
  await loadEditorPage(page, { content: list(task('A'), task('')) });
  const boxes = page.locator('#editor .rte-task__check input');
  await expect(boxes.nth(0)).toHaveAttribute('aria-label', 'Task: A');
  await expect(boxes.nth(1)).toHaveAttribute('aria-label', 'Task: ');
  await caret(page, 'A', 1);
  await page.keyboard.type('B');
  await expect(boxes.nth(0)).toHaveAttribute('aria-label', 'Task: AB');
});

test('E4: Enter no fim cria tarefa desmarcada; Enter no vazio sai da lista', async ({
  page,
}) => {
  await loadEditorPage(page, { content: list(task('A', true)) });
  await caret(page, 'A', 1);
  await page.keyboard.press('Enter');
  await page.keyboard.type('B');
  expect(await html(page)).toBe(list(task('A', true), task('B')));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('C');
  expect(await html(page)).toBe(`${list(task('A', true), task('B'))}<p>C</p>`);
});

test('E4: Enter no início de tarefa marcada a mantém marcada', async ({
  page,
}) => {
  await loadEditorPage(page, { content: list(task('A', true)) });
  await caret(page, 'A', 0);
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe(list(task(''), task('A', true)));
  await page.keyboard.type('x');
  expect(await html(page)).toBe(list(task(''), task('xA', true)));
});

test('E4: Backspace no início vira parágrafo e divide a lista', async ({
  page,
}) => {
  await loadEditorPage(page, {
    content: list(task('A'), task('B', true), task('C')),
  });
  await caret(page, 'B', 0);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe(`${list(task('A'))}<p>B</p>${list(task('C'))}`);
});
