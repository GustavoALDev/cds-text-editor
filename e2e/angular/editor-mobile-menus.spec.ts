import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import {
  centerScroller,
  expectFloating,
  floatingMenu,
  floatingRect,
  waitFloatingReady,
  wordRect,
} from './helpers/floating';
import {
  isInside,
  layoutRect,
  pageScroll,
  rectOf,
  smallTargets,
  mobileViolations,
} from './helpers/mobile';
import { productivityReady } from './helpers/productivity';
import { frames, rteHtml, selectIn } from './helpers/toolbar';

// O6 (spec 08b, R2): menus em celular, 360 x 740, nos projetos `mobile-chromium` e
// `mobile-webkit`. Menus de texto e de link abaixo da âncora (M9, `pointer: coarse`); menu da
// tabela, lista do `/` e barra de busca dentro da viewport; alvos >= 24 px e axe em cada estado.

const FLOATING = 'floating';
const PRODUCTIVITY = 'productivity';
const GAP = 8;

async function openFloating(page: Page): Promise<void> {
  await page.setViewportSize({ width: 360, height: 740 });
  await gotoApp(page, '/floating');
  await waitForEditor(page, FLOATING);
  await expect
    .poll(() => rteHtml(page, FLOATING))
    .toContain('Segundo parágrafo.');
  await waitFloatingReady(page, FLOATING);
  await centerScroller(page);
}

async function openProductivity(page: Page): Promise<void> {
  await page.setViewportSize({ width: 360, height: 740 });
  await gotoApp(page, '/productivity');
  await productivityReady(page);
}

test.describe('O6 menus flutuantes @mobile', { tag: '@mobile' }, () => {
  test.beforeEach(async ({ page }) => {
    await openFloating(page);
  });

  test('o projeto é de toque: pointer coarse', async ({ page }) => {
    const coarse = await page.evaluate(
      () => window.matchMedia('(pointer: coarse)').matches,
    );
    expect(coarse).toBe(true);
  });

  test('texto: abaixo da seleção (M9), inteiro na tela, alvos e axe', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await selectIn(page, FLOATING, 'Segundo');
    await expectFloating(page, FLOATING, 'text');
    await frames(page);
    const menu = await floatingRect(page, FLOATING, 'text');
    const word = await wordRect(page, FLOATING, 'p', 'Segundo');
    expect(Math.abs(menu.top - (word.bottom + GAP))).toBeLessThanOrEqual(1);
    const view = await layoutRect(page);
    expect(isInside(menu, view)).toBe(true);
    expect(menu.left).toBeGreaterThanOrEqual(GAP - 1);
    expect(menu.right).toBeLessThanOrEqual(view.right - GAP + 1);
    expect(await smallTargets(floatingMenu(page, FLOATING, 'text'))).toEqual(
      [],
    );
    expect(await mobileViolations(page)).toEqual([]);
  });

  test('link: abaixo do link (M9), inteiro na tela, alvos e axe', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await selectIn(page, FLOATING, 'um link', 2, 2);
    await expectFloating(page, FLOATING, 'link');
    await frames(page);
    const menu = await floatingRect(page, FLOATING, 'link');
    const word = await wordRect(page, FLOATING, 'p', 'um link');
    expect(menu.top).toBeGreaterThanOrEqual(word.bottom + GAP - 1);
    expect(isInside(menu, await layoutRect(page))).toBe(true);
    expect(await smallTargets(floatingMenu(page, FLOATING, 'link'))).toEqual(
      [],
    );
    expect(await mobileViolations(page)).toEqual([]);
  });

  test('tabela: menu e submenu dentro da viewport, alvos e axe', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await editableOf(page, FLOATING)
      .locator('td', { hasText: 'A1' })
      .scrollIntoViewIfNeeded();
    await selectIn(page, FLOATING, 'A1', 1, 1);
    await expectFloating(page, FLOATING, 'table');
    await frames(page);
    const menu = await floatingRect(page, FLOATING, 'table');
    expect(isInside(menu, await layoutRect(page))).toBe(true);
    expect(await smallTargets(floatingMenu(page, FLOATING, 'table'))).toEqual(
      [],
    );
    expect(await mobileViolations(page)).toEqual([]);
    const { scrollWidth, innerWidth } = await pageScroll(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });

  test('reflow a 320 px com o menu de texto aberto', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await centerScroller(page);
    await selectIn(page, FLOATING, 'Segundo');
    await expectFloating(page, FLOATING, 'text');
    await frames(page);
    const { scrollWidth, innerWidth } = await pageScroll(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    expect(
      isInside(
        await floatingRect(page, FLOATING, 'text'),
        await layoutRect(page),
      ),
    ).toBe(true);
  });
});

test.describe('O6 lista do / e busca @mobile', { tag: '@mobile' }, () => {
  test.beforeEach(async ({ page }) => {
    await openProductivity(page);
  });

  test('lista do /: dentro da viewport, alvos >= 24 px e axe', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const last = 'Segundo parágrafo com banana.';
    await selectIn(page, PRODUCTIVITY, last, last.length);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    const list = editorHost(page, PRODUCTIVITY).locator('.rte-slash-menu');
    await expect(list).toBeVisible();
    await frames(page);
    expect(isInside(await rectOf(list), await layoutRect(page))).toBe(true);
    expect(await smallTargets(list)).toEqual([]);
    expect(await mobileViolations(page)).toEqual([]);
  });

  test('barra de busca: dentro da viewport, alvos >= 24 px, axe e reflow a 320 px', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await selectIn(page, PRODUCTIVITY, 'banana');
    await page.keyboard.press('ControlOrMeta+f');
    const bar = editorHost(page, PRODUCTIVITY).locator('.rte-search');
    await expect(bar).toBeVisible();
    await frames(page);
    expect(isInside(await rectOf(bar), await layoutRect(page))).toBe(true);
    expect(await smallTargets(bar)).toEqual([]);
    expect(await mobileViolations(page)).toEqual([]);
    await page.setViewportSize({ width: 320, height: 568 });
    await frames(page);
    const { scrollWidth, innerWidth } = await pageScroll(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    expect(isInside(await rectOf(bar), await layoutRect(page))).toBe(true);
  });
});
