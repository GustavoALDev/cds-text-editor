import { expect, test, type Page } from '@playwright/test';
import {
  editableOf,
  editorHost,
  formState,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import { expectFloating } from './helpers/floating';
import {
  arrowToButton,
  expectSelection,
  focusedLabel,
  loadDoc,
  rteHtml,
  selectIn,
  toolbarButton,
} from './helpers/toolbar';

// N9 (spec 05b1, R3, U2, U3): teclado real na barra `full` do editor
// `toolbar`. Uma parada de `Tab` (página → item ativo → editável → página),
// `Shift+Tab` do editável para na barra; `←`/`→` circulares (invertidos em
// `dir="rtl"`), `Home`/`End`; o item ativo é lembrado; item inaplicável
// focável com `aria-disabled` e sem efeito; `Alt+F10` foca a barra e `Escape`
// volta ao editável com a seleção; `Enter` em `Bold` aplica e devolve o foco.
// O foco entre a barra e o editável nunca emite `touch` (D11).

const FIRST = 'Undo';
const LAST = 'Find and replace';

async function touched(page: Page): Promise<boolean> {
  return (await formState(page, 'toolbar')).touched;
}

for (const zone of [false, true]) {
  test.describe(`N9 (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/toolbar', { zone });
      await waitForEditor(page, 'toolbar');
    });

    test('Tab: página → barra → editável → página, e Shift+Tab de volta', async ({
      page,
    }) => {
      const editable = editableOf(page, 'toolbar');
      await page.locator('#before-toolbar').focus();
      await page.keyboard.press('Tab');
      expect(await focusedLabel(page)).toBe(FIRST);
      await expect(toolbarButton(page, 'toolbar', FIRST)).toHaveAttribute(
        'tabindex',
        '0',
      );
      // Um só item na ordem de Tab.
      await expect(
        editorHost(page, 'toolbar').locator('.rte-toolbar [tabindex="0"]'),
      ).toHaveCount(1);
      await page.keyboard.press('Tab');
      await expect(editable).toBeFocused();

      // Shift+Tab do editável para na barra (pré-voo 6).
      await page.keyboard.press('Shift+Tab');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('Tab');
      await expect(editable).toBeFocused();
      expect(await touched(page)).toBe(false);

      await page.keyboard.press('Tab');
      await expect(page.locator('#after-toolbar')).toBeFocused();
      await expect.poll(() => touched(page)).toBe(true);

      await page.keyboard.press('Shift+Tab');
      await expect(editable).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('#before-toolbar')).toBeFocused();
    });

    test('setas circulares, Home/End, rtl e item lembrado', async ({
      page,
    }) => {
      await page.locator('#before-toolbar').focus();
      await page.keyboard.press('Tab');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('ArrowRight');
      expect(await focusedLabel(page)).toBe('Redo');
      await page.keyboard.press('ArrowLeft');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('ArrowLeft');
      expect(await focusedLabel(page)).toBe(LAST);
      await page.keyboard.press('ArrowRight');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('End');
      expect(await focusedLabel(page)).toBe(LAST);
      await page.keyboard.press('Home');
      expect(await focusedLabel(page)).toBe(FIRST);

      // `dir="rtl"` no host: as setas se invertem.
      await editorHost(page, 'toolbar').evaluate((h) =>
        h.setAttribute('dir', 'rtl'),
      );
      await page.keyboard.press('ArrowRight');
      expect(await focusedLabel(page)).toBe(LAST);
      await page.keyboard.press('ArrowLeft');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('ArrowLeft');
      expect(await focusedLabel(page)).toBe('Redo');
      await editorHost(page, 'toolbar').evaluate((h) =>
        h.removeAttribute('dir'),
      );

      // Item lembrado entre visitas.
      await arrowToButton(page, 'Bold');
      await page.keyboard.press('Tab');
      await expect(editableOf(page, 'toolbar')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      expect(await focusedLabel(page)).toBe('Bold');
      await expect(toolbarButton(page, 'toolbar', 'Bold')).toHaveAttribute(
        'tabindex',
        '0',
      );
      expect(await touched(page)).toBe(false);
    });

    test('item focado que sai da barra: o foco fica na barra, sem touch', async ({
      page,
    }) => {
      await loadDoc(page, 'toolbar', '<p>abcd</p>');
      await selectIn(page, 'toolbar', 'abcd', 2);
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, LAST);
      // 'minimal' não tem "Clear formatting": o item focado sai do DOM.
      await page.evaluate(() => window.rteE2e.setToolbar('toolbar', 'minimal'));
      await expect(toolbarButton(page, 'toolbar', LAST)).toHaveCount(0);
      await expect
        .poll(() =>
          editorHost(page, 'toolbar').evaluate((host) =>
            host
              .querySelector('.rte-toolbar')
              ?.contains(document.activeElement),
          ),
        )
        .toBe(true);
      expect(await focusedLabel(page)).toBe(FIRST);
      await settlePage(page);
      expect(await touched(page)).toBe(false);
      await page.keyboard.press('Escape');
      await expect(editableOf(page, 'toolbar')).toBeFocused();
      expect(await touched(page)).toBe(false);
    });

    test('item inaplicável recebe foco com aria-disabled e Enter não faz nada', async ({
      page,
    }) => {
      await loadDoc(page, 'toolbar', '<p>abcd</p>');
      await selectIn(page, 'toolbar', 'abcd', 2);
      const before = await rteHtml(page, 'toolbar');
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, 'Code language');
      const trigger = toolbarButton(page, 'toolbar', 'Code language');
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();
      expect(await rteHtml(page, 'toolbar')).toBe(before);
      expect(await touched(page)).toBe(false);
    });

    test('Alt+F10 foca a barra; Escape volta ao editável com a seleção', async ({
      page,
    }) => {
      await loadDoc(page, 'toolbar', '<p>abcd</p>');
      await selectIn(page, 'toolbar', 'abcd', 2);
      await page.keyboard.press('Alt+F10');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      await expect(editableOf(page, 'toolbar')).toBeFocused();
      await expectSelection(page, 'toolbar', { from: 3, to: 3 });
      await page.keyboard.type('X');
      await expect.poll(() => rteHtml(page, 'toolbar')).toBe('<p>abXcd</p>');
      expect(await touched(page)).toBe(false);
    });

    test('Enter em Bold aplica à seleção e devolve o foco ao editável', async ({
      page,
    }) => {
      await loadDoc(page, 'toolbar', '<p>abcd</p>');
      await selectIn(page, 'toolbar', 'abcd', 0, 2);
      // Texto selecionado: o menu flutuante (05b2b) vê o primeiro Alt+F10;
      // o segundo vai dele à barra (M12).
      await expectFloating(page, 'toolbar', 'text');
      await page.keyboard.press('Alt+F10');
      await expect(
        editorHost(page, 'toolbar').locator('.rte-floating--text :focus'),
      ).toHaveCount(1);
      await page.keyboard.press('Alt+F10');
      await arrowToButton(page, 'Bold');
      const bold = toolbarButton(page, 'toolbar', 'Bold');
      await expect(bold).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Enter');
      await expect
        .poll(() => rteHtml(page, 'toolbar'))
        .toBe('<p><strong>ab</strong>cd</p>');
      await expect(editableOf(page, 'toolbar')).toBeFocused();
      await expect(bold).toHaveAttribute('aria-pressed', 'true');
      await expectSelection(page, 'toolbar', { from: 1, to: 3 });
      // A seleção continua a mesma: digitar troca o trecho em negrito.
      await page.keyboard.type('Z');
      await expect
        .poll(() => rteHtml(page, 'toolbar'))
        .toBe('<p><strong>Z</strong>cd</p>');
      expect(await touched(page)).toBe(false);
      await settlePage(page);
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });
  });
}
