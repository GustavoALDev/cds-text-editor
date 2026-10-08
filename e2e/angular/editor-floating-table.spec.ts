import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import {
  centerScroller,
  expectFloating,
  floatingRect,
  waitFloatingReady,
} from './helpers/floating';
import { frames, rteHtml, selectIn, selectionOf } from './helpers/toolbar';

// N60 (spec 08b, O14, R7): o menu da tabela cobrindo o parágrafo seguinte (achado da 07b).
// Geometria fixa nos 3 motores: tabela no topo do editável, dentro do contêiner com rolagem da
// rota `floating` (barra no alto do mesmo contêiner), cursor numa célula. O teste grava âncora,
// área visível, retângulo do menu e `placement` (`RTE_DIAG=1` imprime) e afirma o MESMO
// resultado nos 3 motores: não há espaço acima da tabela (a barra e a borda do editável), então o
// recuo para baixo da M9 vale em todos; não é defeito de medida de um motor. O menu cobre o
// parágrafo seguinte, e o teste prova que o conteúdo coberto continua ao alcance: `Escape` oculta
// o menu (M6) e tocar/clicar no parágrafo coberto põe o cursor lá e o menu some (M4: o menu da
// tabela só existe com o cursor dentro dela).

const ID = 'floating';
const GAP = 8;
const DOC =
  '<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr>' +
  '<tr><td><p>A2</p></td><td><p>B2</p></td></tr></tbody></table>' +
  '<p>Parágrafo coberto pelo menu.</p><p>Outro parágrafo.</p><p>Último parágrafo.</p>';

interface Diagnosis {
  browser: string;
  anchor: Rect;
  visible: Rect;
  menu: Rect;
  covered: Rect;
  placement: 'above' | 'below' | 'overlay';
  coversNext: boolean;
}

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

async function prepare(page: Page): Promise<void> {
  await frames(page);
  await page.evaluate((html) => window.rteE2e.setValue('floating', html), DOC);
  await expect.poll(() => rteHtml(page, ID)).toContain('Último parágrafo.');
  await centerScroller(page);
  // topo do contêiner: a tabela é a primeira coisa abaixo da barra
  await page
    .locator('.e2e-floating-scroller')
    .evaluate((el) => (el.scrollTop = 0));
  await frames(page);
}

/** Cursor na primeira célula e leitura da geometria. */
async function diagnose(page: Page, browser: string): Promise<Diagnosis> {
  await selectIn(page, ID, 'A1', 1, 1);
  await expectFloating(page, ID, 'table');
  await frames(page);
  const data = await page.evaluate(() => {
    const rect = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const editable = document.querySelector(
      'rte-editor[data-testid="floating"] .ProseMirror',
    ) as HTMLElement;
    const scroller = document.querySelector(
      '.e2e-floating-scroller',
    ) as Element;
    const e = rect(editable);
    const s = rect(scroller);
    const visible: Rect = {
      top: Math.max(0, e.top, s.top),
      bottom: Math.min(window.innerHeight, e.bottom, s.bottom),
      left: Math.max(0, e.left, s.left),
      right: Math.min(window.innerWidth, e.right, s.right),
    };
    // a âncora do menu é o nó da tabela do editor (o `.tableWrapper`), não o `<table>`
    const table = (editable.querySelector('.tableWrapper') ??
      editable.querySelector('table')) as Element;
    const covered = [...editable.querySelectorAll('p')].find((p) =>
      (p.textContent ?? '').includes('coberto'),
    ) as Element;
    return { anchor: rect(table), visible, covered: rect(covered) };
  });
  const menu = await floatingRect(page, ID, 'table');
  const placement: Diagnosis['placement'] =
    menu.bottom <= data.anchor.top + 1
      ? 'above'
      : menu.top >= data.anchor.bottom - 1
        ? 'below'
        : 'overlay';
  const coversNext =
    menu.top < data.covered.bottom &&
    menu.bottom > data.covered.top &&
    menu.left < data.covered.right &&
    menu.right > data.covered.left;
  const diagnosis: Diagnosis = {
    browser,
    ...data,
    menu: {
      top: menu.top,
      bottom: menu.bottom,
      left: menu.left,
      right: menu.right,
    },
    placement,
    coversNext,
  };
  const text = JSON.stringify(diagnosis);
  test.info().annotations.push({ type: 'N60', description: text });
  if (process.env['RTE_DIAG']) console.log(`N60 ${text}`);
  return diagnosis;
}

for (const zone of [false, true]) {
  test.describe(`N60 menu da tabela cobrindo o parágrafo seguinte (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoApp(page, '/floating', { zone });
      await waitForEditor(page, ID);
      await waitFloatingReady(page, ID);
      await prepare(page);
    });

    test('mesma geometria, mesmo placement nos 3 motores (abaixo, sem espaço acima)', async ({
      page,
      browserName,
    }) => {
      const d = await diagnose(page, browserName);
      // sem espaço acima: o menu não cabe entre a área visível e a tabela
      expect(
        d.anchor.top - GAP - (d.menu.bottom - d.menu.top),
        'espaço acima da tabela',
      ).toBeLessThan(d.visible.top);
      expect(d.placement).toBe('below');
      expect(
        Math.abs(d.menu.top - (d.anchor.bottom + GAP)),
      ).toBeLessThanOrEqual(1);
      expect(d.coversNext).toBe(true);
    });

    test('o conteúdo coberto continua ao alcance: Escape oculta e o toque no parágrafo move o cursor e fecha o menu', async ({
      page,
      browserName,
    }) => {
      const d = await diagnose(page, browserName);
      expect(d.coversNext).toBe(true);

      // Escape (M6) oculta o menu sem mexer na seleção
      const before = await selectionOf(page, ID);
      await page.keyboard.press('Escape');
      await expectFloating(page, ID, null);
      expect(await selectionOf(page, ID)).toEqual(before);

      // sair da tabela e voltar (mudança de contexto) traz o menu de volta; clicar no
      // parágrafo coberto o fecha
      await selectIn(page, ID, 'Outro', 1, 1);
      await expectFloating(page, ID, null);
      await selectIn(page, ID, 'B1', 1, 1);
      await expectFloating(page, ID, 'table');
      await frames(page);
      const menu = await floatingRect(page, ID, 'table');
      const covered = editableOf(page, ID).locator('p', {
        hasText: 'coberto',
      });
      const box = await covered.boundingBox();
      if (!box) throw new Error('parágrafo coberto sem caixa');
      // ponto do parágrafo fora do menu (à direita ou à esquerda dele)
      const y = box.y + box.height / 2;
      const x =
        menu.right + 20 < box.x + box.width
          ? menu.right + 20
          : Math.max(box.x + 2, menu.left - 20);
      await page.mouse.click(x, y);
      await expectFloating(page, ID, null);
      const sel = await selectionOf(page, ID);
      const inCovered = await editorHost(page, ID).evaluate((host, pos) => {
        const editor = window.rteE2e.getRteEditor(host);
        if (!editor) return false;
        const $pos = editor.state.doc.resolve(pos);
        return $pos.parent.textContent.includes('coberto');
      }, sel.from);
      expect(inCovered).toBe(true);
    });
  });
}
