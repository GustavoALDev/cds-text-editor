import { expect, test, type Page } from '@playwright/test';
import { collectConsole, editableOf, editorHost, gotoApp } from './helpers/app';
import { openDialogOf } from './helpers/dialogs';
import { productivityReady, severeViolations } from './helpers/productivity';
import { frames, rteHtml, selectIn } from './helpers/toolbar';

test.describe('compat: angular/editor-slash', { tag: '@compat' }, () => {
  // N42 (spec 05d1, R3, K4–K6): menu `/` com o teclado real — `/tab` + `Enter`
  // insere a tabela e um `Mod+Z` volta a `/tab`; a lista fica abaixo do `/` (e
  // acima quando não cabe); `aria-activedescendant` aponta para a opção visível;
  // `/imag` + `Enter` abre o diálogo de imagem e `Escape` devolve o foco ao
  // editável; axe sem `serious`/`critical` com o menu aberto.

  const ID = 'productivity';
  const LAST = 'Segundo parágrafo com banana.';

  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/productivity');
    await productivityReady(page);
  });

  /** Cursor no fim do último parágrafo, em parágrafo novo, digitando `query`. */
  async function typeSlash(page: Page, query: string): Promise<void> {
    await selectIn(page, ID, LAST, LAST.length);
    await page.keyboard.press('Enter');
    await page.keyboard.type(query);
  }

  function list(page: Page) {
    return editorHost(page, ID).locator('.rte-slash-menu');
  }

  test('N42: /tab + Enter insere a tabela e Mod+Z volta a /tab', async ({
    page,
  }) => {
    const messages = collectConsole(page);
    await typeSlash(page, '/tab');
    await expect(list(page)).toBeVisible();
    await expect(
      list(page).getByRole('option', { name: 'Table' }),
    ).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect.poll(() => rteHtml(page, ID)).toContain('<table');
    await expect(list(page)).toBeHidden();
    await frames(page);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => rteHtml(page, ID)).not.toContain('<table');
    await expect.poll(() => rteHtml(page, ID)).toContain('/tab');
    expect(messages.filter((m) => /NG0\d{3}/.test(m))).toEqual([]);
  });

  test('N42: aria-activedescendant aponta para a opção ativa visível', async ({
    page,
  }) => {
    await typeSlash(page, '/');
    await expect(list(page)).toBeVisible();
    const editable = editableOf(page, ID);
    await expect(editable).toHaveAttribute('aria-autocomplete', 'list');
    await expect(editable).toHaveAttribute('role', 'textbox');
    for (let i = 0; i < 3; i++) {
      const id = await editable.getAttribute('aria-activedescendant');
      expect(id).toBeTruthy();
      const option = editorHost(page, ID).locator(`[id="${id}"]`);
      await expect(option).toBeVisible();
      await expect(option).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowDown');
      await expect(editable).not.toHaveAttribute('aria-activedescendant', id!);
    }
    await page.keyboard.press('Escape');
    await expect(list(page)).toBeHidden();
    await expect(editable).not.toHaveAttribute('aria-activedescendant', /.+/);
    await expect(editable).not.toHaveAttribute('aria-autocomplete', /.+/);
  });

  test('N42: a lista fica abaixo do / e, sem espaço, acima dele', async ({
    page,
  }) => {
    await typeSlash(page, '/');
    await expect(list(page)).toBeVisible();
    const caret = () =>
      editorHost(page, ID).evaluate((host) => {
        const editor = window.rteE2e.getRteEditor(host)!;
        const at = editor.state.selection.from - 1;
        const c = editor.view.coordsAtPos(at);
        return { top: c.top, bottom: c.bottom };
      });
    const rect = () =>
      list(page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
    await expect
      .poll(async () => {
        const r = await rect();
        const c = await caret();
        return r.top >= c.bottom - 1 ? 'ok' : JSON.stringify({ r, c });
      })
      .toBe('ok');

    // Sem espaço abaixo: a janela encolhe até logo depois da linha do /.
    const width = await page.evaluate(() => window.innerWidth);
    const line = await caret();
    await page.setViewportSize({ width, height: Math.ceil(line.bottom) + 30 });
    await expect
      .poll(async () => {
        const c = await caret();
        const r = await rect();
        return r.bottom <= c.top + 1 && r.top >= 0;
      })
      .toBe(true);
  });

  test('N42: /imag + Enter abre o diálogo de imagem e Escape devolve o foco', async ({
    page,
  }) => {
    await typeSlash(page, '/imag');
    await expect(
      list(page).getByRole('option', { name: 'Image' }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    const dialog = openDialogOf(page, ID);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(editableOf(page, ID)).toBeFocused();
    await expect(list(page)).toBeHidden();
  });

  test('N42: axe sem violações serious/critical com o menu aberto', async ({
    page,
  }) => {
    await typeSlash(page, '/');
    await expect(list(page)).toBeVisible();
    await frames(page);
    // `scrollable-region-focusable` é falso positivo aqui: a lista rolável nunca
    // recebe o foco (K5) e o teclado a percorre pelo `aria-activedescendant`; o
    // axe só dispensa a regra para popups de `combobox`, que a K4 recusa.
    expect(
      await severeViolations(page, ['scrollable-region-focusable']),
    ).toEqual([]);
  });
});
