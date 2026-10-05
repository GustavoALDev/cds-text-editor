import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import {
  expectFloating,
  floatingMenu,
  waitFloatingReady,
} from './helpers/floating';
import {
  focusedLabel,
  frames,
  rteHtml,
  selectIn,
  toolbarButton,
} from './helpers/toolbar';

// N21 (spec 05b2b, R2–R4, R11): a exibição dos menus flutuantes na página
// `floating`, com mouse, teclado e a interface. Um menu por vez, o tipo vem
// da seleção (`image > link > text > table`), `Escape` o dispensa até a
// identidade mudar, foco fora do editável, `disabled`/`readonly`, diálogo e
// composição de IME o ocultam, e `floatingMenus` troca ao vivo sem recarregar.

const ID = 'floating';

async function ready(page: Page): Promise<void> {
  await waitForEditor(page, ID);
  await expect.poll(() => rteHtml(page, ID)).toContain('Segundo parágrafo.');
  await waitFloatingReady(page, ID);
}

/** Cursor recolhido em `text`, `at` caracteres depois do início. */
function cursor(page: Page, text: string, at: number): Promise<void> {
  return selectIn(page, ID, text, at, at);
}

/** Tipo da seleção atual do documento. */
function selectionType(page: Page): Promise<string> {
  return editorHost(page, ID).evaluate((host) => {
    const sel = window.rteE2e.getRteEditor(host)?.state.selection;
    return sel ? String(sel.toJSON().type) : '';
  });
}

/** Retângulo (viewport) de `word` dentro do bloco que a contém. */
async function wordBox(
  page: Page,
  block: string,
  word: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const target = editableOf(page, ID).locator(block, { hasText: word }).first();
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((el, word) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(word);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + word.length);
      const b = r.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    throw new Error('palavra ausente');
  }, word);
}

for (const zone of [false, true]) {
  test.describe(`N21 (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/floating', { zone });
      await ready(page);
    });

    test('carga sem foco: nenhum menu', async ({ page }) => {
      await expectFloating(page, ID, null);
    });

    test('arrasto pelo mouse: oculto durante, texto depois do pointerup', async ({
      page,
    }) => {
      const box = await wordBox(page, 'p', 'Segundo');
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + 1, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 1, y, { steps: 8 });
      // há seleção de texto, mas o botão ainda está pressionado
      await expect
        .poll(() =>
          editorHost(page, ID).evaluate(
            (host) => !window.rteE2e.getRteEditor(host)?.state.selection.empty,
          ),
        )
        .toBe(true);
      await expectFloating(page, ID, null);
      await page.mouse.up();
      await expectFloating(page, ID, 'text');
    });

    test('teclado: Shift+ArrowRight seleciona e mostra o menu de texto', async ({
      page,
    }) => {
      await cursor(page, 'Segundo', 0);
      await expectFloating(page, ID, null);
      for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
      await expectFloating(page, ID, 'text');
    });

    test('cursor no link: menu de link', async ({ page }) => {
      await cursor(page, 'um link', 2);
      await expectFloating(page, ID, 'link');
    });

    test('clique na imagem e setas até ela: menu de imagem', async ({
      page,
    }) => {
      await editableOf(page, ID).locator('figure img').click();
      await expectFloating(page, ID, 'image');
      expect(await selectionType(page)).toBe('node');

      await cursor(page, 'Segundo parágrafo.', 18);
      await expectFloating(page, ID, null);
      await page.keyboard.press('ArrowRight');
      expect(await selectionType(page)).toBe('node');
      await expectFloating(page, ID, 'image');
    });

    test('tabela: cursor, CellSelection por arrasto e texto numa célula', async ({
      page,
      browserName,
    }) => {
      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');

      // arrasto de A1 a B2 (CellSelection)
      await cursor(page, 'Segundo parágrafo.', 2);
      await expectFloating(page, ID, null);
      await wordBox(page, 'td', 'B2'); // rola até a tabela
      if (browserName === 'webkit') {
        // O arrasto sintético do Playwright no WebKit não chega ao
        // `prosemirror-tables` (fica seleção de texto): usa o comando.
        await editorHost(page, ID).evaluate((host) => {
          const editor = window.rteE2e.getRteEditor(host);
          const cells: number[] = [];
          editor?.state.doc.descendants((node, pos) => {
            if (node.type.name === 'tableCell') cells.push(pos);
            return cells.length < 4;
          });
          editor
            ?.chain()
            .focus()
            .setCellSelection({ anchorCell: cells[0]!, headCell: cells[3]! })
            .run();
        });
      } else {
        const from = await wordBox(page, 'td', 'A1');
        const to = await wordBox(page, 'td', 'B2');
        await page.mouse.move(
          from.x + from.width / 2,
          from.y + from.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
          steps: 8,
        });
        await page.mouse.up();
      }
      await expect.poll(() => selectionType(page)).toBe('cell');
      await expectFloating(page, ID, 'table');

      // texto selecionado numa célula: o de texto vence o de tabela
      await selectIn(page, ID, 'A2');
      await expectFloating(page, ID, 'text');
    });

    test('Escape dispensa até a identidade mudar', async ({ page }) => {
      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await page.keyboard.press('Escape');
      await expectFloating(page, ID, null);
      await expect(editableOf(page, ID)).toBeFocused();
      // digitar na mesma célula não traz o menu de volta
      await page.keyboard.type('xy');
      await expect.poll(() => rteHtml(page, ID)).toContain('Axy1');
      await expectFloating(page, ID, null);
      // outra tabela: identidade nova (rolada para a área visível do contêiner)
      await editableOf(page, ID)
        .locator('td', { hasText: 'Larga' })
        .scrollIntoViewIfNeeded();
      await cursor(page, 'Larga', 2);
      await expectFloating(page, ID, 'table');
    });

    test('foco na barra oculta; Escape devolve ao editável e o menu volta', async ({
      page,
    }) => {
      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await toolbarButton(page, ID, 'Undo').focus();
      await expectFloating(page, ID, null);
      await page.keyboard.press('Escape');
      await expect(editableOf(page, ID)).toBeFocused();
      await expectFloating(page, ID, 'table');
    });

    test('disabled e readonly ocultam o menu; ao voltar, volta', async ({
      page,
    }) => {
      for (const name of ['disabled', 'readonly'] as const) {
        await cursor(page, 'um link', 2);
        await expectFloating(page, ID, 'link');
        await page.evaluate((n) => window.rteE2e.toggle(n), name);
        await expectFloating(page, ID, null);
        await page.evaluate((n) => window.rteE2e.toggle(n), name);
        await cursor(page, 'um link', 2);
        await expectFloating(page, ID, 'link');
      }
    });

    test('floatingMenus ao vivo: table false com o cursor na célula', async ({
      page,
    }) => {
      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      await editorHost(page, ID).evaluate((host) => {
        (window as unknown as { __ed: unknown }).__ed =
          window.rteE2e.getRteEditor(host);
      });
      await page.evaluate(() =>
        window.rteE2e.setFloatingMenus('floating', { table: false }),
      );
      await expectFloating(page, ID, null);
      expect(
        await editorHost(page, ID).evaluate(
          (host) =>
            (window as unknown as { __ed: unknown }).__ed ===
            window.rteE2e.getRteEditor(host),
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.rteE2e.setFloatingMenus('floating', undefined),
      );
      await expectFloating(page, ID, 'table');
    });

    test('floating-alt (sem barra, table: false) nunca mostra o de tabela', async ({
      page,
    }) => {
      const alt = 'floating-alt';
      await waitForEditor(page, alt);
      await expect.poll(() => rteHtml(page, alt)).toContain('A1');
      await waitFloatingReady(page, alt);
      await expect(floatingMenu(page, alt, 'table')).toHaveCount(0);
      await selectIn(page, alt, 'A1', 1, 1);
      await expectFloating(page, alt, null);
      // controle positivo: texto selecionado
      await selectIn(page, alt, 'Segundo');
      await expectFloating(page, alt, 'text');
    });

    test('IME (Chromium): composição oculta, o texto inserido devolve', async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'CDP só no Chromium');
      await cursor(page, 'A1', 1);
      await expectFloating(page, ID, 'table');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.imeSetComposition', {
        text: 'a',
        selectionStart: 1,
        selectionEnd: 1,
      });
      await expectFloating(page, ID, null);
      await cdp.send('Input.insertText', { text: 'a' });
      await expectFloating(page, ID, 'table');
    });
  });
}

for (const zone of [false, true]) {
  test(`N21: sem o chunk dos menus o editor funciona e Alt+F10 vai à barra (${zone ? 'zone' : 'zoneless'})`, async ({
    page,
  }) => {
    let blocked = 0;
    // O chunk dos menus é o arquivo `.js` que contém o endereço do link.
    await page.route('**/*.js', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes('rte-floating__address')) {
        blocked++;
        await route.abort('failed');
        return;
      }
      await route.fulfill({ response, body });
    });
    await gotoApp(page, '/floating', { zone });
    await waitForEditor(page, ID);
    await expect.poll(() => rteHtml(page, ID)).toContain('Segundo parágrafo.');
    await expect.poll(() => blocked).toBeGreaterThan(0);
    await frames(page);
    await expect(editorHost(page, ID).locator('.rte-floating')).toHaveCount(0);

    await selectIn(page, ID, 'Segundo');
    await frames(page);
    await expect(editorHost(page, ID).locator('.rte-floating')).toHaveCount(0);
    expect(
      await page.evaluate(() => window.rteE2e.focusFloatingMenu('floating')),
    ).toBe(false);
    await page.keyboard.press('Alt+F10');
    expect(await focusedLabel(page)).toBe('Undo');
    await page.keyboard.press('Escape');
    await expect(editableOf(page, ID)).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type('Z');
    await expect.poll(() => rteHtml(page, ID)).toContain('Z');
  });
}
