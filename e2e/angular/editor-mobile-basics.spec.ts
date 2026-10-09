import { expect, test, type Page } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';
import {
  fitsWidth,
  layoutRect,
  pageScroll,
  rectOf,
  smallTargets,
  mobileViolations,
} from './helpers/mobile';

import {
  frames,
  loadDoc,
  rteHtml,
  selectionOf,
  selectIn,
  toolbarButton,
} from './helpers/toolbar';
import { pngFile, tray, uniqueName, uploadInPage } from './helpers/upload';

// O6 (spec 08b, R2): toque e barra em celular. Projetos `mobile-chromium` (Pixel 7) e
// `mobile-webkit` (iPhone 15; NÃO é o Safari do iOS: sem teclado real nem alças de seleção, que
// ficam no roteiro móvel, O9). Toque foca o editável e põe o cursor; toque num item da barra
// aplica a marca sem perder a seleção; a 360 px a página não rola na horizontal e todo item da
// barra é alcançável por toque e por foco itinerante; alvos >= 24 x 24 px (WCAG 2.5.8) na barra,
// na bandeja de envio e no aviso de rascunho; reflow a 320 px (WCAG 1.4.10); axe sem violação
// séria. As superfícies de menus e diálogos estão em `editor-mobile-menus/-dialogs`.

const ID = 'toolbar';
const DOC = '<p>Primeira linha de teste.</p><p>Segunda linha de teste.</p>';

async function open(page: Page, width = 360, height = 740): Promise<void> {
  await page.setViewportSize({ width, height });
  await gotoApp(page, '/toolbar');
  await waitForEditor(page, ID);
  await loadDoc(page, ID, DOC);
}

const items = (page: Page) =>
  editorHost(page, ID).locator('.rte-toolbar > .rte-toolbar__button');

test.describe('O6 toque e barra @mobile', { tag: '@mobile' }, () => {
  test('toque no editável foca e põe o cursor onde se tocou', async ({
    page,
  }) => {
    await open(page);
    const line = editableOf(page, ID).locator('p').nth(1);
    const box = await line.boundingBox();
    if (!box) throw new Error('parágrafo sem caixa');
    await line.tap({ position: { x: 20, y: box.height / 2 } });
    await expect(editableOf(page, ID)).toBeFocused();
    const { from, to } = await selectionOf(page, ID);
    expect(from).toBe(to);
    // dentro do segundo parágrafo (o primeiro tem 22 posições com as bordas)
    expect(from).toBeGreaterThan(24);
  });

  test('toque num item da barra aplica a marca sem perder a seleção', async ({
    page,
  }) => {
    await open(page);
    await selectIn(page, ID, 'Primeira');
    const before = await selectionOf(page, ID);
    await toolbarButton(page, ID, 'Bold').tap();
    await expect
      .poll(() => rteHtml(page, ID))
      .toContain('<strong>Primeira</strong>');
    expect(await selectionOf(page, ID)).toEqual(before);
    await expect(editableOf(page, ID)).toBeFocused();
  });

  test('360 px: sem rolagem horizontal e todo item da barra alcançável por toque', async ({
    page,
  }) => {
    await open(page, 360, 740);
    const { scrollWidth, innerWidth } = await pageScroll(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    const buttons = items(page);
    const count = await buttons.count();
    expect(count).toBeGreaterThan(10);
    const view = await layoutRect(page);
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      if (!(await button.isVisible())) continue;
      await button.scrollIntoViewIfNeeded();
      const label = await button.getAttribute('aria-label');
      const rect = await rectOf(button);
      expect(rect.left, `${label} à esquerda`).toBeGreaterThanOrEqual(-1);
      expect(rect.right, `${label} à direita`).toBeLessThanOrEqual(
        view.right + 1,
      );
      // nada por cima do centro do item
      const covered = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return !(top && (top === el || el.contains(top)));
      });
      expect(covered, `${label} coberto`).toBe(false);
    }
    expect((await pageScroll(page)).scrollWidth).toBeLessThanOrEqual(
      innerWidth,
    );
  });

  test('360 px: foco itinerante percorre a barra inteira e cada item cabe na tela', async ({
    page,
  }) => {
    await open(page);
    await selectIn(page, ID, 'Primeira', 0, 0);
    await page.keyboard.press('Shift+Tab');
    const buttons = items(page);
    const total = await buttons.count();
    const seen = new Set<string>();
    for (let i = 0; i < total + 2; i++) {
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el?.classList.contains('rte-toolbar__button')) return null;
        const r = el.getBoundingClientRect();
        return {
          label: el.getAttribute('aria-label') ?? '',
          left: r.left,
          right: r.right,
          width: window.innerWidth,
        };
      });
      if (info) {
        seen.add(info.label);
        expect(info.left, info.label).toBeGreaterThanOrEqual(-1);
        expect(info.right, info.label).toBeLessThanOrEqual(info.width + 1);
      }
      await page.keyboard.press('ArrowRight');
    }
    // todos os itens visíveis foram visitados (rótulos repetidos contam uma vez)
    const labels = await buttons.evaluateAll((els) =>
      els
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => el.getAttribute('aria-label') ?? ''),
    );
    expect([...new Set(labels)].filter((l) => !seen.has(l))).toEqual([]);
  });

  test('alvos de 24 x 24 px na barra', async ({ page }) => {
    await open(page);
    expect(
      await smallTargets(editorHost(page, ID).locator('.rte-toolbar')),
    ).toEqual([]);
  });

  test('reflow a 320 px: sem rolagem horizontal da página', async ({
    page,
  }) => {
    await open(page, 320, 568);
    const { scrollWidth, innerWidth } = await pageScroll(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    // o editor inteiro cabe na largura
    const box = await rectOf(editorHost(page, ID));
    expect(await fitsWidth(page, box)).toBe(true);
  });

  test('axe sem violação séria na barra e no editor', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await selectIn(page, ID, 'Primeira');
    expect(await mobileViolations(page)).toEqual([]);
  });
});

test.describe(
  'O6 bandeja de envio e aviso de rascunho @mobile',
  {
    tag: '@mobile',
  },
  () => {
    test('bandeja de envio: alvos >= 24 px, dentro da tela a 360 px, sem rolagem horizontal', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await gotoApp(page, '/upload');
      await waitForEditor(page, 'upload');
      await page.evaluate(() => window.rteE2e.setUpload('upload', 'http'));
      // envio lento (800 ms) para a bandeja ficar visível
      await uploadInPage(page, 'upload', [
        pngFile(uniqueName('mobile', 'png', 800)),
      ]);
      const trayEl = tray(page, 'upload');
      await expect(trayEl).toBeVisible();
      expect(await smallTargets(trayEl)).toEqual([]);
      expect(await fitsWidth(page, await rectOf(trayEl))).toBe(true);
      const { scrollWidth, innerWidth } = await pageScroll(page);
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      expect(await mobileViolations(page)).toEqual([]);
    });

    test('aviso de rascunho: alvos >= 24 px e reflow a 320 px', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await gotoApp(page, '/draft');
      await waitForEditor(page, 'draft');
      await editableOf(page, 'draft').tap();
      await page.keyboard.type('rascunho no celular');
      await expect
        .poll(() =>
          page.evaluate(() => localStorage.getItem('rte-draft:e2e-draft')),
        )
        .not.toBeNull();
      await page.reload();
      await waitForEditor(page, 'draft');
      const prompt = page.locator('section.rte-draft');
      await expect(prompt).toBeVisible();
      expect(await smallTargets(prompt)).toEqual([]);
      expect(await fitsWidth(page, await rectOf(prompt))).toBe(true);
      const { scrollWidth, innerWidth } = await pageScroll(page);
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      await frames(page);
      expect(await mobileViolations(page)).toEqual([]);
    });
  },
);
