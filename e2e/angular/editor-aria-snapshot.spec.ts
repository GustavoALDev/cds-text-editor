import { expect, test } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import { openDialogFrom, submitDialog } from './helpers/dialogs';
import {
  expectFloating,
  floatingMenu,
  waitFloatingReady,
} from './helpers/floating';
import { productivityReady } from './helpers/productivity';
import { loadDoc, openMenu, selectIn, toolbarButton } from './helpers/toolbar';
import { pngFile, tray, uniqueName, uploadInPage } from './helpers/upload';

// N61 (spec 08b, O8, R3): instantâneos da árvore de acessibilidade (`toMatchAriaSnapshot`) nos 3
// motores, com o YAML no próprio teste. Os modelos são parciais de propósito (só papel, nome e
// estado de cada trecho; o que não está listado não é comparado), sem `id` gerado, datas nem
// contagens frágeis. Os 3 motores comparam o MESMO YAML; divergência é causa a registrar no
// ADR 0021, não motivo para `skip`. `aria-describedby` e `aria-activedescendant` não aparecem
// na árvore: são conferidos por atributo/descrição acessível ao lado.

test.describe('N61 instantâneos ARIA', () => {
  test('editável com nome acessível e contadores', async ({ page }) => {
    await gotoApp(page, '/productivity');
    await productivityReady(page);
    await expect(editableOf(page, 'productivity')).toMatchAriaSnapshot(`
      - textbox "Productivity editor":
        - paragraph: Primeiro parágrafo com banana e maçã.
        - paragraph: Segundo parágrafo com banana.
    `);
    await expect(editableOf(page, 'productivity')).toHaveAttribute(
      'aria-multiline',
      'true',
    );
    await expect(
      editorHost(page, 'productivity').locator('.rte-counter--chars'),
    ).toHaveText(/^\d+\/200$/);
  });

  test('barra: toolbar, aria-pressed e aria-expanded', async ({ page }) => {
    await gotoApp(page, '/toolbar');
    await waitForEditor(page, 'toolbar');
    await loadDoc(page, 'toolbar', '<p><strong>negrito</strong> texto</p>');
    await selectIn(page, 'toolbar', 'negrito');
    const bar = editorHost(page, 'toolbar').locator('.rte-toolbar');
    await expect(toolbarButton(page, 'toolbar', 'Bold')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(toolbarButton(page, 'toolbar', 'Italic')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(bar).toMatchAriaSnapshot(`
      - toolbar "Formatting":
        - button "Undo"
        - button "Redo"
        - button "Paragraph, Text style"
        - button "Bold" [pressed]
        - button "Italic"
        - button "Underline"
        - button "Link"
        - button "Table"
        - button "Find and replace"
    `);
    await expect(toolbarButton(page, 'toolbar', 'Table')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await openMenu(page, 'toolbar', 'Table');
    await expect(bar).toMatchAriaSnapshot(`
      - toolbar "Formatting":
        - button "Table" [expanded]
        - menu "Table":
          - menuitem "Insert table 3 × 3"
          - menuitem "Insert table…"
          - menuitem "Insert row above"
          - menuitem "Delete table"
    `);
  });

  test('lista do /: opção ativa em aria-activedescendant e região viva', async ({
    page,
  }) => {
    const ID = 'productivity';
    await gotoApp(page, '/productivity');
    await productivityReady(page);
    const last = 'Segundo parágrafo com banana.';
    await selectIn(page, ID, last, last.length);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const list = editorHost(page, ID).locator('.rte-slash-menu');
    await expect(list).toBeVisible();
    await expect(list).toMatchAriaSnapshot(`
      - listbox "Insert block":
        - option "Heading 2" [selected]
        - option "Heading 3"
        - option "Bulleted list"
        - option "Table"
        - option "Image"
    `);
    const active = await editableOf(page, ID).getAttribute(
      'aria-activedescendant',
    );
    expect(active).toBeTruthy();
    await expect(
      editorHost(page, ID).locator(`[id="${active}"]`),
    ).toHaveAccessibleName('Heading 2');
    await page.keyboard.press('ArrowDown');
    await expect(list).toMatchAriaSnapshot(`
      - listbox "Insert block":
        - option "Heading 2"
        - option "Heading 3" [selected]
    `);
    // contagem anunciada (atraso de 300 ms) pela região viva do editor
    await expect(
      editorHost(page, ID).locator('.rte-live:not(.rte-live--limit)'),
    ).toHaveText(/^\d+ options$/);
  });

  test('barra de busca: contagem anunciada', async ({ page }) => {
    const ID = 'productivity';
    await gotoApp(page, '/productivity');
    await productivityReady(page);
    await selectIn(page, ID, 'banana');
    await page.keyboard.press('ControlOrMeta+f');
    const bar = editorHost(page, ID).locator('.rte-search');
    await expect(bar).toBeVisible();
    await expect(bar).toMatchAriaSnapshot(`
      - search "Find and replace":
        - textbox "Find": banana
        - text: 1 of 2
        - button "Previous match"
        - button "Next match"
        - button "Match case"
        - button "Whole word"
        - button "Show replace"
        - button "Close search"
    `);
  });

  test.describe('menus flutuantes', () => {
    const ID = 'floating';
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/floating');
      await waitForEditor(page, ID);
      await waitFloatingReady(page, ID);
    });

    test('link', async ({ page }) => {
      await selectIn(page, ID, 'um link', 2, 2);
      await expectFloating(page, ID, 'link');
      await expect(floatingMenu(page, ID, 'link')).toMatchAriaSnapshot(`
        - toolbar "Link":
          - link "https://example.com/":
            - /url: https://example.com/
          - button "Edit link"
          - button "Remove link"
      `);
    });

    test('texto', async ({ page }) => {
      await selectIn(page, ID, 'Segundo', 0, 0);
      for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
      await expectFloating(page, ID, 'text');
      await expect(floatingMenu(page, ID, 'text')).toMatchAriaSnapshot(`
        - toolbar "Text formatting":
          - button "Bold"
          - button "Italic"
          - button "Link"
      `);
    });

    test('imagem', async ({ page }) => {
      await editableOf(page, ID).locator('figure img').click();
      await expectFloating(page, ID, 'image');
      await expect(floatingMenu(page, ID, 'image')).toMatchAriaSnapshot(`
        - toolbar "Image":
          - button "Image details…"
          - button "Align left"
          - button "Center" [pressed]
          - button "Full width"
          - button "Remove image"
      `);
    });

    test('tabela', async ({ page }) => {
      await editorHost(page, ID).evaluate((host) => {
        const editor = window.rteE2e.getRteEditor(host);
        const cells: number[] = [];
        editor?.state.doc.descendants((node, pos) => {
          if (node.type.name === 'tableCell') cells.push(pos);
          return cells.length < 4;
        });
        editor
          ?.chain()
          .focus()
          .setCellSelection({ anchorCell: cells[0]!, headCell: cells[3]! })
          .run();
      });
      await expectFloating(page, ID, 'table');
      await expect(floatingMenu(page, ID, 'table')).toMatchAriaSnapshot(`
        - toolbar "Table":
          - button "Insert row below"
          - button "Delete column"
          - button "More table operations"
      `);
    });
  });

  test('diálogo de link: título, campos e erro ligado ao campo', async ({
    page,
  }) => {
    await gotoApp(page, '/dialogs');
    await waitForEditor(page, 'dialogs');
    await selectIn(page, 'dialogs', 'Fim', 3);
    const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
    await submitDialog(dialog);
    await expect(dialog).toMatchAriaSnapshot(`
      - dialog "Insert link":
        - heading "Insert link" [level=2]
        - textbox "Address (URL)" [invalid]
        - paragraph: Fill in this field.
        - textbox "Text" [invalid]
        - checkbox "Open in a new tab"
        - button "Cancel"
        - button "Apply"
    `);
    await expect(
      dialog.getByRole('textbox', { name: 'Address (URL)' }),
    ).toHaveAccessibleDescription(/Fill in this field\./);
  });

  test('bandeja de envio', async ({ page }) => {
    await gotoApp(page, '/upload');
    await waitForEditor(page, 'upload');
    const name = uniqueName('bandeja', 'png', 3000);
    expect(await uploadInPage(page, 'upload', [pngFile(name)])).toBe(1);
    await expect(tray(page, 'upload')).toMatchAriaSnapshot(`
      - group "Uploads":
        - list:
          - listitem:
            - progressbar /Uploading bandeja-.*/
            - button /Cancel upload of bandeja-.*/
    `);
  });

  test('aviso de rascunho', async ({ page }) => {
    await gotoApp(page, '/draft');
    await waitForEditor(page, 'draft');
    await editableOf(page, 'draft').click();
    await page.keyboard.type('x');
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('rte-draft:e2e-draft')),
      )
      .not.toBeNull();
    await page.reload();
    await waitForEditor(page, 'draft');
    await expect(page.locator('section.rte-draft')).toMatchAriaSnapshot(`
      - region "Saved draft":
        - paragraph: /A draft saved on .* is available\\./
        - button "Restore"
        - button "Discard"
    `);
  });
});
