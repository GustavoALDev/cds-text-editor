import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { editorHost, gotoApp, waitForEditor } from './helpers/app';
import {
  centerScroller,
  expectFloating,
  floatingRect,
  waitFloatingReady,
  wordRect,
} from './helpers/floating';
import { pageScroll, visualRect, rectOf, type Box } from './helpers/mobile';
import { productivityReady } from './helpers/productivity';
import { frames, rteHtml, selectIn } from './helpers/toolbar';

// O7 (spec 08b, R2): menus flutuantes e lista do `/` posicionados pela viewport VISUAL. A pinça
// (zoom) por CDP (`Input.synthesizePinchGesture`) é a única forma real de reduzir a viewport
// visual no Playwright; só `mobile-chromium` (`@cdp`; o WebKit não tem CDP). Sem IME nem teclado
// falso: teclado real, autocorreção e alças de seleção vão ao roteiro móvel (O9). A prova
// principal é o unitário `floating-visual-viewport.spec.ts`; este arquivo prova no motor real.

const TAGS = ['@mobile', '@cdp'];
const FLOATING = 'floating';
const GAP = 8;

/** Zoom por pinça em torno do centro da tela; devolve a escala alcançada. */
async function pinch(
  page: Page,
  cdp: CDPSession,
  at: { x: number; y: number },
  scaleFactor = 2,
): Promise<number> {
  await cdp.send('Input.synthesizePinchGesture', {
    x: Math.round(at.x),
    y: Math.round(at.y),
    scaleFactor,
  });
  await expect
    .poll(async () => (await visualRect(page)).scale, { timeout: 10_000 })
    .toBeGreaterThan(scaleFactor - 0.2);
  await frames(page);
  return (await visualRect(page)).scale;
}

/** `rect` cabe na viewport visual na vertical; na horizontal quando o menu cabe (senão começa nela). */
function expectInVisual(rect: Box, vv: Box, what: string): void {
  expect(rect.top, `${what}: topo`).toBeGreaterThanOrEqual(vv.top - 1);
  expect(rect.bottom, `${what}: base`).toBeLessThanOrEqual(vv.bottom + 1);
  expect(rect.left, `${what}: esquerda`).toBeGreaterThanOrEqual(vv.left - 1);
  const width = rect.right - rect.left;
  if (width <= vv.right - vv.left - 2 * GAP) {
    expect(rect.right, `${what}: direita`).toBeLessThanOrEqual(vv.right + 1);
  }
}

/** Rola a página para o retângulo (`top`..`bottom`) ficar a `margin` px da base visual. */
async function scrollBelowToVisualBottom(
  page: Page,
  bottom: number,
  margin: number,
): Promise<void> {
  const vv = await visualRect(page);
  await page.evaluate(
    (dy) => window.scrollBy(0, dy),
    Math.round(bottom - (vv.bottom - margin)),
  );
  await frames(page);
}

test.describe('O7 viewport visual com zoom por pinça', { tag: TAGS }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, '/floating');
    await waitForEditor(page, FLOATING);
    await expect
      .poll(() => rteHtml(page, FLOATING))
      .toContain('Segundo parágrafo.');
    await waitFloatingReady(page, FLOATING);
    await centerScroller(page);
  });

  test('menu de texto dentro do retângulo visual, também depois de rolar', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const word = await wordRect(page, FLOATING, 'p', 'Segundo');
    const scale = await pinch(page, cdp, {
      x: (word.left + word.right) / 2,
      y: (word.top + word.bottom) / 2,
    });
    expect(scale).toBeGreaterThan(1.8);
    await selectIn(page, FLOATING, 'Segundo');
    await expectFloating(page, FLOATING, 'text');
    await frames(page);
    const vv = await visualRect(page);
    test.info().annotations.push({
      type: 'O7',
      description: `text: escala ${vv.scale.toFixed(2)}, visual ${JSON.stringify(vv)}`,
    });
    expectInVisual(await floatingRect(page, FLOATING, 'text'), vv, 'texto');

    // palavra perto da base visual: abaixo (preferência de toque) não cabe, o menu inverte
    const w = await wordRect(page, FLOATING, 'p', 'Segundo');
    await scrollBelowToVisualBottom(page, w.bottom, 20);
    await expectFloating(page, FLOATING, 'text');
    const after = await visualRect(page);
    const menu = await floatingRect(page, FLOATING, 'text');
    const moved = await wordRect(page, FLOATING, 'p', 'Segundo');
    expectInVisual(menu, after, 'texto rolado');
    expect(moved.bottom).toBeLessThanOrEqual(after.bottom);
  });

  test('menu da tabela dentro do retângulo visual', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const cell = editorHost(page, FLOATING).locator('td', { hasText: 'A1' });
    await cell.scrollIntoViewIfNeeded();
    const box = await rectOf(cell);
    await pinch(page, cdp, {
      x: (box.left + box.right) / 2,
      y: (box.top + box.bottom) / 2,
    });
    await selectIn(page, FLOATING, 'A1', 1, 1);
    await expectFloating(page, FLOATING, 'table');
    await frames(page);
    const vv = await visualRect(page);
    expectInVisual(await floatingRect(page, FLOATING, 'table'), vv, 'tabela');
  });
});

/** Linha do cursor do editor, em coordenadas de layout (`coordsAtPos`). */
function caretLine(page: Page, id: 'productivity'): Promise<Box> {
  return editorHost(page, id).evaluate((host) => {
    const editor = window.rteE2e.getRteEditor(host);
    if (!editor) throw new Error('editor ausente');
    const c = editor.view.coordsAtPos(editor.state.selection.from);
    return { left: c.left, top: c.top, right: c.right, bottom: c.bottom };
  });
}

/**
 * A pinça mantém fixo o ponto sob os dedos (`y`); com escala `s`, a linha em `c` (layout) vai
 * para `s * c - (s - 1) * y` da tela. Escolhe `y` para a linha cair em `screenY` da tela.
 */
const anchorY = (c: number, screenY: number, s = 2): number =>
  Math.round((s * c - screenY) / (s - 1));

/**
 * Faixa de `y` (px da tela, Pixel 7: 839 px de altura) em que o `Input.synthesizePinchGesture`
 * mantém o ponto sob os dedos. Fora dela (medido no Chromium 1.63 em Linux: `y` <= ~90 ou
 * `y` >= ~740) os dedos sairiam da tela e a viewport visual encosta no topo (0) ou na base
 * (`altura / 2`), sem relação com `y`. A posição da linha depende da tipografia da máquina, então
 * o `y` pedido é limitado a esta faixa em vez de supor que sempre dá para pôr a linha a 40 px da
 * borda visual.
 */
const PINCH_Y_MIN = 110;
const PINCH_Y_MAX_FROM_BOTTOM = 119;

for (const where of ['topo', 'base'] as const) {
  test.describe('O7 lista do / com zoom por pinça', { tag: TAGS }, () => {
    test(`a lista fica dentro do retângulo visual (linha perto do ${where} visual)`, async ({
      page,
    }) => {
      await gotoApp(page, '/productivity');
      await productivityReady(page);
      const cdp = await page.context().newCDPSession(page);
      const last = 'Segundo parágrafo com banana.';
      await selectIn(page, 'productivity', last, last.length);
      await page.keyboard.press('Enter');
      await page.keyboard.type('/');
      const list = editorHost(page, 'productivity').locator('.rte-slash-menu');
      await expect(list).toBeVisible();
      const line = await caretLine(page, 'productivity');
      const { innerHeight } = await pageScroll(page);
      // topo: a linha vai para ~40 px do topo visual (a lista cabe abaixo); base: para ~40 px da
      // base (cabe acima)
      const screenY = where === 'topo' ? 40 : innerHeight - 40;
      await pinch(page, cdp, {
        x: Math.max(20, line.left),
        y: Math.min(
          innerHeight - PINCH_Y_MAX_FROM_BOTTOM,
          Math.max(PINCH_Y_MIN, anchorY(line.top, screenY)),
        ),
      });
      await frames(page);
      await expect(list).toBeVisible();
      const after = await visualRect(page);
      const caret = await caretLine(page, 'productivity');
      const rect = await rectOf(list);
      test.info().annotations.push({
        type: 'O7',
        description: `lista (${where}): ${JSON.stringify({ caret, rect, after })}`,
      });
      if (process.env['RTE_DIAG'])
        console.log(
          `O7 lista (${where}) ${JSON.stringify({ caret, rect, after })}`,
        );
      expect(caret.top, 'linha na parte visual').toBeGreaterThanOrEqual(
        after.top,
      );
      expect(caret.bottom).toBeLessThanOrEqual(after.bottom);
      expectInVisual(rect, after, `lista do / (${where})`);
      if (where === 'topo')
        expect(rect.top).toBeGreaterThanOrEqual(caret.bottom);
      else expect(rect.bottom).toBeLessThanOrEqual(caret.top);
    });
  });
}
