import { expect, test, type Page } from '@playwright/test';
import {
  editableOf,
  editorHost,
  formState,
  gotoApp,
  waitForEditor,
} from './helpers/app';
import {
  expectFloating,
  floatingMenu,
  focusInMenu,
  waitFloatingReady,
} from './helpers/floating';
import {
  expectSelection,
  focusedLabel,
  frames,
  loadDoc,
  rteHtml,
  selectIn,
} from './helpers/toolbar';

// N23 (spec 05b2b, R6, R7): teclado e foco dos menus flutuantes com o teclado
// real. O foco nunca sai do editável ao aparecer; o menu não entra na ordem de
// `Tab`; `Alt+F10` nos três pontos de partida; setas, `Home`/`End` e `rtl`;
// `Escape`/`Tab` de dentro voltam ao editável com a seleção e o texto digitado
// cai no lugar; `focusFloatingMenu()`; nenhum `touched`.

const ID = 'floating';
const FIRST = 'Undo';

async function ready(page: Page): Promise<string> {
  await waitForEditor(page, ID);
  await expect.poll(() => rteHtml(page, ID)).toContain('Segundo parágrafo.');
  await waitFloatingReady(page, ID);
  return rteHtml(page, ID);
}

function touched(page: Page): Promise<boolean> {
  return formState(page, ID).then((s) => s.touched);
}

/** O elemento focado não está em nenhum menu flutuante. */
async function focusOutsideMenus(page: Page): Promise<void> {
  expect(await focusInMenu(page, ID)).toBe(false);
}

/** Rótulos dos itens do menu `kind`, na ordem do DOM. */
function itemLabels(page: Page, kind: 'text' | 'link' | 'table' | 'image') {
  return floatingMenu(page, ID, kind)
    .locator('.rte-toolbar__button, a.rte-floating__link')
    .evaluateAll((els) =>
      els.map(
        (el) => el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '',
      ),
    );
}

for (const zone of [false, true]) {
  test.describe(`N23 (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/floating', { zone });
      await ready(page);
    });

    test('o foco nunca sai do editável ao aparecer, trocar de tipo, reposicionar e ocultar', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Segundo', 0, 0);
      await page.evaluate(() => {
        const w = window as unknown as { __outside: string[] };
        w.__outside = [];
        document.addEventListener('focusin', (e) => {
          const target = e.target as Element;
          if (!target.closest('.ProseMirror'))
            w.__outside.push(
              `${target.tagName}.${target.className}[${target.getAttribute('aria-label') ?? ''}]`,
            );
        });
      });
      await expectFloating(page, ID, null);
      const steps: [
        () => Promise<void>,
        'text' | 'link' | 'table' | 'image',
      ][] = [
        [() => selectIn(page, ID, 'Segundo'), 'text'],
        [() => selectIn(page, ID, 'um link', 2, 2), 'link'],
        [
          async () => {
            await editableOf(page, ID)
              .locator('td', { hasText: 'A1' })
              .scrollIntoViewIfNeeded();
            await selectIn(page, ID, 'A1', 1, 1);
          },
          'table',
        ],
        [
          async () => {
            await editableOf(page, ID)
              .locator('figure img')
              .scrollIntoViewIfNeeded();
            // A imagem do fixture tem 1 x 1 px e o menu de tabela aberto pode
            // cobri-la: o clique real está no N21/N24; aqui, o comando.
            await editorHost(page, ID).evaluate((host) => {
              const editor = window.rteE2e.getRteEditor(host);
              let at = -1;
              editor?.state.doc.descendants((node, pos) => {
                if (at < 0 && node.type.name === 'rtImage') at = pos;
                return at < 0;
              });
              editor?.chain().focus().setNodeSelection(at).run();
            });
          },
          'image',
        ],
      ];
      for (const [go, kind] of steps) {
        await go();
        await expectFloating(page, ID, kind);
        await frames(page);
        await expect(editableOf(page, ID)).toBeFocused();
      }
      await page.mouse.wheel(0, 40);
      await frames(page);
      await selectIn(page, ID, 'Segundo parágrafo.', 2, 2);
      await expectFloating(page, ID, null);
      await frames(page);
      expect(
        await page.evaluate(
          () => (window as unknown as { __outside: string[] }).__outside,
        ),
      ).toEqual([]);
      expect(await touched(page)).toBe(false);
    });

    test('Tab e Shift+Tab: página → barra → editável → página, com o menu visível, sem parada nele', async ({
      page,
    }) => {
      // Documento curto, só com o texto do menu (a tabela larga e o `Tab` têm
      // um caso próprio abaixo, ruling 10).
      await loadDoc(page, ID, '<p>abcdef</p>');
      const editable = editableOf(page, ID);
      await page.locator('#before-floating').focus();
      await page.keyboard.press('Tab');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('Tab');
      await expect(editable).toBeFocused();

      await selectIn(page, ID, 'abcdef', 1, 4);
      await expectFloating(page, ID, 'text');
      // nenhum item do menu entra na ordem de Tab
      await expect(
        floatingMenu(page, ID, 'text').locator('[tabindex="0"]'),
      ).toHaveCount(0);
      await expect(
        editorHost(page, ID).locator('.rte-floating [tabindex="0"]'),
      ).toHaveCount(0);

      await page.keyboard.press('Tab');
      await expect(page.locator('#after-floating')).toBeFocused();
      await focusOutsideMenus(page);

      await page.keyboard.press('Shift+Tab');
      await expect(editable).toBeFocused();
      // (no Firefox o foco por teclado recolhe a seleção, então o menu não volta)
      await focusOutsideMenus(page);
      await page.keyboard.press('Shift+Tab');
      expect(await focusedLabel(page)).toBe(FIRST);
      await focusOutsideMenus(page);
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('#before-floating')).toBeFocused();
    });

    test('Shift+Tab do editável com o menu visível vai à barra, sem parar no menu (m6)', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      await page.keyboard.press('Shift+Tab');
      expect(await focusedLabel(page)).toBe(FIRST);
      await focusOutsideMenus(page);
      expect(await touched(page)).toBe(false);
    });

    test('Alt+F10: do editável com menu vai ao menu; do menu à barra; sem menu, à barra', async ({
      page,
    }) => {
      // 1. editável com menu visível → item ativo do menu
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      expect(await touched(page)).toBe(false);
      await page.keyboard.press('Alt+F10');
      expect(await focusInMenu(page, ID)).toBe(true);
      expect(await focusedLabel(page)).toBe('Bold');
      expect(await touched(page)).toBe(false);

      // 2. dentro do menu → barra
      await page.keyboard.press('Alt+F10');
      expect(await focusedLabel(page)).toBe(FIRST);
      await focusOutsideMenus(page);
      // a barra tem o foco, então o menu fica oculto; Escape devolve ao editável
      await page.keyboard.press('Escape');
      await expect(editableOf(page, ID)).toBeFocused();
      await expectFloating(page, ID, 'text');

      // 3. sem menu → barra
      await selectIn(page, ID, 'Segundo parágrafo.', 2, 2);
      await expectFloating(page, ID, null);
      await page.keyboard.press('Alt+F10');
      expect(await focusedLabel(page)).toBe(FIRST);
      await page.keyboard.press('Escape');
      await expect(editableOf(page, ID)).toBeFocused();
      expect(await touched(page)).toBe(false);
    });

    test('setas circulares, Home/End e item ativo lembrado', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      const labels = await itemLabels(page, 'text');
      expect(labels.length).toBeGreaterThan(5);
      const last = labels[labels.length - 1]!;
      await page.keyboard.press('Alt+F10');
      expect(await focusedLabel(page)).toBe(labels[0]);
      await page.keyboard.press('ArrowRight');
      expect(await focusedLabel(page)).toBe(labels[1]);
      await page.keyboard.press('End');
      expect(await focusedLabel(page)).toBe(last);
      await page.keyboard.press('ArrowRight');
      expect(await focusedLabel(page)).toBe(labels[0]);
      await page.keyboard.press('ArrowLeft');
      expect(await focusedLabel(page)).toBe(last);
      await page.keyboard.press('Home');
      expect(await focusedLabel(page)).toBe(labels[0]);

      // item ativo lembrado: dois passos, volta ao editável, de novo ao menu
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      const third = labels[2];
      expect(await focusedLabel(page)).toBe(third);
      await page.keyboard.press('Escape');
      await expect(editableOf(page, ID)).toBeFocused();
      await expectFloating(page, ID, 'text');
      await page.keyboard.press('Alt+F10');
      expect(await focusedLabel(page)).toBe(third);
      expect(await touched(page)).toBe(false);
    });

    test('rtl: ArrowLeft avança e ArrowRight recua', async ({ page }) => {
      await editorHost(page, ID).evaluate((host) =>
        host.setAttribute('dir', 'rtl'),
      );
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      const labels = await itemLabels(page, 'text');
      await page.keyboard.press('Alt+F10');
      expect(await focusedLabel(page)).toBe(labels[0]);
      await page.keyboard.press('ArrowLeft');
      expect(await focusedLabel(page)).toBe(labels[1]);
      await page.keyboard.press('ArrowRight');
      expect(await focusedLabel(page)).toBe(labels[0]);
      await page.keyboard.press('ArrowRight');
      expect(await focusedLabel(page)).toBe(labels[labels.length - 1]);
    });

    test('itens inaplicáveis continuam focáveis (aria-disabled): tabela com span 100', async ({
      page,
    }) => {
      // célula `colspan` no limite: as operações de linha/coluna ficam aria-disabled
      const td = (text: string, attrs = '') =>
        `<td${attrs}><p>${text}</p></td>`;
      const tr = (...cells: string[]) => `<tr>${cells.join('')}</tr>`;
      const html =
        '<table><tbody>' +
        tr(td('X', ' colspan="100"'), td('Y', ' rowspan="100"')) +
        tr(td('C'), td('D', ' colspan="99"')) +
        Array.from({ length: 98 }, (_, i) =>
          tr(td(`e${i}e`, ' colspan="100"')),
        ).join('') +
        '</tbody></table>';
      await frames(page);
      await page.evaluate((h) => window.rteE2e.setValue('floating', h), html);
      await expect.poll(() => rteHtml(page, ID)).toContain('e97e');
      await selectIn(page, ID, 'C', 1, 1);
      await expectFloating(page, ID, 'table');
      const disabled = floatingMenu(page, ID, 'table').locator(
        '.rte-toolbar__button[aria-disabled="true"]',
      );
      await expect(disabled.first()).toBeAttached();
      await page.keyboard.press('Alt+F10');
      const before = await rteHtml(page, ID);
      for (let i = 0; i < 12; i++) {
        const onDisabled = await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-disabled') === 'true',
        );
        if (onDisabled) break;
        await page.keyboard.press('ArrowRight');
      }
      expect(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-disabled'),
        ),
      ).toBe('true');
      await page.keyboard.press('Enter');
      expect(await rteHtml(page, ID)).toBe(before);
      expect(await focusInMenu(page, ID)).toBe(true);
    });

    for (const key of ['Escape', 'Tab', 'Shift+Tab'] as const) {
      test(`${key} de dentro do menu volta ao editável com a mesma seleção e o texto cai no lugar`, async ({
        page,
      }) => {
        await loadDoc(page, ID, '<p>abcdef</p>');
        await selectIn(page, ID, 'abcdef', 2, 4);
        await expectFloating(page, ID, 'text');
        await expectSelection(page, ID, { from: 3, to: 5 });
        await page.keyboard.press('Alt+F10');
        expect(await focusInMenu(page, ID)).toBe(true);
        await page.keyboard.press(key);
        await expect(editableOf(page, ID)).toBeFocused();
        await expectSelection(page, ID, { from: 3, to: 5 });
        await page.keyboard.type('Z');
        await expect.poll(() => rteHtml(page, ID)).toBe('<p>abZef</p>');
        expect(await touched(page)).toBe(false);
      });
    }

    test('focusFloatingMenu(): true com menu visível, false sem menu', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Segundo parágrafo.', 2, 2);
      await expectFloating(page, ID, null);
      expect(
        await page.evaluate(() => window.rteE2e.focusFloatingMenu('floating')),
      ).toBe(false);
      await expect(editableOf(page, ID)).toBeFocused();

      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      expect(
        await page.evaluate(() => window.rteE2e.focusFloatingMenu('floating')),
      ).toBe(true);
      expect(await focusInMenu(page, ID)).toBe(true);
      expect(await touched(page)).toBe(false);
      await page.keyboard.press('Escape');
      await expect(editableOf(page, ID)).toBeFocused();
      expect(await touched(page)).toBe(false);
    });
  });
}
