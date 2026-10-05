import { expect, test } from '@playwright/test';
import {
  editableOf,
  editorHost,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import {
  loadDoc,
  menuItem,
  openMenu,
  rteHtml,
  selectIn,
  toolbarButton,
} from './helpers/toolbar';
import {
  act,
  CASES,
  EMPTY_TD,
  label,
  P,
  table,
  td,
  tr,
} from './helpers/toolbar-cases';

// N11 (spec 05b1, R5, R8, R9, U4, U8, U13, U14): cada item da §4 pela
// interface real, por clique e por teclado (`Alt+F10`, setas, `Enter`), sobre
// um documento conhecido: o `getRteHtml` do editor vivo é o esperado (a mesma
// tabela de casos do unitário `toolbar-commands.spec.ts`, reescrita como
// dados), o foco volta ao editável e um `Mod+Z` volta ao inicial; o clique
// não tira a seleção (`mousedown` cancelado). R8: guarda de `colspan` 100 no
// menu de tabela. R9: paleta, aplicar e remover cores. Recursos desligados
// escondem os itens.

test.describe('N11: comandos pela interface', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/toolbar');
    await waitForEditor(page, 'toolbar');
  });

  for (const c of CASES) {
    test(label(c), async ({ page }) => {
      for (const mode of ['click', 'keyboard'] as const) {
        await test.step(mode, async () => {
          await loadDoc(page, 'toolbar', c.doc, c.initial);
          const initial = await rteHtml(page, 'toolbar');
          await selectIn(page, 'toolbar', ...c.select);
          await c.prepare?.(page);
          await act(page, c, mode);
          await expect.poll(() => rteHtml(page, 'toolbar')).toBe(c.expected);
          // O foco volta ao editável (U4).
          await expect(editableOf(page, 'toolbar')).toBeFocused();
          if (c.undoable !== false) {
            await page.keyboard.press('ControlOrMeta+Z');
            await expect.poll(() => rteHtml(page, 'toolbar')).toBe(initial);
          }
        });
      }
      await settlePage(page);
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });
  }
});

// Atalhos do core corrigidos na revisão final (K1, K2): Ctrl+Shift+B é citação
// (o `Mod-B` do negrito roubava a tecla) e Ctrl+Shift+9 alterna tarefas.
test.describe('N11: atalhos de citação, tarefas e negrito', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/toolbar');
    await waitForEditor(page, 'toolbar');
  });

  for (const [keys, expected] of [
    ['ControlOrMeta+Shift+B', '<blockquote><p>ab</p></blockquote>'],
    ['ControlOrMeta+B', '<p><strong>ab</strong></p>'],
    [
      'ControlOrMeta+Shift+9',
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">ab</label></li></ul>',
    ],
  ] as const) {
    test(keys, async ({ page }) => {
      await loadDoc(page, 'toolbar', P);
      await selectIn(page, 'toolbar', 'ab', 0, 2);
      await page.keyboard.press(keys);
      await expect.poll(() => rteHtml(page, 'toolbar')).toBe(expected);
      await page.keyboard.press('ControlOrMeta+Z');
      await expect.poll(() => rteHtml(page, 'toolbar')).toBe(P);
    });
  }
});

test.describe('N11: guarda de tabela, cores e recursos', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/toolbar');
    await waitForEditor(page, 'toolbar');
  });

  test('R8: colspan 100 bloqueia Insert column after (motivo no title), Insert row below cria a linha, Insert table desabilitado', async ({
    page,
  }) => {
    // Linha 1: uma célula com colspan 100; linha 2: 100 células simples.
    const cells = Array.from({ length: 100 }, (_, i) => td(`k${i}k`));
    const doc = table(tr(td('X', ' colspan="100"')), tr(...cells));
    await loadDoc(page, 'toolbar', doc);
    await selectIn(page, 'toolbar', 'k50k', 1);

    const menu = await openMenu(page, 'toolbar', 'Table');
    const after = menuItem(menu, 'Insert column after');
    await expect(after).toHaveAttribute('aria-disabled', 'true');
    await expect(after).toHaveAttribute(
      'title',
      /Unavailable: a cell would span more than 100 rows or columns\./,
    );
    await expect(menuItem(menu, 'Insert column before')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(menuItem(menu, 'Insert table 3 × 3')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // `aria-disabled` conta como desabilitado para o Playwright: o clique
    // real do mouse vai mesmo assim (`force`).
    await after.click({ force: true });
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))),
    );
    expect(await rteHtml(page, 'toolbar')).toBe(doc);

    // A operação que não passa de 100 funciona: a linha nova na última linha.
    if (!(await menu.evaluate((m) => m.matches(':popover-open')))) {
      await openMenu(page, 'toolbar', 'Table');
    }
    const below = menuItem(menu, 'Insert row below');
    await expect(below).not.toHaveAttribute('aria-disabled', 'true');
    await below.click();
    await expect
      .poll(() => rteHtml(page, 'toolbar'))
      .toBe(
        table(
          tr(td('X', ' colspan="100"')),
          tr(...cells),
          tr(...Array.from({ length: 100 }, () => EMPTY_TD)),
        ),
      );
    await expect(editableOf(page, 'toolbar').locator('tr')).toHaveCount(3);
  });

  test('R9: os menus listam a paleta com amostra e nome; aplicar e remover pelo menu', async ({
    page,
  }) => {
    await loadDoc(page, 'toolbar', P);
    await selectIn(page, 'toolbar', 'ab', 0, 1);

    const text = await openMenu(page, 'toolbar', 'Text color');
    await expect(text.locator('.rte-menu__label')).toHaveText([
      'Gray',
      'Red',
      'Orange',
      'Green',
      'Blue',
      'Purple',
      'Pink',
      'Teal',
      'Default color',
    ]);
    await expect(text.locator('.rte-swatch[data-rte-color]')).toHaveCount(8);
    await menuItem(text, 'Red').click();
    await expect
      .poll(() => rteHtml(page, 'toolbar'))
      .toBe(
        '<p><span data-rt-color="red" style="color: #b3261e">a</span>b</p>',
      );
    // O item marcado segue a seleção; "Default color" remove a marca.
    await openMenu(page, 'toolbar', 'Text color');
    await expect(menuItem(text, 'Red')).toHaveAttribute('aria-checked', 'true');
    await expect(menuItem(text, 'Red')).toHaveClass(/rte-menu__item--checked/);
    await menuItem(text, 'Default color').click();
    await expect.poll(() => rteHtml(page, 'toolbar')).toBe(P);

    const mark = await openMenu(page, 'toolbar', 'Highlight');
    await expect(mark.locator('.rte-menu__label')).toHaveText([
      'Yellow',
      'Green',
      'Blue',
      'Pink',
      'Orange',
      'Purple',
      'Default color',
    ]);
    await expect(mark.locator('.rte-swatch[data-rte-color]')).toHaveCount(6);
    await menuItem(mark, 'Yellow').click();
    await expect
      .poll(() => rteHtml(page, 'toolbar'))
      .toBe(
        '<p><mark data-rt-color="yellow" style="background-color: #fff3a3">a</mark>b</p>',
      );
    await openMenu(page, 'toolbar', 'Highlight');
    await expect(menuItem(mark, 'Yellow')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await menuItem(mark, 'Default color').click();
    await expect.poll(() => rteHtml(page, 'toolbar')).toBe(P);
  });

  test('recursos desligados escondem os itens', async ({ page }) => {
    await waitForEditor(page, 'toolbar-nofeat');
    for (const button of [
      'Table',
      'Text color',
      'Highlight',
      'Callout box',
      'Pull quote',
      '"Read also" box',
    ]) {
      await expect(
        toolbarButton(page, 'toolbar-nofeat', button),
        button,
      ).toHaveCount(0);
    }
    for (const button of ['Bold', 'Quote', 'Code block', 'Task list']) {
      await expect(toolbarButton(page, 'toolbar-nofeat', button)).toHaveCount(
        1,
      );
    }
    // Ainda no full: o mesmo preset com os recursos ligados mostra os itens.
    await expect(toolbarButton(page, 'toolbar', 'Table')).toHaveCount(1);
    expect(
      await editorHost(page, 'toolbar-nofeat')
        .locator(
          '.rte-toolbar > .rte-toolbar__separator + .rte-toolbar__separator',
        )
        .count(),
    ).toBe(0);
  });
});
