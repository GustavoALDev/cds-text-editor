import { expect, test, type Locator, type Page } from '@playwright/test';
import { editableOf, gotoApp, waitForEditor } from './helpers/app';
import {
  cancelDialog,
  dialogField,
  openDialogFrom,
  openDialogOf,
  submitDialog,
} from './helpers/dialogs';
import { loadDoc, rteHtml, selectIn } from './helpers/toolbar';

// N16 (spec 05b2a, R5–R7): o diálogo de link pela interface, nos builds
// zoneless e `zone`, na página `/dialogs`. Inserir, aplicar, editar e remover
// pela barra e pelo `Ctrl+K`/`⌘K` real, cada um com o `getRteHtml` esperado e
// um `Mod+Z` de volta ao inicial; o `Mod-K` impede o padrão do navegador e
// não age em bloco de código; a política de links de cada instância
// (`dialogs`: `evil.example` bloqueado e `target` preservado; `dialogs-api`:
// só `https`, sem relativos e sem `target`) recusa com o erro visível e sem
// mudar o documento.

const URL_LABEL = 'Address (URL)';
const TEXT_LABEL = 'Text';
const NEW_TAB_LABEL = 'Open in a new tab';
const URL_ERROR =
  'Address not accepted. Check the format or use another address.';
const REQUIRED_ERROR = 'Fill in this field.';

const LINE_REST = ' e diga <span lang="fr">bonjour</span>.</p>';
const QUOTE =
  '<figure class="rt-pullquote"><blockquote><p>Uma frase marcante.</p></blockquote><figcaption><cite>Fulana de Tal</cite>, editora</figcaption></figure>';
const INITIAL = `<p>Visite <a href="https://example.com/">o site</a>${LINE_REST}${QUOTE}<p>Fim</p>`;
/** O documento inicial com o último parágrafo trocado. */
const withEnd = (end: string) =>
  `<p>Visite <a href="https://example.com/">o site</a>${LINE_REST}${QUOTE}${end}`;
/** O documento inicial com o link do 1º parágrafo trocado. */
const withLink = (link: string) =>
  `<p>Visite ${link}${LINE_REST}${QUOTE}<p>Fim</p>`;

/** Instala um ouvinte (fase de bolha, no documento) do último `Ctrl/⌘+K`. */
async function watchModK(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __modK?: boolean | null };
    w.__modK = null;
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))
        w.__modK = e.defaultPrevented;
    });
  });
}

function lastModKPrevented(page: Page): Promise<boolean | null> {
  return page.evaluate(
    () => (window as unknown as { __modK?: boolean | null }).__modK ?? null,
  );
}

/** O foco está dentro do diálogo (a página não perdeu o foco para o navegador). */
async function expectFocusInside(dialog: Locator): Promise<void> {
  await expect
    .poll(() =>
      dialog.evaluate((d) => d.contains(d.ownerDocument.activeElement)),
    )
    .toBe(true);
}

async function undo(page: Page, id: 'dialogs' | 'dialogs-api' = 'dialogs') {
  await expect(editableOf(page, id)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
}

for (const zone of [false, true]) {
  test.describe(`N16 (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/dialogs', { zone });
      await waitForEditor(page, 'dialogs');
      await waitForEditor(page, 'dialogs-api');
      await expect.poll(() => rteHtml(page, 'dialogs')).toBe(INITIAL);
    });

    test('inserir pela barra: URL e Texto obrigatórios, um Mod+Z volta e o texto digitado depois fica fora do <a>', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs', 'Fim', 3);
      let dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      await expect(dialog).toHaveAccessibleName('Insert link');
      await expect(dialogField(dialog, URL_LABEL)).toBeFocused();

      // Envio vazio: os dois erros, o foco no primeiro inválido, aberto.
      await submitDialog(dialog);
      await expect(dialog.locator('.rte-dialog__error')).toHaveText([
        REQUIRED_ERROR,
        REQUIRED_ERROR,
      ]);
      await expect(dialogField(dialog, URL_LABEL)).toBeFocused();
      await expect(dialog).toBeVisible();

      await dialogField(dialog, URL_LABEL).fill('site.com');
      await dialogField(dialog, TEXT_LABEL).fill('novo');
      // `Enter` num campo envia (G8).
      await page.keyboard.press('Enter');
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      const inserted = withEnd(
        '<p>Fim<a href="https://site.com/">novo</a></p>',
      );
      await expect.poll(() => rteHtml(page, 'dialogs')).toBe(inserted);

      await undo(page);
      await expect.poll(() => rteHtml(page, 'dialogs')).toBe(INITIAL);

      // De novo, e digitar logo depois: o `z` não herda a marca de link.
      await selectIn(page, 'dialogs', 'Fim', 3);
      dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      await dialogField(dialog, URL_LABEL).fill('site.com');
      await dialogField(dialog, TEXT_LABEL).fill('novo');
      await submitDialog(dialog);
      await expect.poll(() => rteHtml(page, 'dialogs')).toBe(inserted);
      await expect(editableOf(page, 'dialogs')).toBeFocused();
      await page.keyboard.type('z');
      await expect
        .poll(() => rteHtml(page, 'dialogs'))
        .toBe(withEnd('<p>Fim<a href="https://site.com/">novo</a>z</p>'));
    });

    test('aplicar por Ctrl+K real: padrão impedido, foco no diálogo, nova aba com target e rel, um Mod+Z volta', async ({
      page,
    }) => {
      await watchModK(page);
      await selectIn(page, 'dialogs', 'Fim');
      const dialog = await openDialogFrom(page, 'dialogs', 'shortcut', 'link');
      expect(await lastModKPrevented(page)).toBe(true);
      await expectFocusInside(dialog);
      await expect(dialogField(dialog, URL_LABEL)).toBeFocused();
      // Aplicar sobre a seleção: sem o campo Texto.
      await expect(dialogField(dialog, TEXT_LABEL)).toHaveCount(0);

      await dialogField(dialog, URL_LABEL).fill('https://site.com/x');
      await dialogField(dialog, NEW_TAB_LABEL).check();
      await submitDialog(dialog);
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      await expect
        .poll(() => rteHtml(page, 'dialogs'))
        .toBe(
          withEnd(
            '<p><a href="https://site.com/x" target="_blank" rel="noopener noreferrer">Fim</a></p>',
          ),
        );
      await undo(page);
      await expect.poll(() => rteHtml(page, 'dialogs')).toBe(INITIAL);
    });

    test('editar (barra) e remover (Ctrl+K): URL e nova aba preenchidos, o link inteiro, um Mod+Z cada', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs', 'o site', 2);
      let dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      await expect(dialog).toHaveAccessibleName('Edit link');
      await expect(dialogField(dialog, URL_LABEL)).toHaveValue(
        'https://example.com/',
      );
      await expect(dialogField(dialog, NEW_TAB_LABEL)).not.toBeChecked();
      await expect(dialog.locator('.rte-dialog__remove')).toHaveText(
        'Remove link',
      );
      await dialogField(dialog, URL_LABEL).fill('example.org/a');
      await submitDialog(dialog);
      await expect
        .poll(() => rteHtml(page, 'dialogs'))
        .toBe(withLink('<a href="https://example.org/a">o site</a>'));
      await undo(page);
      await expect.poll(() => rteHtml(page, 'dialogs')).toBe(INITIAL);

      await selectIn(page, 'dialogs', 'o site', 4);
      dialog = await openDialogFrom(page, 'dialogs', 'shortcut', 'link');
      await expect(dialog).toHaveAccessibleName('Edit link');
      await dialog.locator('.rte-dialog__remove').click();
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      await expect
        .poll(() => rteHtml(page, 'dialogs'))
        .toBe(withLink('o site'));
      await undo(page);
      await expect.poll(() => rteHtml(page, 'dialogs')).toBe(INITIAL);
    });

    test('Ctrl+K em bloco de código: nada abre e a tecla não é consumida', async ({
      page,
    }) => {
      const code = '<pre><code>x = 1</code></pre>';
      await loadDoc(page, 'dialogs', code);
      await watchModK(page);
      await selectIn(page, 'dialogs', 'x = 1', 1);
      await page.keyboard.press('ControlOrMeta+k');
      expect(await lastModKPrevented(page)).toBe(false);
      await page.waitForTimeout(300);
      await expect(page.locator('dialog.rte-dialog[open]')).toHaveCount(0);
      await expect(editableOf(page, 'dialogs')).toBeFocused();
      expect(await rteHtml(page, 'dialogs')).toBe(code);
    });

    test('política do dialogs: evil.example e sub.evil.example recusados com erro visível e documento igual', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs', 'Fim');
      const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      const url = dialogField(dialog, URL_LABEL);
      for (const input of [
        'https://evil.example/x',
        'https://sub.evil.example/',
        'javascript:alert(1)',
      ]) {
        await url.fill(input);
        await submitDialog(dialog);
        await expect(dialog.locator('.rte-dialog__error')).toHaveText(
          URL_ERROR,
        );
        await expect(url).toHaveAttribute('aria-invalid', 'true');
        await expect(dialog).toBeVisible();
        expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
      }
      await cancelDialog(dialog);
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
    });

    test('política do dialogs-api (openDialog): mailto:, /caminho e http recusados, sem "Open in a new tab", https aplicado sem target', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs-api', 'Fim');
      const dialog = await openDialogFrom(page, 'dialogs-api', 'api', 'link');
      await expect(dialogField(dialog, NEW_TAB_LABEL)).toHaveCount(0);
      const url = dialogField(dialog, URL_LABEL);
      for (const input of ['mailto:a@b.com', '/caminho', 'http://site.com/']) {
        await url.fill(input);
        await submitDialog(dialog);
        await expect(dialog.locator('.rte-dialog__error')).toHaveText(
          URL_ERROR,
        );
        await expect(dialog).toBeVisible();
        expect(await rteHtml(page, 'dialogs-api')).toBe(INITIAL);
      }
      await url.fill('https://site.com/');
      await submitDialog(dialog);
      await expect(openDialogOf(page, 'dialogs-api')).toHaveCount(0);
      await expect
        .poll(() => rteHtml(page, 'dialogs-api'))
        .toBe(withEnd('<p><a href="https://site.com/">Fim</a></p>'));
      await undo(page, 'dialogs-api');
      await expect.poll(() => rteHtml(page, 'dialogs-api')).toBe(INITIAL);
    });
  });
}
