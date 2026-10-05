import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import {
  cancelDialog,
  dialogField,
  openDialogOf,
  submitDialog,
} from './helpers/dialogs';
import {
  expectFloating,
  floatingItem,
  floatingMenu,
  waitFloatingReady,
} from './helpers/floating';
import {
  arrowToButton,
  arrowToMenuItem,
  frames,
  rteHtml,
  selectIn,
} from './helpers/toolbar';

// N24 (spec 05b2b, R8–R10): os comandos dos menus flutuantes pela interface,
// por clique e por teclado (`Alt+F10`, setas, `Enter`), conferidos pelo
// `getRteHtml` do editor vivo e desfeitos com `Mod+Z`: marcas do menu de
// texto, link (abrir em aba nova, editar, remover), alinhar e remover a
// imagem, operações e submenu da tabela, a guarda de span 100 e o `Mod-K` com
// o menu de texto visível.

const ID = 'floating';

async function ready(page: Page): Promise<string> {
  await waitForEditor(page, ID);
  await expect.poll(() => rteHtml(page, ID)).toContain('Segundo parágrafo.');
  await waitFloatingReady(page, ID);
  return rteHtml(page, ID);
}

/** Volta o foco ao editável (se estiver num menu) e desfaz até `base`. */
async function undoTo(page: Page, base: string): Promise<void> {
  const inMenu = await editorHost(page, ID).evaluate(
    (host) =>
      !!document.activeElement?.closest('.rte-floating') &&
      host.contains(document.activeElement),
  );
  if (inMenu) await page.keyboard.press('Escape');
  await expect(editableOf(page, ID)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => rteHtml(page, ID)).toBe(base);
}

/** Seleciona a imagem: clique real, a menos que ela já esteja selecionada (as alças cobrem o centro). */
async function pickImage(page: Page): Promise<void> {
  const selected = await editorHost(page, ID).evaluate(
    (host) =>
      window.rteE2e.getRteEditor(host)?.state.selection.toJSON().type ===
      'node',
  );
  if (!selected) await editableOf(page, ID).locator('figure img').click();
  await frames(page);
}

function cursor(page: Page, text: string, at: number): Promise<void> {
  return selectIn(page, ID, text, at, at);
}

const MARKS: [label: string, html: RegExp][] = [
  ['Bold', /<strong>Segundo<\/strong>/],
  ['Italic', /<em>Segundo<\/em>/],
  ['Underline', /<u>Segundo<\/u>/],
  ['Strikethrough', /<s>Segundo<\/s>/],
  ['Inline code', /<code>Segundo<\/code>/],
];

/** Tabela 100 × 101 do `floating-guard.spec.ts` (cursor em `C`). */
const td = (text: string, attrs = '') => `<td${attrs}><p>${text}</p></td>`;
const tr = (...cells: string[]) => `<tr>${cells.join('')}</tr>`;
const SPAN_TABLE =
  '<table><tbody>' +
  tr(td('X', ' colspan="100"'), td('Y', ' rowspan="100"')) +
  tr(td('C'), td('D', ' colspan="99"')) +
  Array.from({ length: 98 }, (_, i) => tr(td(`e${i}e`, ' colspan="100"'))).join(
    '',
  ) +
  '</tbody></table>';

for (const zone of [false, true]) {
  test.describe(`N24 (${zone ? 'zone' : 'zoneless'})`, () => {
    let base = '';
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/floating', { zone });
      base = await ready(page);
    });

    for (const [label, html] of MARKS) {
      test(`marca ${label}: clique e teclado`, async ({ page }) => {
        // clique
        await selectIn(page, ID, 'Segundo');
        const menu = floatingMenu(page, ID, 'text');
        await expectFloating(page, ID, 'text');
        await floatingItem(menu, label).click();
        await expect.poll(() => rteHtml(page, ID)).toMatch(html);
        await expect(floatingItem(menu, label)).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await undoTo(page, base);

        // teclado
        await selectIn(page, ID, 'Segundo');
        await expectFloating(page, ID, 'text');
        await page.keyboard.press('Alt+F10');
        await arrowToButton(page, label);
        await page.keyboard.press('Enter');
        await expect.poll(() => rteHtml(page, ID)).toMatch(html);
        await undoTo(page, base);
      });
    }

    test('link: abrir em aba nova por clique e por Enter, sem navegar', async ({
      page,
      context,
    }) => {
      await context.route('https://example.com/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<p>ok</p>' }),
      );
      const editorUrl = page.url();
      const menu = floatingMenu(page, ID, 'link');
      const open = menu.locator('a.rte-floating__link');

      await cursor(page, 'um link', 2);
      await expectFloating(page, ID, 'link');
      await expect(open.locator('.rte-floating__address')).toContainText(
        'example.com',
      );
      let popup = context.waitForEvent('page');
      await open.click();
      let tab = await popup;
      await tab.waitForURL('https://example.com/');
      expect(tab.url()).toBe('https://example.com/');
      expect(page.url()).toBe(editorUrl);
      await tab.close();

      await page.bringToFront();
      await cursor(page, 'um link', 3);
      await expectFloating(page, ID, 'link');
      await page.keyboard.press('Alt+F10');
      await expect(open).toBeFocused();
      popup = context.waitForEvent('page');
      await page.keyboard.press('Enter');
      tab = await popup;
      await tab.waitForURL('https://example.com/');
      expect(page.url()).toBe(editorUrl);
      expect(await rteHtml(page, ID)).toBe(base);
      await tab.close();
    });

    test('Edit link: cancelar devolve o foco e o menu; aplicar muda o href', async ({
      page,
    }) => {
      await cursor(page, 'um link', 2);
      await expectFloating(page, ID, 'link');
      const menu = floatingMenu(page, ID, 'link');
      await floatingItem(menu, 'Edit link').click();
      const dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Edit link');
      await expect(dialogField(dialog, 'Address (URL)')).toHaveValue(
        'https://example.com/',
      );
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(editableOf(page, ID)).toBeFocused();
      await expectFloating(page, ID, 'link');
      expect(await rteHtml(page, ID)).toBe(base);

      // teclado: Alt+F10, seta até "Edit link", Enter; depois aplicar
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, 'Edit link');
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      await dialogField(dialog, 'Address (URL)').fill('site.com');
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect
        .poll(() => rteHtml(page, ID))
        .toContain('href="https://site.com/"');
      await undoTo(page, base);
    });

    test('Remove link: clique e teclado', async ({ page }) => {
      await cursor(page, 'um link', 2);
      await expectFloating(page, ID, 'link');
      await floatingItem(floatingMenu(page, ID, 'link'), 'Remove link').click();
      await expect
        .poll(() => rteHtml(page, ID))
        .toContain('com um link no meio.');
      expect(await rteHtml(page, ID)).not.toContain('<a ');
      await undoTo(page, base);

      await cursor(page, 'um link', 2);
      await expectFloating(page, ID, 'link');
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, 'Remove link');
      await page.keyboard.press('Enter');
      await expect.poll(() => rteHtml(page, ID)).not.toContain('<a ');
      await undoTo(page, base);
    });

    test('imagem: alinhamentos e Remove image', async ({ page }) => {
      const aligns: [string, string][] = [
        ['Align left', 'rt-figure--left'],
        ['Align right', 'rt-figure--right'],
        ['Full width', 'rt-figure--full'],
        ['Center', 'rt-figure--center'],
      ];
      for (const [label, cls] of aligns) {
        await pickImage(page);
        await expectFloating(page, ID, 'image');
        if (label === 'Center') {
          // a imagem do fixture já é centralizada: outro alinhamento antes
          await floatingItem(
            floatingMenu(page, ID, 'image'),
            'Align left',
          ).click();
          await expect
            .poll(() => rteHtml(page, ID))
            .toContain('rt-figure--left');
          await expectFloating(page, ID, 'image');
        }
        const item = floatingItem(floatingMenu(page, ID, 'image'), label);
        await item.click();
        await expect.poll(() => rteHtml(page, ID)).toContain(cls);
        if (label === 'Center') {
          expect(await rteHtml(page, ID)).not.toContain('rt-figure--left');
        }
        await expect(item).toHaveAttribute('aria-pressed', 'true');
        // a seleção continua na imagem: o menu segue visível
        await expectFloating(page, ID, 'image');
        await undoTo(page, base);
      }

      // teclado
      await pickImage(page);
      await expectFloating(page, ID, 'image');
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, 'Align right');
      await page.keyboard.press('Enter');
      await expect.poll(() => rteHtml(page, ID)).toContain('rt-figure--right');
      await undoTo(page, base);

      await pickImage(page);
      await expectFloating(page, ID, 'image');
      await floatingItem(
        floatingMenu(page, ID, 'image'),
        'Remove image',
      ).click();
      await expect.poll(() => rteHtml(page, ID)).not.toContain('<figure');
      await undoTo(page, base);

      await pickImage(page);
      await expectFloating(page, ID, 'image');
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, 'Remove image');
      await page.keyboard.press('Enter');
      await expect.poll(() => rteHtml(page, ID)).not.toContain('<figure');
      await undoTo(page, base);
    });

    test('tabela: operações dos botões e submenu, por clique e teclado', async ({
      page,
    }) => {
      const rows = (html: string) => (html.match(/<tr>/g) ?? []).length;
      const cells = (html: string) => (html.match(/<t[dh]/g) ?? []).length;
      const menu = floatingMenu(page, ID, 'table');
      const baseRows = rows(base);
      const baseCells = cells(base);

      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await floatingItem(menu, 'Insert row below').click();
      await expect
        .poll(async () => rows(await rteHtml(page, ID)))
        .toBe(baseRows + 1);
      await undoTo(page, base);

      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await floatingItem(menu, 'Insert column after').click();
      await expect
        .poll(async () => cells(await rteHtml(page, ID)))
        .toBe(baseCells + 2);
      await undoTo(page, base);

      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await floatingItem(menu, 'Delete row').click();
      await expect
        .poll(async () => rows(await rteHtml(page, ID)))
        .toBe(baseRows - 1);
      await undoTo(page, base);

      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await floatingItem(menu, 'Delete column').click();
      await expect
        .poll(async () => cells(await rteHtml(page, ID)))
        .toBe(baseCells - 2);
      await undoTo(page, base);

      // teclado: botão
      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, 'Insert row below');
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => rows(await rteHtml(page, ID)))
        .toBe(baseRows + 1);
      await undoTo(page, base);

      // submenu por clique
      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await floatingItem(menu, 'More table operations').click();
      await expect(menu.locator('.rte-menu')).toBeVisible();
      await floatingItem(menu, 'Header row').click();
      await expect.poll(() => rteHtml(page, ID)).toContain('<th');
      await expect(menu.locator('.rte-menu')).toBeHidden();
      await undoTo(page, base);

      // submenu por teclado
      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, 'More table operations');
      await page.keyboard.press('Enter');
      await arrowToMenuItem(page, 'Delete table');
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => (await rteHtml(page, ID)).match(/<table/g)?.length)
        .toBe(1);
      await undoTo(page, base);
    });

    test('guarda de span 100: motivo no title, clique sem efeito', async ({
      page,
    }) => {
      await page.evaluate(
        (html) => window.rteE2e.setValue('floating', html),
        SPAN_TABLE,
      );
      await expect.poll(() => rteHtml(page, ID)).toContain('e97e');
      const doc = await rteHtml(page, ID);
      await selectIn(page, ID, 'C', 0, 0);
      await expectFloating(page, ID, 'table');
      const item = floatingItem(
        floatingMenu(page, ID, 'table'),
        'Insert row below',
      );
      await expect(item).toHaveAttribute('aria-disabled', 'true');
      await expect(item).toHaveAttribute(
        'title',
        /Unavailable: a cell would span more than 100 rows or columns\./,
      );
      await item.click({ force: true });
      await frames(page);
      expect(await rteHtml(page, ID)).toBe(doc);
    });

    test('Mod-K com o menu de texto visível: diálogo oculta o menu; cancelar devolve', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      await page.keyboard.press('ControlOrMeta+k');
      const dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      await expectFloating(page, ID, null);
      await cancelDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect(editableOf(page, ID)).toBeFocused();
      await expectFloating(page, ID, 'text');
      expect(await rteHtml(page, ID)).toBe(base);
    });
  });
}
