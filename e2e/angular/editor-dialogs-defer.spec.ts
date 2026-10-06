import { expect, test, type Page } from '@playwright/test';
import {
  appUrl,
  collectConsole,
  editableOf,
  editorHost,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import {
  cancelDialog,
  dialogField,
  dialogsChunk,
  openDialogFrom,
  openDialogOf,
  submitDialog,
} from './helpers/dialogs';
import { rteHtml, selectIn, toolbarButton } from './helpers/toolbar';

// N20 (spec 05b2a, R12, R14): os diálogos vêm de um `@defer (when
// dialogRequested(); prefetch on idle)`, nos builds zoneless e `zone`. O HTML
// pré-renderizado não tem `<dialog>`; o *chunk* (o `.js` com
// `rte-link-form`, pré-voo 16 e 05c2a E2) não está no HTML nem contém o editor e
// chega por *prefetch* ociosa; um `Ctrl+K` antes da chegada abre o diálogo
// quando ela acontece; a falha do *chunk* cai no `@error` (terminal) sem
// quebrar o editor; carregar, abrir, validar, aplicar e cancelar os quatro
// diálogos não viola a CSP nem deixa atributo `style` no host, na barra ou no
// diálogo.

/** Violações de CSP desde a última leitura (a lista é esvaziada). */
async function takeViolations(page: Page) {
  await settlePage(page);
  return page.evaluate(() => window.__violations.splice(0));
}

/**
 * Atributos `style` no host do editor `id`, na barra e no diálogo. O host só
 * pode ter as propriedades `--rte-*` do tema da instância (`applyRteTheme`,
 * por CSSOM, permitido pela CSP) e o menu da barra, a posição por CSSOM
 * (`positionMenu`, U7 da 05b1); o resto da barra e o diálogo, nenhum.
 */
function strayStyles(page: Page, id: 'dialogs' | 'dialogs-api') {
  return editorHost(page, id).evaluate((host: HTMLElement) => {
    const out: string[] = [];
    for (let i = 0; i < host.style.length; i++) {
      const name = host.style.item(i);
      if (!name.startsWith('--rte-')) out.push(`host: ${name}`);
    }
    for (const el of host.querySelectorAll(
      '.rte-toolbar[style], .rte-toolbar [style]:not(.rte-menu), dialog[style], dialog [style]',
    ))
      out.push(`${el.tagName}.${el.className}`);
    return out;
  });
}

for (const zone of [false, true]) {
  test.describe(`N20 (${zone ? 'zone' : 'zoneless'})`, () => {
    test('SSR sem <dialog>; chunk fora do HTML e sem o editor, pedido pela prefetch ociosa; console sem NG05', async ({
      page,
    }) => {
      const raw = await (
        await page.request.get(appUrl('/dialogs', { zone }))
      ).text();
      expect(raw).toContain('data-testid="dialogs"');
      expect(raw).not.toContain('<dialog');
      expect(raw).not.toContain('rte-dialog');
      const editors = raw.match(/<rte-editor[\s\S]*?<\/rte-editor>/g) ?? [];
      expect(editors).toHaveLength(2);
      for (const editor of editors) expect(editor).not.toMatch(/\sstyle=/);

      const messages = collectConsole(page);
      const chunk = await dialogsChunk(page);
      await gotoApp(page, '/dialogs', { zone });
      await waitForEditor(page, 'dialogs');
      // Sem nenhum pedido: só a prefetch ociosa busca o chunk.
      const url = await chunk.requested;
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      const file = new URL(url).pathname.split('/').pop() ?? '';
      expect(file).toMatch(/\.js$/);
      expect(raw).not.toContain(file);
      const body = await (await page.request.get(url)).text();
      expect(body).toContain('rte-dialog__form');
      expect(body).not.toContain('rte-editor__mount');

      await selectIn(page, 'dialogs', 'Fim');
      const dialog = await openDialogFrom(page, 'dialogs', 'shortcut', 'link');
      await cancelDialog(dialog);
      await settlePage(page);
      expect(messages.filter((m) => m.includes('NG05'))).toEqual([]);
    });

    test('Ctrl+K com o chunk atrasado: nada antes da chegada, diálogo com foco na URL depois', async ({
      page,
    }) => {
      const chunk = await dialogsChunk(page);
      const release = chunk.hold();
      await gotoApp(page, '/dialogs', { zone });
      await waitForEditor(page, 'dialogs');
      await selectIn(page, 'dialogs', 'Fim');
      await page.keyboard.press('ControlOrMeta+k');
      await chunk.requested;
      await page.waitForTimeout(300);
      await expect(page.locator('dialog.rte-dialog')).toHaveCount(0);
      await expect(editableOf(page, 'dialogs')).toBeFocused();

      release();
      const dialog = openDialogOf(page, 'dialogs');
      await expect(dialog).toBeVisible();
      await expect(dialogField(dialog, 'Address (URL)')).toBeFocused();
      await expect(dialog).toHaveAccessibleName('Insert link');
    });

    test('chunk abortado: Link não abre, o foco fica no botão, o editor continua editável e openDialog devolve false', async ({
      page,
    }) => {
      const chunk = await dialogsChunk(page);
      chunk.abort();
      await gotoApp(page, '/dialogs', { zone });
      await waitForEditor(page, 'dialogs');
      await selectIn(page, 'dialogs', 'Fim');
      const link = toolbarButton(page, 'dialogs', 'Link');
      await link.click();
      await chunk.requested;
      await expect(link).toBeFocused();
      await page.waitForTimeout(300);
      await expect(page.locator('dialog.rte-dialog')).toHaveCount(0);
      await expect(link).toBeFocused();

      await selectIn(page, 'dialogs', 'Fim', 3);
      await page.keyboard.type('z');
      await expect
        .poll(() => rteHtml(page, 'dialogs'))
        .toMatch(/<p>Fimz<\/p>$/);
      // `@error` é terminal (pré-voo 5).
      expect(
        await page.evaluate(() => window.rteE2e.openDialog('dialogs', 'link')),
      ).toBe(false);
    });

    test('CSP: 0 violações ao carregar o chunk, abrir, validar, aplicar e cancelar os quatro diálogos; nenhum style no host, na barra ou no diálogo', async ({
      page,
      browserName,
    }) => {
      test.setTimeout(90_000);
      const chunk = await dialogsChunk(page);
      await gotoApp(page, '/dialogs', { zone });
      await waitForEditor(page, 'dialogs');
      await chunk.requested;
      // Ruling 28 do ADR 0007: só na fase de carga, só `style-src-attr` no
      // Chromium (o fixture não tem `style`, então em geral nada).
      const load = await takeViolations(page);
      expect(
        load.filter(
          (v) =>
            !(browserName === 'chromium' && v.directive === 'style-src-attr'),
        ),
      ).toEqual([]);

      const dialogsDoc = 'dialogs';
      // Link: cancelar (Escape), validar e aplicar.
      await selectIn(page, dialogsDoc, 'Fim');
      let dialog = await openDialogFrom(page, dialogsDoc, 'shortcut', 'link');
      await page.keyboard.press('Escape');
      await expect(openDialogOf(page, dialogsDoc)).toHaveCount(0);
      await selectIn(page, dialogsDoc, 'Fim');
      dialog = await openDialogFrom(page, dialogsDoc, 'toolbar', 'link');
      await submitDialog(dialog);
      await expect(dialog.locator('.rte-dialog__error')).toBeVisible();
      await dialogField(dialog, 'Address (URL)').fill('site.com');
      await submitDialog(dialog);
      await expect(openDialogOf(page, dialogsDoc)).toHaveCount(0);

      // Idioma: cancelar, validar ("Other…" inválido) e aplicar.
      await selectIn(page, dialogsDoc, 'bonjour', 2);
      dialog = await openDialogFrom(page, dialogsDoc, 'toolbar', 'lang');
      await cancelDialog(dialog);
      await selectIn(page, dialogsDoc, 'bonjour', 2);
      dialog = await openDialogFrom(page, dialogsDoc, 'toolbar', 'lang');
      await dialogField(dialog, 'Language').selectOption({ label: 'Other…' });
      const code = dialogField(dialog, 'Language code (BCP 47)');
      await code.fill('x_y');
      await submitDialog(dialog);
      await expect(dialog.locator('.rte-dialog__error')).toBeVisible();
      await code.fill('pt-BR');
      await submitDialog(dialog);
      await expect(openDialogOf(page, dialogsDoc)).toHaveCount(0);

      // Autor da citação: cancelar, validar (201 caracteres) e aplicar.
      await selectIn(page, dialogsDoc, 'Uma frase marcante.', 3);
      dialog = await openDialogFrom(page, dialogsDoc, 'toolbar', 'quoteAuthor');
      await cancelDialog(dialog);
      await selectIn(page, dialogsDoc, 'Uma frase marcante.', 3);
      dialog = await openDialogFrom(page, dialogsDoc, 'toolbar', 'quoteAuthor');
      const author = dialogField(dialog, 'Author');
      await author.evaluate((input: HTMLInputElement) => {
        input.value = 'a'.repeat(201);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await submitDialog(dialog);
      await expect(dialog.locator('.rte-dialog__error')).toBeVisible();
      await author.fill('Beltrana');
      await submitDialog(dialog);
      await expect(openDialogOf(page, dialogsDoc)).toHaveCount(0);

      // Tabela: cancelar, validar (0) e aplicar.
      await selectIn(page, dialogsDoc, 'Fim', 3);
      dialog = await openDialogFrom(page, dialogsDoc, 'toolbar', 'table');
      // Com o diálogo aberto: nenhum `style` no host, na barra ou no diálogo.
      expect(await strayStyles(page, dialogsDoc)).toEqual([]);
      await cancelDialog(dialog);
      await selectIn(page, dialogsDoc, 'Fim', 3);
      dialog = await openDialogFrom(page, dialogsDoc, 'toolbar', 'table');
      await dialogField(dialog, 'Rows').fill('0');
      await submitDialog(dialog);
      await expect(dialog.locator('.rte-dialog__error')).toBeVisible();
      await dialogField(dialog, 'Rows').fill('2');
      await submitDialog(dialog);
      await expect(openDialogOf(page, dialogsDoc)).toHaveCount(0);
      await expect
        .poll(() => rteHtml(page, dialogsDoc))
        .toContain('<cite>Beltrana</cite>');
      const html = await rteHtml(page, dialogsDoc);
      expect(html).toContain('<a href="https://site.com/">Fim</a>');
      expect(html).toContain('<span lang="pt-BR">bonjour</span>');
      expect(html).toContain('<table>');

      expect(await takeViolations(page)).toEqual([]);
      expect(await page.evaluate(() => window.__styleAdds)).toEqual([]);
      expect(await strayStyles(page, dialogsDoc)).toEqual([]);
    });
  });
}
