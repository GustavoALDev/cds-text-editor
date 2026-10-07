import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  appUrl,
  editableOf,
  editorHost,
  gotoApp,
  waitForEditor,
} from './helpers/app';
import {
  arrowToButton,
  focusedLabel,
  loadDoc,
  openMenu,
  rteHtml,
  selectIn,
  toolbarButton,
} from './helpers/toolbar';

// N14 (spec 05b1, R14, R7, R15): axe sem violações `serious`/`critical` com a
// barra `full`, sem menu e com o menu `Text color` aberto, em claro, escuro e
// `forced-colors`; foco visível (`outline` de `--rte-focus-width`) em botões e
// itens; alvos >= 24 x 24 com a densidade padrão e com 0,75; `disabled` e
// `readonly` tiram os botões da ordem de Tab; casca → editor sem salto da
// moldura (e o texto do `blockType` não muda a largura do botão); troca de
// idioma ao vivo nos nomes, dicas e no texto do `blockType`, sem mudar o
// documento.

const MENUS: { label: string; doc: string; select: string }[] = [
  { label: 'Text style', doc: '<p>ab</p>', select: 'ab' },
  { label: 'Text color', doc: '<p>ab</p>', select: 'ab' },
  { label: 'Highlight', doc: '<p>ab</p>', select: 'ab' },
  { label: 'Alignment', doc: '<p>ab</p>', select: 'ab' },
  {
    label: 'Code language',
    doc: '<pre><code>x = 1</code></pre>',
    select: 'x = 1',
  },
  { label: 'Table', doc: '<p>ab</p>', select: 'ab' },
  { label: 'Callout box', doc: '<p>ab</p>', select: 'ab' },
];

async function severe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
}

/** Altura da moldura do editor `toolbar`. */
function frameHeight(page: Page): Promise<number> {
  return editorHost(page, 'toolbar')
    .locator('.rte-editor__frame')
    .evaluate((el) => el.getBoundingClientRect().height);
}

/** Largura e altura de cada elemento do locator. */
function sizes(locator: Locator) {
  return locator.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        name:
          el.getAttribute('aria-label') ??
          el.querySelector('.rte-menu__label')?.textContent ??
          '',
        width: r.width,
        height: r.height,
      };
    }),
  );
}

function tooSmall(list: { name: string; width: number; height: number }[]) {
  return list.filter((s) => s.width < 24 || s.height < 24);
}

for (const scheme of ['light', 'dark', 'forced'] as const) {
  test(`N14 (${scheme}): axe sem violações serious/critical, sem menu e com menu aberto`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    if (scheme === 'forced') {
      await page.emulateMedia({ forcedColors: 'active' });
    } else {
      await page.emulateMedia({ colorScheme: scheme });
    }
    // Firefox não reavalia @media de folhas já carregadas ao mudar a
    // emulação: a emulação vem antes da carga (como no tema).
    await gotoApp(page, '/toolbar');
    await waitForEditor(page, 'toolbar');
    if (scheme === 'forced') {
      const active = await page.evaluate(
        () => matchMedia('(forced-colors: active)').matches,
      );
      // No Chromium a emulação funciona: exigir, para não esconder regressão.
      if (browserName === 'chromium') expect(active).toBe(true);
      test.skip(
        !active,
        `${browserName}: emulateMedia({forcedColors}) não ativa (forced-colors: active) neste motor`,
      );
    }
    expect(await severe(page)).toEqual([]);

    await loadDoc(page, 'toolbar', '<p>ab</p>');
    await selectIn(page, 'toolbar', 'ab', 0, 1);
    await openMenu(page, 'toolbar', 'Text color');
    expect(await severe(page)).toEqual([]);
  });
}

test('N14: foco visível em botão e item de menu (outline de --rte-focus-width)', async ({
  page,
}) => {
  await gotoApp(page, '/toolbar');
  await waitForEditor(page, 'toolbar');
  await loadDoc(page, 'toolbar', '<p>ab</p>');
  const outline = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return {
        width: s.outlineWidth,
        style: s.outlineStyle,
        token: s.getPropertyValue('--rte-focus-width').trim(),
      };
    });
  await page.locator('#before-toolbar').focus();
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('Undo');
  const button = await outline();
  expect(button.style).toBe('solid');
  expect(button.width).toBe(button.token);
  expect(button.width).toBe('2px');

  await arrowToButton(page, 'Text style');
  await page.keyboard.press('Enter');
  expect(await focusedLabel(page)).toBe('Paragraph');
  const item = await outline();
  expect(item.style).toBe('solid');
  expect(item.width).toBe(item.token);
});

for (const density of [null, '0.75'] as const) {
  test(`N14: alvos >= 24 x 24 (densidade ${density ?? 'padrão'})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoApp(page, '/toolbar');
    await waitForEditor(page, 'toolbar');
    const host = editorHost(page, 'toolbar');
    if (density) {
      await host.evaluate(
        (el, d) => el.style.setProperty('--rte-density', d),
        density,
      );
    }
    const buttons = await sizes(
      host.locator('.rte-toolbar > .rte-toolbar__button'),
    );
    expect(buttons.length).toBeGreaterThan(25);
    expect(tooSmall(buttons)).toEqual([]);

    for (const menu of MENUS) {
      await loadDoc(page, 'toolbar', menu.doc);
      await selectIn(page, 'toolbar', menu.select, 1);
      const opened = await openMenu(page, 'toolbar', menu.label);
      const items = await sizes(opened.locator('.rte-menu__item'));
      expect(items.length, menu.label).toBeGreaterThan(1);
      expect(tooSmall(items), menu.label).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(opened).toBeHidden();
    }
  });
}

test('N14 (R7): disabled e readonly tiram os botões da ordem de Tab; voltar reabilita', async ({
  page,
}) => {
  await gotoApp(page, '/toolbar');
  await waitForEditor(page, 'toolbar');
  const host = editorHost(page, 'toolbar');
  const enabledButtons = () =>
    host.locator('.rte-toolbar > .rte-toolbar__button:not(:disabled)').count();
  const before = page.locator('#before-toolbar');

  await page.evaluate(() => window.rteE2e.toggle('disabled'));
  await expect.poll(enabledButtons).toBe(0);
  await before.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#after-toolbar')).toBeFocused();
  await page.evaluate(() => window.rteE2e.toggle('disabled'));
  await expect.poll(enabledButtons).toBeGreaterThan(25);

  await page.evaluate(() => window.rteE2e.toggle('readonly'));
  await expect.poll(enabledButtons).toBe(0);
  await before.focus();
  await page.keyboard.press('Tab');
  // `readonly` continua focável (05a), os botões não.
  await expect(editableOf(page, 'toolbar')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(before).toBeFocused();
  await page.evaluate(() => window.rteE2e.toggle('readonly'));
  await expect.poll(enabledButtons).toBeGreaterThan(25);

  await before.focus();
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('Undo');
});

for (const width of [1280, 654, 360]) {
  test(`N14 (R7): casca → editor sem salto da moldura (largura ${width})`, async ({
    browser,
    page,
  }) => {
    const noJs = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width, height: 800 },
    });
    const shell = await noJs.newPage();
    await shell.goto(appUrl('/toolbar'));
    await expect(
      editorHost(shell, 'toolbar').locator('.rte-editor__shell'),
    ).toBeVisible();
    // Na casca, todos os botões `disabled` nativos.
    expect(
      await editorHost(shell, 'toolbar')
        .locator('.rte-toolbar > .rte-toolbar__button:not(:disabled)')
        .count(),
    ).toBe(0);
    const shellHeight = await frameHeight(shell);
    await noJs.close();

    await page.setViewportSize({ width, height: 800 });
    await gotoApp(page, '/toolbar');
    await waitForEditor(page, 'toolbar');
    await expect(
      editorHost(page, 'toolbar').locator('.rte-editor__shell'),
    ).toHaveCount(0);
    expect(
      Math.abs((await frameHeight(page)) - shellHeight),
    ).toBeLessThanOrEqual(0.5);
  });
}

test('N14 (R7): o texto do blockType não muda a largura do botão (pt-BR e es)', async ({
  page,
}) => {
  // 654 px: largura em que, antes da correção, a barra quebrava linha
  // diferente com "Estilo do texto" (casca) e "Parágrafo" (Chromium).
  await page.setViewportSize({ width: 654, height: 800 });
  await gotoApp(page, '/toolbar');
  await waitForEditor(page, 'toolbar');
  const block = () =>
    editorHost(page, 'toolbar').evaluate((host) => {
      const button = host.querySelector('.rte-toolbar__text')?.parentElement
        ?.parentElement as HTMLElement;
      return {
        text: host.querySelector('.rte-toolbar__text')?.textContent?.trim(),
        width: button.getBoundingClientRect().width,
        toolbar: (
          host.querySelector('.rte-toolbar') as HTMLElement
        ).getBoundingClientRect().height,
      };
    });
  for (const [lang, label, paragraph] of [
    ['en', 'Text style', 'Paragraph'],
    ['pt-BR', 'Estilo do texto', 'Parágrafo'],
    ['es', 'Estilo de texto', 'Párrafo'],
  ] as const) {
    await page.evaluate((l) => window.rteE2e.setLang(l), lang);
    await loadDoc(
      page,
      'toolbar',
      '<p>a</p><h2>b</h2>',
      '<p>a</p><h2 id="rt-b">b</h2>',
    );
    await selectIn(page, 'toolbar', 'a', 0);
    await expect.poll(async () => (await block()).text).toBe(paragraph);
    // WCAG 2.5.3: o nome contém o texto visível (bloco atual) e o propósito
    await expect(toolbarButton(page, 'toolbar', label)).toHaveAccessibleName(
      `${paragraph}, ${label}`,
    );
    const atParagraph = await block();
    // Seleção mista: o botão mostra o nome do item, como na casca.
    await editableOf(page, 'toolbar').press('ControlOrMeta+A');
    await expect.poll(async () => (await block()).text).toBe(label);
    await expect(toolbarButton(page, 'toolbar', label)).toHaveAccessibleName(
      label,
    );
    const mixed = await block();
    expect(mixed.width, lang).toBe(atParagraph.width);
    expect(mixed.toolbar, lang).toBe(atParagraph.toolbar);
  }
});

test('N14 (R15): idioma ao vivo muda nomes, dicas e o texto do blockType sem mudar o documento', async ({
  page,
}) => {
  await gotoApp(page, '/toolbar');
  await waitForEditor(page, 'toolbar');
  await loadDoc(page, 'toolbar', '<p>ab</p>');
  await selectIn(page, 'toolbar', 'ab', 1);
  const html = await rteHtml(page, 'toolbar');
  const toolbar = editorHost(page, 'toolbar').locator('.rte-toolbar');
  for (const [lang, name, bold, color, paragraph, red] of [
    ['pt-BR', 'Formatação', 'Negrito', 'Cor do texto', 'Parágrafo', 'Vermelho'],
    ['es', 'Formato', 'Negrita', 'Color del texto', 'Párrafo', 'Rojo'],
    ['en', 'Formatting', 'Bold', 'Text color', 'Paragraph', 'Red'],
  ] as const) {
    await page.evaluate((l) => window.rteE2e.setLang(l), lang);
    await expect(toolbar).toHaveAttribute('aria-label', name);
    const boldButton = toolbarButton(page, 'toolbar', bold);
    await expect(boldButton).toHaveCount(1);
    await expect(boldButton).toHaveAttribute(
      'title',
      new RegExp(`^${bold} \\(`),
    );
    await expect(boldButton).toHaveAccessibleName(bold);
    await expect(
      editorHost(page, 'toolbar').locator('.rte-toolbar__text'),
    ).toHaveText(paragraph);
    const menu = await openMenu(page, 'toolbar', color);
    await expect(menu).toHaveAttribute('aria-label', color);
    await expect(menu.getByRole('menuitemradio', { name: red })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(await rteHtml(page, 'toolbar')).toBe(html);
  }
});
