// Spec 06, Task 8: smoke do `render.css` e das regras de leitura do `content.css` em
// navegador real (estilo computado), nos builds zoneless e zone.js.
import { expect, test, type Page } from '@playwright/test';
import {
  editorHost,
  gotoApp,
  readFixture,
  waitForEditor,
} from './helpers/app';
import { blockThirdParty, gotoRender, renderHost } from './helpers/render';

const TABLE_WITH_CAPTION =
  '<table><caption>Legenda</caption><tbody><tr><td><p>a</p></td></tr></tbody></table>';

for (const zone of [false, true]) {
  test.describe(`render.css (${zone ? 'zone.js' : 'zoneless'})`, () => {
    test.beforeEach(async ({ context }) => {
      await blockThirdParty(context);
    });

    test('rolador, margem de rolagem e sumário', async ({ page }) => {
      await gotoRender(page, '/render', { zone });
      const wide = renderHost(page, 'render-wide').locator('.rte-table-scroll');
      await expect(wide.first()).toBeAttached();
      await expect(wide.first()).toHaveCSS('overflow-x', 'auto');
      await expect(page.locator('#rt-subtitulo')).toHaveCSS(
        'scroll-margin-top',
        '16px',
      );
      await expect(
        page.locator('[data-testid="render-toc"] .rte-toc__list').first(),
      ).toHaveCSS('list-style-type', 'none');
      const link = page.locator('.rte-toc__link').first();
      expect(
        await link.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(24);
    });

    test('tarefas: label em flex e checkbox centrado como no editor', async ({
      page,
    }) => {
      await gotoRender(page, '/render', { zone });
      const label = renderHost(page, 'render-main').locator(
        '.rt-task > label',
      );
      await expect(label.first()).toHaveCSS('display', 'flex');
      const offsetOf = (p: Page, task: string, input: string) =>
        p.locator(task).first().evaluate(
          (li, sel) => {
            const box = li.querySelector(sel)!.getBoundingClientRect();
            return box.top + box.height / 2 - li.getBoundingClientRect().top;
          },
          input,
        );
      const rendered = await offsetOf(
        page,
        '[data-testid="render-main"] .rt-task',
        'label > input',
      );

      await gotoApp(page, '/content', { zone });
      await waitForEditor(page, 'content');
      await page.evaluate(
        (html) => window.rteE2e.setValue('content', html),
        readFixture('all-features.html'),
      );
      await expect(editorHost(page, 'content').locator('.rt-task')).toHaveCount(
        2,
      );
      const edited = await offsetOf(
        page,
        'rte-editor[data-testid="content"] .rt-task',
        '.rte-task__check input',
      );
      expect(Math.abs(rendered - edited)).toBeLessThanOrEqual(1);
    });

    test('legenda de tabela (caption)', async ({ page }) => {
      await gotoRender(page, '/render', { zone });
      await page.evaluate(
        (html) => window.rteE2e.setRenderInput(html),
        TABLE_WITH_CAPTION,
      );
      const host = renderHost(page, 'render-input');
      const caption = host.locator('caption');
      await expect(caption).toHaveText('Legenda');
      await expect(caption).toHaveCSS('caption-side', 'top');
      await expect(caption).toHaveCSS('text-align', 'start');
      const [muted, captionSize, cellSize] = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--rte-text-muted)';
        const root = document.querySelector('[data-testid="render-input"]')!;
        root.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        const px = (sel: string) =>
          parseFloat(
            getComputedStyle(root.querySelector(sel)!).fontSize,
          );
        return [color, px('caption'), px('td')];
      });
      await expect(caption).toHaveCSS('color', muted);
      expect(captionSize).toBeCloseTo(cellSize * 0.875, 1);
    });
  });
}
