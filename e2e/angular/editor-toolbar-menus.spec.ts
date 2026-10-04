import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  editableOf,
  editorHost,
  formState,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import {
  arrowToButton,
  expectSelection,
  focusedLabel,
  frames,
  loadDoc,
  menuOf,
  menuRect,
  openMenu,
  rteHtml,
  selectIn,
  toolbarButton,
} from './helpers/toolbar';

// N10 (spec 05b1, R4, U6, U7): menus da barra pelo padrão APG *menu button*
// em `popover="auto"` nativo, com o teclado e o mouse reais. Abrir por
// `Enter`/`Espaço`/`↓`/`↑` e clique; navegar (`↑`/`↓` circulares,
// `Home`/`End`, primeira letra); `Escape`, `Tab`, `Shift+Tab` e *light
// dismiss*; um menu aberto por vez; o menu é descendente do host e está no
// *top layer*; a posição fica inteira na viewport (vira para cima no pé da
// página, acompanha a rolagem de um contêiner, limita e rola por dentro numa
// viewport baixa); o foco no menu não toca o formulário (pendência da 05a).

const BLOCK = 'Text style';
const BLOCK_ITEMS = ['Paragraph', 'Heading 2', 'Heading 3', 'Heading 4'];
const MARGIN = 8;

/** Foca o gatilho `label` do editor `toolbar` pelo teclado (`Alt+F10` + setas). */
async function focusTrigger(page: Page, label: string): Promise<Locator> {
  await selectIn(page, 'toolbar', 'abcd', 2);
  await page.keyboard.press('Alt+F10');
  await arrowToButton(page, label);
  const trigger = toolbarButton(page, 'toolbar', label);
  await expect(trigger).toBeFocused();
  return trigger;
}

async function isOpen(menu: Locator): Promise<boolean> {
  return menu.evaluate((m) => m.matches(':popover-open'));
}

async function expectNoViolations(page: Page): Promise<void> {
  await settlePage(page);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/toolbar');
  await waitForEditor(page, 'toolbar');
  await loadDoc(page, 'toolbar', '<p>abcd</p>');
});

test('N10: Enter, Espaço e ↓ abrem no primeiro item, ↑ no último; Escape fecha e foca o gatilho', async ({
  page,
}) => {
  const trigger = await focusTrigger(page, BLOCK);
  const menu = await menuOf(page, 'toolbar', BLOCK);
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await trigger.getAttribute('aria-controls')).toBe(
    await menu.getAttribute('id'),
  );

  for (const [key, first] of [
    ['Enter', BLOCK_ITEMS[0]],
    [' ', BLOCK_ITEMS[0]],
    ['ArrowDown', BLOCK_ITEMS[0]],
    ['ArrowUp', BLOCK_ITEMS[3]],
  ] as const) {
    await page.keyboard.press(key === ' ' ? 'Space' : key);
    await expect(menu).toBeVisible();
    expect(await isOpen(menu)).toBe(true);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await focusedLabel(page), key).toBe(first);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
  }
  expect(await rteHtml(page, 'toolbar')).toBe('<p>abcd</p>');
  expect((await formState(page, 'toolbar')).touched).toBe(false);
  await expectNoViolations(page);
});

test('N10: ↑/↓ circulares, Home/End e busca pela primeira letra', async ({
  page,
}) => {
  await focusTrigger(page, BLOCK);
  await page.keyboard.press('Enter');
  const steps: [string, string][] = [
    ['ArrowDown', 'Heading 2'],
    ['ArrowDown', 'Heading 3'],
    ['End', 'Heading 4'],
    ['ArrowDown', 'Paragraph'],
    ['ArrowUp', 'Heading 4'],
    ['Home', 'Paragraph'],
    ['h', 'Heading 2'],
    ['h', 'Heading 3'],
    ['p', 'Paragraph'],
  ];
  for (const [key, label] of steps) {
    await page.keyboard.press(key);
    expect(await focusedLabel(page), key).toBe(label);
  }
  // Os itens do menu radio: `aria-checked` no bloco atual.
  const menu = await menuOf(page, 'toolbar', BLOCK);
  await expect(menu.getByRole('menuitemradio')).toHaveCount(4);
  await expect(
    menu.getByRole('menuitemradio', { name: 'Paragraph' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  expect(await rteHtml(page, 'toolbar')).toBe('<p>abcd</p>');
});

test('N10: Tab fecha e foca o editável; Shift+Tab fecha e foca o gatilho', async ({
  page,
}) => {
  const trigger = await focusTrigger(page, BLOCK);
  const menu = await menuOf(page, 'toolbar', BLOCK);
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(menu).toBeHidden();
  await expect(editableOf(page, 'toolbar')).toBeFocused();
  // O editável recebe o foco com a seleção de antes: digitar cai no lugar.
  await expectSelection(page, 'toolbar', { from: 3, to: 3 });
  await page.keyboard.type('X');
  await expect.poll(() => rteHtml(page, 'toolbar')).toBe('<p>abXcd</p>');

  await page.keyboard.press('Alt+F10');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  expect((await formState(page, 'toolbar')).touched).toBe(false);
});

test('N10: clique abre; clique fora fecha sem executar; abrir outro fecha o anterior; top layer', async ({
  page,
}) => {
  await selectIn(page, 'toolbar', 'abcd', 0, 2);
  const block = await openMenu(page, 'toolbar', BLOCK);
  // Descendente do host, no top layer.
  expect(
    await editorHost(page, 'toolbar').evaluate(
      (host, id) => {
        const menu = host.ownerDocument.getElementById(id);
        return !!menu && host.contains(menu) && menu.matches(':popover-open');
      },
      (await block.getAttribute('id')) ?? '',
    ),
  ).toBe(true);
  expect(await focusedLabel(page)).toBe('Paragraph');

  // Clique no gatilho de novo fecha (alterna).
  await toolbarButton(page, 'toolbar', BLOCK).click();
  await expect(block).toBeHidden();
  await expect(toolbarButton(page, 'toolbar', BLOCK)).toBeFocused();

  // Light dismiss: clique fora fecha sem executar nada.
  await openMenu(page, 'toolbar', BLOCK);
  const before = await rteHtml(page, 'toolbar');
  // Um ponto vazio à direita do conteúdo, na altura do gatilho (dentro da
  // viewport e longe da barra de rolagem).
  const box = await toolbarButton(page, 'toolbar', BLOCK).boundingBox();
  const size = page.viewportSize();
  if (!box || !size) throw new Error('gatilho sem caixa');
  const outside = { x: size.width - 40, y: box.y + box.height / 2 };
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.nodeName ?? null,
      outside,
    ),
  ).toMatch(/^(APP-ROOT|MAIN|SECTION|BODY|HTML)$/);
  await page.mouse.click(outside.x, outside.y);
  await expect(block).toBeHidden();
  expect(await rteHtml(page, 'toolbar')).toBe(before);
  // Fechado com o foco no menu (o clique num ponto não focável levou o foco
  // ao `body`): o `toggle` devolve o foco ao gatilho. O clique fora é uma
  // saída real do host (D11), então aqui o `touch` é legítimo.
  await expect(toolbarButton(page, 'toolbar', BLOCK)).toBeFocused();

  // Abrir outro menu fecha o anterior.
  await openMenu(page, 'toolbar', BLOCK);
  const align = await openMenu(page, 'toolbar', 'Alignment');
  expect(await isOpen(align)).toBe(true);
  expect(await isOpen(block)).toBe(false);
  await expect(
    editorHost(page, 'toolbar').locator('.rte-menu:popover-open'),
  ).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(align).toBeHidden();
  await expect(toolbarButton(page, 'toolbar', 'Alignment')).toBeFocused();
  expect(await rteHtml(page, 'toolbar')).toBe(before);
  await expectNoViolations(page);
});

test('N10: no pé da viewport o menu abre para cima e fica inteiro na tela', async ({
  page,
}) => {
  const trigger = toolbarButton(page, 'toolbar', 'Alignment');
  // Rola a página até a barra ficar no pé da viewport.
  await trigger.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    window.scrollBy(0, rect.bottom - window.innerHeight + 4);
  });
  await frames(page);
  const t = await trigger.evaluate((el) => el.getBoundingClientRect().toJSON());
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  expect(viewport.height - t.bottom).toBeLessThan(20);

  await openMenu(page, 'toolbar', 'Alignment');
  const rect = await menuRect(page, 'toolbar');
  // Para cima: o menu termina no topo do gatilho.
  expect(rect.bottom).toBeLessThanOrEqual(t.top + 1);
  expect(rect.top).toBeGreaterThanOrEqual(MARGIN - 0.5);
  expect(rect.left).toBeGreaterThanOrEqual(MARGIN - 0.5);
  expect(rect.right).toBeLessThanOrEqual(viewport.width - MARGIN + 0.5);
  expect(rect.bottom).toBeLessThanOrEqual(viewport.height - MARGIN + 0.5);
  // Alinhado ao início do gatilho.
  expect(Math.abs(rect.left - t.left)).toBeLessThanOrEqual(1);
  await expectNoViolations(page);
});

test('N10: dentro de um contêiner com rolagem o menu acompanha o gatilho', async ({
  page,
}) => {
  await waitForEditor(page, 'toolbar-scroll');
  const scroller = page.locator('#scroller');
  await scroller.scrollIntoViewIfNeeded();
  const trigger = toolbarButton(page, 'toolbar-scroll', 'Alignment');
  await openMenu(page, 'toolbar-scroll', 'Alignment');
  const top0 = (await menuRect(page, 'toolbar-scroll')).top;
  const t0 = await trigger.evaluate((el) => el.getBoundingClientRect().top);

  const delta = await scroller.evaluate((el) => {
    const before = el.scrollTop;
    el.scrollTop = before + 60;
    return el.scrollTop - before;
  });
  expect(delta).toBe(60);
  await expect
    .poll(async () => (await menuRect(page, 'toolbar-scroll')).top)
    .toBeCloseTo(top0 - delta, 0);
  const top1 = (await menuRect(page, 'toolbar-scroll')).top;
  const t1 = await trigger.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(t0 - t1 - delta)).toBeLessThanOrEqual(1);
  expect(Math.abs(top0 - top1 - delta)).toBeLessThanOrEqual(1);
  // Continua aberto (rolar não fecha o popover).
  expect(
    await editorHost(page, 'toolbar-scroll')
      .locator('.rte-menu:popover-open')
      .count(),
  ).toBe(1);
  await expectNoViolations(page);
});

test('N10: viewport baixa limita o menu, que rola por dentro', async ({
  page,
}) => {
  const trigger = toolbarButton(page, 'toolbar', 'Text color');
  const toTop = () =>
    trigger.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 20),
    );
  await toTop();
  await openMenu(page, 'toolbar', 'Text color');
  const size = page.viewportSize();
  if (!size) throw new Error('sem viewport');
  await page.setViewportSize({ width: size.width, height: 220 });
  // O WebKit muda a rolagem da página ao encolher a viewport: o gatilho volta
  // ao topo pela rolagem (que também reposiciona o menu aberto).
  await toTop();
  const menu = editorHost(page, 'toolbar').locator('.rte-menu:popover-open');
  await expect(menu).toHaveCount(1);
  await expect
    .poll(async () => {
      const r = await menuRect(page, 'toolbar');
      const t = await trigger.evaluate(
        (el) => el.getBoundingClientRect().bottom,
      );
      const h = await page.evaluate(
        () => document.documentElement.clientHeight,
      );
      return (
        Math.abs(r.top - t) <= 1 &&
        r.bottom <= h - MARGIN + 0.5 &&
        r.top >= MARGIN - 0.5
      );
    })
    .toBe(true);
  const { scroll, client } = await menu.evaluate((m) => ({
    scroll: m.scrollHeight,
    client: m.clientHeight,
  }));
  expect(scroll).toBeGreaterThan(client);
  // A rolagem interna alcança o último item ("Default color").
  await page.keyboard.press('End');
  expect(await focusedLabel(page)).toBe('Default color');
  await expect(menu.locator('.rte-menu__item').last()).toBeInViewport();
  await expectNoViolations(page);
});
