import { expect, test, type Page } from '@playwright/test';
import {
  editableOf,
  editorHost,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import {
  arrowToButton,
  arrowToMenuItem,
  loadDoc,
  menuItem,
  menuOf,
  openMenu,
  rteHtml,
  selectIn,
  selectionOf,
  toolbarButton,
} from './helpers/toolbar';

// N11 (spec 05b1, R5, R8, R9, U4, U8, U13, U14): cada item da §4 pela
// interface real, por clique e por teclado (`Alt+F10`, setas, `Enter`), sobre
// um documento conhecido: o `getRteHtml` do editor vivo é o esperado (a mesma
// tabela de casos do unitário `toolbar-commands.spec.ts`, reescrita como
// dados), o foco volta ao editável e um `Mod+Z` volta ao inicial; o clique
// não tira a seleção (`mousedown` cancelado). R8: guarda de `colspan` 100 no
// menu de tabela. R9: paleta, aplicar e remover cores. Recursos desligados
// escondem os itens.

type Mode = 'click' | 'keyboard';

interface Case {
  /** Rótulo do botão (`aria-label`) na barra. */
  button: string;
  /** Item do menu (texto), quando o botão é um menu. */
  item?: string;
  doc: string;
  /** `getRteHtml` de `doc` quando ele não é canônico. */
  initial?: string;
  /** Texto e deslocamentos da seleção (como o `selectText` dos unitários). */
  select: [text: string, from?: number, to?: number];
  /** Preparação com o teclado real, com o foco no editável. */
  prepare?: (page: Page) => Promise<void>;
  expected: string;
  /** `false`: sem `Mod+Z` (desfazer/refazer e a lacuna do core no `setCallout`). */
  undoable?: false;
}

const P = '<p>ab</p>';
const LIST = '<ul><li><p>a</p></li><li><p>b</p></li></ul>';
const CODE = '<pre><code>x = 1</code></pre>';
const CALLOUT =
  '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">Information</p><p>ab</p></aside>';
const td = (text: string, attrs = '') => `<td${attrs}><p>${text}</p></td>`;
const th = (text: string, attrs = '') => `<th${attrs}><p>${text}</p></th>`;
const tr = (...cells: string[]) => `<tr>${cells.join('')}</tr>`;
const table = (...rows: string[]) =>
  `<table><tbody>${rows.join('')}</tbody></table>`;
const TABLE = table(tr(td('a'), td('b')), tr(td('c'), td('d')));
const EMPTY_TD = '<td><p></p></td>';
const EMPTY_TH = '<th><p></p></th>';
const CALLOUT_TITLES = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
} as const;

const CASES: Case[] = [
  {
    button: 'Undo',
    doc: P,
    select: ['ab', 2],
    prepare: (page) => page.keyboard.type('c'),
    expected: P,
    undoable: false,
  },
  {
    button: 'Redo',
    doc: P,
    select: ['ab', 2],
    prepare: async (page) => {
      await page.keyboard.type('c');
      await page.keyboard.press('ControlOrMeta+Z');
    },
    expected: '<p>abc</p>',
    undoable: false,
  },
  {
    button: 'Text style',
    item: 'Paragraph',
    doc: '<h2>ab</h2>',
    initial: '<h2 id="rt-ab">ab</h2>',
    select: ['ab', 1],
    expected: P,
  },
  ...([2, 3, 4] as const).map((n): Case => ({
    button: 'Text style',
    item: `Heading ${n}`,
    doc: P,
    select: ['ab', 1],
    expected: `<h${n} id="rt-ab">ab</h${n}>`,
  })),
  ...(
    [
      ['Bold', 'strong'],
      ['Italic', 'em'],
      ['Underline', 'u'],
      ['Strikethrough', 's'],
      ['Inline code', 'code'],
      ['Superscript', 'sup'],
      ['Subscript', 'sub'],
    ] as const
  ).map(([button, tag]): Case => ({
    button,
    doc: P,
    select: ['ab', 0, 1],
    expected: `<p><${tag}>a</${tag}>b</p>`,
  })),
  {
    button: 'Text color',
    item: 'Red',
    doc: P,
    select: ['ab', 0, 1],
    expected:
      '<p><span data-rt-color="red" style="color: #b3261e">a</span>b</p>',
  },
  {
    button: 'Text color',
    item: 'Default color',
    doc: '<p><span data-rt-color="red">a</span>b</p>',
    initial:
      '<p><span data-rt-color="red" style="color: #b3261e">a</span>b</p>',
    select: ['ab', 0, 1],
    expected: P,
  },
  {
    button: 'Highlight',
    item: 'Yellow',
    doc: P,
    select: ['ab', 0, 1],
    expected:
      '<p><mark data-rt-color="yellow" style="background-color: #fff3a3">a</mark>b</p>',
  },
  {
    button: 'Highlight',
    item: 'Default color',
    doc: '<p><mark data-rt-color="green">a</mark>b</p>',
    initial:
      '<p><mark data-rt-color="green" style="background-color: #ccf2d1">a</mark>b</p>',
    select: ['ab', 0, 1],
    expected: P,
  },
  {
    button: 'Bulleted list',
    doc: P,
    select: ['ab', 1],
    expected: '<ul><li><p>ab</p></li></ul>',
  },
  {
    button: 'Numbered list',
    doc: P,
    select: ['ab', 1],
    expected: '<ol><li><p>ab</p></li></ol>',
  },
  {
    button: 'Task list',
    doc: P,
    select: ['ab', 1],
    expected:
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">ab</label></li></ul>',
  },
  {
    button: 'Increase indent',
    doc: LIST,
    select: ['b', 1],
    expected: '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>',
  },
  {
    button: 'Decrease indent',
    doc: '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>',
    select: ['b', 1],
    expected: LIST,
  },
  ...(
    [
      ['Align left', 'left'],
      ['Center', 'center'],
      ['Align right', 'right'],
      ['Justify', 'justify'],
    ] as const
  ).map(([item, value]): Case => ({
    button: 'Alignment',
    item,
    doc: P,
    select: ['ab', 1],
    expected: `<p style="text-align: ${value}">ab</p>`,
  })),
  {
    button: 'Quote',
    doc: P,
    select: ['ab', 1],
    expected: '<blockquote><p>ab</p></blockquote>',
  },
  {
    button: 'Code block',
    doc: P,
    select: ['ab', 1],
    expected: '<pre><code>ab</code></pre>',
  },
  {
    button: 'Code language',
    item: 'JavaScript',
    doc: CODE,
    select: ['x = 1', 1],
    expected: '<pre><code class="language-javascript">x = 1</code></pre>',
  },
  {
    button: 'Code language',
    item: 'Plain text',
    doc: '<pre><code class="language-javascript">x = 1</code></pre>',
    select: ['x = 1', 1],
    expected: CODE,
  },
  {
    button: 'Horizontal line',
    doc: P,
    select: ['ab', 2],
    expected: '<p>ab</p><hr><p></p>',
  },
  {
    button: 'Table',
    item: 'Insert table',
    doc: P,
    select: ['ab', 2],
    expected:
      '<p>ab</p>' +
      table(
        tr(EMPTY_TH, EMPTY_TH, EMPTY_TH),
        tr(EMPTY_TD, EMPTY_TD, EMPTY_TD),
        tr(EMPTY_TD, EMPTY_TD, EMPTY_TD),
      ),
  },
  {
    button: 'Table',
    item: 'Insert row above',
    doc: TABLE,
    select: ['c', 1],
    expected: table(
      tr(td('a'), td('b')),
      tr(EMPTY_TD, EMPTY_TD),
      tr(td('c'), td('d')),
    ),
  },
  {
    button: 'Table',
    item: 'Insert row below',
    doc: TABLE,
    select: ['c', 1],
    expected: table(
      tr(td('a'), td('b')),
      tr(td('c'), td('d')),
      tr(EMPTY_TD, EMPTY_TD),
    ),
  },
  {
    button: 'Table',
    item: 'Insert column before',
    doc: TABLE,
    select: ['b', 1],
    expected: table(
      tr(td('a'), EMPTY_TD, td('b')),
      tr(td('c'), EMPTY_TD, td('d')),
    ),
  },
  {
    button: 'Table',
    item: 'Insert column after',
    doc: TABLE,
    select: ['b', 1],
    expected: table(
      tr(td('a'), td('b'), EMPTY_TD),
      tr(td('c'), td('d'), EMPTY_TD),
    ),
  },
  {
    button: 'Table',
    item: 'Delete row',
    doc: TABLE,
    select: ['c', 1],
    expected: table(tr(td('a'), td('b'))),
  },
  {
    button: 'Table',
    item: 'Delete column',
    doc: TABLE,
    select: ['b', 1],
    expected: table(tr(td('a')), tr(td('c'))),
  },
  {
    button: 'Table',
    item: 'Merge cells',
    doc: TABLE,
    select: ['a', 1],
    // Seleção de células pelo teclado real (prosemirror-tables).
    prepare: (page) => page.keyboard.press('Shift+ArrowRight'),
    expected: table(tr(td('a</p><p>b', ' colspan="2"')), tr(td('c'), td('d'))),
  },
  {
    button: 'Table',
    item: 'Split cell',
    doc: table(tr(td('a', ' colspan="2"')), tr(td('c'), td('d'))),
    select: ['a', 1],
    expected: table(tr(td('a'), EMPTY_TD), tr(td('c'), td('d'))),
  },
  {
    button: 'Table',
    item: 'Header row',
    doc: TABLE,
    select: ['a', 1],
    expected: table(tr(th('a'), th('b')), tr(td('c'), td('d'))),
  },
  {
    button: 'Table',
    item: 'Header column',
    doc: TABLE,
    select: ['a', 1],
    expected: table(tr(th('a'), td('b')), tr(th('c'), td('d'))),
  },
  {
    button: 'Table',
    item: 'Delete table',
    doc: `${TABLE}<p>z</p>`,
    select: ['a', 1],
    expected: '<p>z</p>',
  },
  ...(['info', 'success', 'warning', 'danger'] as const).map(
    (variant): Case => ({
      button: 'Callout box',
      item: CALLOUT_TITLES[variant],
      doc: P,
      select: ['ab', 1],
      // Lacuna do core (unitário `toolbar-commands.spec.ts`): o `setCallout`
      // não desfaz.
      undoable: false,
      expected: `<aside class="rt-callout rt-callout--${variant}" role="note"><p class="rt-callout__title">${CALLOUT_TITLES[variant]}</p><p>ab</p></aside>`,
    }),
  ),
  {
    button: 'Callout box',
    item: 'Warning',
    doc: CALLOUT,
    select: ['ab', 1],
    expected:
      '<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title">Warning</p><p>ab</p></aside>',
  },
  {
    button: 'Callout box',
    item: 'Remove box',
    doc: CALLOUT,
    select: ['ab', 1],
    expected: P,
  },
  {
    button: 'Pull quote',
    doc: P,
    select: ['ab', 1],
    expected:
      '<figure class="rt-pullquote"><blockquote><p>ab</p></blockquote></figure>',
  },
  {
    button: 'Pull quote',
    doc: '<figure class="rt-pullquote"><blockquote><p>ab</p></blockquote></figure>',
    select: ['ab', 1],
    expected: P,
  },
  {
    button: '"Read also" box',
    doc: P,
    select: ['ab', 2],
    expected:
      '<p>ab</p><aside class="rt-read-also" role="note"><p class="rt-read-also__title">Read also</p><ul><li></li></ul></aside>',
  },
  {
    button: 'Clear formatting',
    doc: '<p><strong><em>a</em></strong><span data-rt-color="red">b</span>c</p>',
    initial:
      '<p><strong><em>a</em></strong><span data-rt-color="red" style="color: #b3261e">b</span>c</p>',
    select: ['abc'],
    expected: '<p>abc</p>',
  },
];

function label(c: Case): string {
  return `${c.button}${c.item ? ` → ${c.item}` : ''} em ${c.doc.slice(0, 40)}`;
}

/** Clique num botão comum: o `mousedown` não tira o foco nem a seleção (U4). */
async function clickKeepingSelection(page: Page, button: string) {
  const target = toolbarButton(page, 'toolbar', button);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`botão ${button} sem caixa`);
  const before = await selectionOf(page, 'toolbar');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(editableOf(page, 'toolbar')).toBeFocused();
  expect(await selectionOf(page, 'toolbar')).toEqual(before);
  await page.mouse.up();
}

async function act(page: Page, c: Case, mode: Mode): Promise<void> {
  if (mode === 'click') {
    if (!c.item) return clickKeepingSelection(page, c.button);
    const menu = await openMenu(page, 'toolbar', c.button);
    await menuItem(menu, c.item).click();
    await expect(menu).toBeHidden();
    return;
  }
  await page.keyboard.press('Alt+F10');
  await arrowToButton(page, c.button);
  await page.keyboard.press('Enter');
  if (!c.item) return;
  const menu = await menuOf(page, 'toolbar', c.button);
  await expect(menu).toBeVisible();
  await arrowToMenuItem(page, c.item);
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
}

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
    await expect(menuItem(menu, 'Insert table')).toHaveAttribute(
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
