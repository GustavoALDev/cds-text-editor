import { expect, test, type Page } from '@playwright/test';
import { editableOf, gotoApp, waitForEditor } from './helpers/app';
import {
  cancelDialog,
  dialogField,
  openDialogFrom,
  openDialogOf,
  submitDialog,
  type DialogKind,
} from './helpers/dialogs';
import { menuItem, openMenu, rteHtml, selectIn } from './helpers/toolbar';

// N17 (spec 05b2a, R9–R11): os diálogos de idioma, de autor da citação e de
// tabela nova pela interface (barra do `dialogs`), cada um com o
// `getRteHtml` esperado e um `Mod+Z` de volta ao inicial; e os quatro
// diálogos pela API `openDialog` no `dialogs-api` (sem barra).

const LINE_START =
  '<p>Visite <a href="https://example.com/">o site</a> e diga ';
const LINE_END = '.</p>';
const BONJOUR = '<span lang="fr">bonjour</span>';
const CITE = '<figcaption><cite>Fulana de Tal</cite>, editora</figcaption>';
const quote = (caption: string) =>
  `<figure class="rt-pullquote"><blockquote><p>Uma frase marcante.</p></blockquote>${caption}</figure>`;
const doc = (o: { lang?: string; caption?: string; end?: string } = {}) =>
  `${LINE_START}${o.lang ?? BONJOUR}${LINE_END}${quote(o.caption ?? CITE)}${o.end ?? '<p>Fim</p>'}`;
const INITIAL = doc();

const LANG_ERROR = 'Invalid code. Use a BCP 47 tag such as pt-BR.';

const th = (scope: 'col' | 'row') => `<th scope="${scope}"><p></p></th>`;
const TD = '<td><p></p></td>';
const EMPTY_TH = '<th><p></p></th>';
const row = (...cells: string[]) => `<tr>${cells.join('')}</tr>`;

async function undoToInitial(page: Page): Promise<void> {
  await expect(editableOf(page, 'dialogs')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => rteHtml(page, 'dialogs')).toBe(INITIAL);
}

async function expectClosed(page: Page, id: 'dialogs' | 'dialogs-api') {
  await expect(openDialogOf(page, id)).toHaveCount(0);
}

test.describe('N17', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/dialogs');
    await waitForEditor(page, 'dialogs');
    await waitForEditor(page, 'dialogs-api');
    await expect.poll(() => rteHtml(page, 'dialogs')).toBe(INITIAL);
  });

  test('idioma da lista (de) sobre a seleção; um Mod+Z volta', async ({
    page,
  }) => {
    await selectIn(page, 'dialogs', 'Fim');
    const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'lang');
    await expect(dialog).toHaveAccessibleName('Mark language');
    const language = dialogField(dialog, 'Language');
    await expect(language).toBeFocused();
    await expect(language).toHaveValue('en');
    await expect(dialogField(dialog, 'Text direction')).toHaveValue('');
    await language.selectOption('de');
    await submitDialog(dialog);
    await expectClosed(page, 'dialogs');
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(doc({ end: '<p><span lang="de">Fim</span></p>' }));
    await undoToInitial(page);
  });

  test('"Other…": código inválido com erro, pt-BR aplicado; um Mod+Z volta', async ({
    page,
  }) => {
    await selectIn(page, 'dialogs', 'Fim');
    const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'lang');
    await dialogField(dialog, 'Language').selectOption({ label: 'Other…' });
    const code = dialogField(dialog, 'Language code (BCP 47)');
    await expect(code).toBeVisible();
    for (const invalid of ['en_US', 'português', '<x>']) {
      await code.fill(invalid);
      await submitDialog(dialog);
      await expect(dialog.locator('.rte-dialog__error')).toHaveText(LANG_ERROR);
      await expect(code).toBeFocused();
      await expect(code).toHaveAttribute('aria-invalid', 'true');
      expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
    }
    await code.fill('pt-BR');
    await expect(dialog.locator('.rte-dialog__error')).toHaveCount(0);
    await submitDialog(dialog);
    await expectClosed(page, 'dialogs');
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(doc({ end: '<p><span lang="pt-BR">Fim</span></p>' }));
    await undoToInitial(page);
  });

  test('ar sugere rtl; um Mod+Z volta', async ({ page }) => {
    await selectIn(page, 'dialogs', 'Fim');
    const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'lang');
    await dialogField(dialog, 'Language').selectOption('ar');
    await expect(dialogField(dialog, 'Text direction')).toHaveValue('rtl');
    await submitDialog(dialog);
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(doc({ end: '<p><span lang="ar" dir="rtl">Fim</span></p>' }));
    await undoToInitial(page);
  });

  test('editar (fr → it) e remover o idioma do trecho inteiro; um Mod+Z cada', async ({
    page,
  }) => {
    await selectIn(page, 'dialogs', 'bonjour', 3);
    let dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'lang');
    await expect(dialog).toHaveAccessibleName('Edit language');
    await expect(dialogField(dialog, 'Language')).toHaveValue('fr');
    await dialogField(dialog, 'Language').selectOption('it');
    await submitDialog(dialog);
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(doc({ lang: '<span lang="it">bonjour</span>' }));
    await undoToInitial(page);

    await selectIn(page, 'dialogs', 'bonjour', 5);
    dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'lang');
    await expect(dialog.locator('.rte-dialog__remove')).toHaveText(
      'Remove language',
    );
    await dialog.locator('.rte-dialog__remove').click();
    await expectClosed(page, 'dialogs');
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(doc({ lang: 'bonjour' }));
    await undoToInitial(page);
  });

  test('autor da citação: preenchido, trocado, os dois vazios tiram o figcaption, 201 caracteres dão erro', async ({
    page,
  }) => {
    await selectIn(page, 'dialogs', 'Uma frase marcante.', 3);
    let dialog = await openDialogFrom(
      page,
      'dialogs',
      'toolbar',
      'quoteAuthor',
    );
    await expect(dialog).toHaveAccessibleName('Quote author');
    const author = () => dialogField(dialog, 'Author');
    const role = () => dialogField(dialog, 'Role');
    await expect(author()).toBeFocused();
    await expect(author()).toHaveValue('Fulana de Tal');
    await expect(role()).toHaveValue('editora');
    await author().fill('Beltrana <b>');
    await role().fill('diretora');
    await submitDialog(dialog);
    await expectClosed(page, 'dialogs');
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(
        doc({
          caption:
            '<figcaption><cite>Beltrana &lt;b&gt;</cite>, diretora</figcaption>',
        }),
      );
    await undoToInitial(page);

    await selectIn(page, 'dialogs', 'Uma frase marcante.', 3);
    dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'quoteAuthor');
    await author().fill('');
    await role().fill('');
    await submitDialog(dialog);
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(doc({ caption: '' }));
    await undoToInitial(page);

    // O `maxlength` nativo impede digitar além de 200 (pré-voo 2): o valor
    // chega por `evaluate` (`value` + `input`).
    await selectIn(page, 'dialogs', 'Uma frase marcante.', 3);
    dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'quoteAuthor');
    await expect(author()).toHaveAttribute('maxlength', '200');
    await author().evaluate((input: HTMLInputElement) => {
      input.value = 'a'.repeat(201);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await role().focus();
    await submitDialog(dialog);
    await expect(dialog.locator('.rte-dialog__error')).toHaveText(
      'Use at most 200 characters.',
    );
    await expect(author()).toBeFocused();
    await expect(dialog).toBeVisible();
    expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
    await cancelDialog(dialog);
    await expectClosed(page, 'dialogs');
    expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
  });

  test('tabela: Insert table… 2 × 4 com coluna de cabeçalho, 0 dá erro de faixa, Insert table 3 × 3 continua; um Mod+Z cada', async ({
    page,
  }) => {
    await selectIn(page, 'dialogs', 'Fim', 3);
    const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'table');
    await expect(dialog).toHaveAccessibleName('Insert table');
    const rows = () => dialogField(dialog, 'Rows');
    const cols = () => dialogField(dialog, 'Columns');
    await expect(rows()).toBeFocused();
    await expect(rows()).toHaveValue('3');
    await expect(cols()).toHaveValue('3');
    await expect(dialogField(dialog, 'Header row')).toBeChecked();
    await expect(dialogField(dialog, 'Header column')).not.toBeChecked();

    await rows().fill('0');
    await submitDialog(dialog);
    await expect(dialog.locator('.rte-dialog__error')).toHaveText(
      'Enter a whole number from 1 to 100.',
    );
    await expect(rows()).toBeFocused();
    expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);

    await rows().fill('2');
    await cols().fill('4');
    await dialogField(dialog, 'Header column').check();
    await submitDialog(dialog);
    await expectClosed(page, 'dialogs');
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(
        doc({
          end:
            '<p>Fim</p><table><tbody>' +
            row(th('col'), th('col'), th('col'), th('col')) +
            row(th('row'), TD, TD, TD) +
            '</tbody></table>',
        }),
      );
    await undoToInitial(page);

    await selectIn(page, 'dialogs', 'Fim', 3);
    const menu = await openMenu(page, 'dialogs', 'Table');
    await menuItem(menu, 'Insert table 3 × 3').click();
    await expect
      .poll(() => rteHtml(page, 'dialogs'))
      .toBe(
        doc({
          end:
            '<p>Fim</p><table><tbody>' +
            row(EMPTY_TH, EMPTY_TH, EMPTY_TH) +
            row(TD, TD, TD) +
            row(TD, TD, TD) +
            '</tbody></table>',
        }),
      );
    await undoToInitial(page);
  });

  test('dialogs-api: os quatro botões abrem por openDialog (data-result="true"); a tabela só fora de tabela', async ({
    page,
  }) => {
    const cases: [DialogKind, string, number, string][] = [
      ['link', 'o site', 2, 'Edit link'],
      ['lang', 'bonjour', 3, 'Edit language'],
      ['quoteAuthor', 'Uma frase marcante.', 3, 'Quote author'],
      ['table', 'Fim', 3, 'Insert table'],
    ];
    for (const [kind, text, at, title] of cases) {
      await selectIn(page, 'dialogs-api', text, at);
      const dialog = await openDialogFrom(page, 'dialogs-api', 'api', kind);
      await expect(dialog).toHaveAccessibleName(title);
      await expect(
        dialog.locator('.rte-dialog__field').first().locator('input, select'),
      ).toBeFocused();
      await cancelDialog(dialog);
      await expectClosed(page, 'dialogs-api');
    }
    expect(await rteHtml(page, 'dialogs-api')).toBe(INITIAL);

    const table = '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>';
    await page.evaluate(
      (html) => window.rteE2e.setValue('dialogs-api', html),
      table,
    );
    await expect.poll(() => rteHtml(page, 'dialogs-api')).toBe(table);
    await selectIn(page, 'dialogs-api', 'a', 1);
    const button = page.locator('button[data-testid="open-table"]');
    await button.click();
    await expect(button).toHaveAttribute('data-result', 'false');
    await page.waitForTimeout(200);
    await expect(page.locator('dialog.rte-dialog[open]')).toHaveCount(0);
  });
});
