// E11 (spec 03c, §6.3, C13–C16): o menu `/` com o teclado real (caminho de
// `beforeinput`/`DOMObserver` de cada motor): abre no início do bloco e depois
// de espaço (inclusive U+00A0), não depois de letra nem em bloco de código;
// filtra, executa com `ArrowDown`/`Enter` em um passo de desfazer, fecha com
// `Escape` sem reabrir e com `Backspace` ao apagar o `/`; `Enter` com o menu
// aberto não divide o parágrafo.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

const html = (page: Page) =>
  page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor));

const menu = (page: Page) =>
  page.evaluate(() => {
    const { open, query, items, activeIndex } =
      window.RteEditorLab.getSlashMenuState(window.editor);
    return { open, query, titles: items.map((i) => i.title), activeIndex };
  });

const isOpen = async (page: Page) => (await menu(page)).open;

/** Monta o editor com `content` e foca o fim do documento. */
async function start(page: Page, content = ''): Promise<void> {
  await loadEditorPage(page, { content });
  await page.evaluate(() => window.editor.commands.focus('end'));
  // O `focus` do Tiptap é assíncrono (lição 17).
  await expect(page.locator('#editor .ProseMirror')).toBeFocused();
}

test('E11: "/" abre no início e depois de espaço, não depois de letra', async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type('/');
  expect(await menu(page)).toMatchObject({ open: true, query: '' });
  await expect(page.locator('#editor .rte-slash-query')).toHaveText('/');
  await page.keyboard.type('ta');
  await expect(page.locator('#editor .rte-slash-query')).toHaveText('/ta');

  // `Backspace` real: a consulta encolhe; apagar o `/` fecha.
  await page.keyboard.press('Backspace');
  expect(await menu(page)).toMatchObject({ open: true, query: 't' });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<p></p>');
  expect(await isOpen(page)).toBe(false);

  await page.keyboard.type('a/');
  expect(await isOpen(page)).toBe(false);
  expect(await html(page)).toBe('<p>a/</p>');

  await page.keyboard.type(' /');
  expect(await isOpen(page)).toBe(true);
  expect(await html(page)).toBe('<p>a/ /</p>');
});

test('E11: "/" depois de U+00A0 abre', async ({ page }) => {
  await start(page, '<p>a\u00a0</p>');
  await page.keyboard.type('/');
  expect(await isOpen(page)).toBe(true);
  expect(await page.evaluate(() => window.editor.state.doc.textContent)).toBe(
    'a\u00a0/',
  );
});

test('E11: "/tab" filtra, ArrowDown + Enter insere a tabela e um Mod+Z volta', async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type('/tab');
  expect(await menu(page)).toEqual({
    open: true,
    query: 'tab',
    titles: ['Table'],
    activeIndex: 0,
  });
  await page.keyboard.press('ArrowDown');
  expect((await menu(page)).activeIndex).toBe(0);
  await page.keyboard.press('Enter');
  expect(await isOpen(page)).toBe(false);
  const result = await page.evaluate(() => {
    const { getRteHtml, validateHtml, getHtmlSchema } = window.RteEditorLab;
    const output = getRteHtml(window.editor);
    return {
      output,
      text: window.editor.state.doc.textContent,
      violations: validateHtml(output, getHtmlSchema()),
      headerCells: window.editor.view.dom.querySelectorAll('table th').length,
      rows: window.editor.view.dom.querySelectorAll('table tr').length,
    };
  });
  expect(result.output).toMatch(/^<table>/);
  expect(result.text).toBe('');
  expect(result.violations).toEqual([]);
  expect({ headerCells: result.headerCells, rows: result.rows }).toEqual({
    headerCells: 3,
    rows: 3,
  });

  await page.keyboard.press('ControlOrMeta+Z');
  expect(await html(page)).toBe('<p>/tab</p>');
});

test('E11: Escape fecha e continuar digitando não reabre', async ({ page }) => {
  await start(page);
  await page.keyboard.type('/');
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press('Escape');
  expect(await isOpen(page)).toBe(false);
  await page.keyboard.type('b');
  expect(await isOpen(page)).toBe(false);
  expect(await html(page)).toBe('<p>/b</p>');
  await expect(page.locator('#editor .rte-slash-query')).toHaveCount(0);
});

test('E11: Enter com o menu aberto executa o item e não divide o parágrafo', async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type('/h2');
  expect((await menu(page)).titles).toEqual(['Heading 2']);
  await page.keyboard.press('Enter');
  const doc = await page.evaluate(() => {
    const { doc } = window.editor.state;
    return {
      blocks: doc.childCount,
      first: doc.firstChild?.type.name,
      text: doc.textContent,
    };
  });
  expect(doc).toEqual({ blocks: 1, first: 'heading', text: '' });
  expect(await isOpen(page)).toBe(false);
});

test('E11: em bloco de código o "/" não abre', async ({ page }) => {
  await start(page, '<pre><code>x </code></pre>');
  await page.keyboard.type('/');
  expect(await isOpen(page)).toBe(false);
  expect(await html(page)).toBe('<pre><code>x /</code></pre>');
});
