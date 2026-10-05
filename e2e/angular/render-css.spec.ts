// Spec 06, Task 8: smoke do `render.css` e das regras de leitura do `content.css` em
// navegador real (estilo computado), nos builds zoneless e zone.js.
import { expect, test, type Page } from '@playwright/test';
import { editorHost, gotoApp, readFixture, waitForEditor } from './helpers/app';
import { blockThirdParty, gotoRender, renderHost } from './helpers/render';

const TABLE_WITH_CAPTION =
  '<table><caption>Legenda</caption><tbody><tr><td><p>a</p></td></tr></tbody></table>';

/** `--rte-primary` resolvido, como o navegador devolve `accent-color`. */
function accent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--rte-primary)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

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
      await expect(link).toHaveCSS('display', 'inline-block');
      await expect(link).toHaveCSS('line-height', '24px');
      expect(
        await link.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(24);
    });

    test('tarefas: label em flex e checkbox centrado como no editor', async ({
      page,
    }) => {
      await gotoRender(page, '/render', { zone });
      const label = renderHost(page, 'render-main').locator('.rt-task > label');
      await expect(label.first()).toHaveCSS('display', 'flex');
      // Medidas relativas ao `li` (as páginas diferem na posição absoluta).
      const measure = (p: Page, task: string, input: string, text: string) =>
        p
          .locator(task)
          .first()
          .evaluate(
            (li, sel) => {
              const top = li.getBoundingClientRect();
              const box = li.querySelector(sel.input)!.getBoundingClientRect();
              const walker = document.createTreeWalker(
                li.querySelector(sel.text) ?? li,
                NodeFilter.SHOW_TEXT,
              );
              const range = document.createRange();
              range.selectNodeContents(walker.nextNode()!);
              return {
                cy: box.top + box.height / 2 - top.top,
                w: box.width,
                h: box.height,
                textX: range.getBoundingClientRect().left - top.left,
              };
            },
            { input, text },
          );
      const input = renderHost(page, 'render-main').locator(
        '.rt-task > label > input',
      );
      await expect(input.first()).toHaveCSS('accent-color', await accent(page));
      const rendered = await measure(
        page,
        '[data-testid="render-main"] .rt-task',
        'label > input',
        'label',
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
      const edited = await measure(
        page,
        'rte-editor[data-testid="content"] .rt-task',
        '.rte-task__check input',
        '.rte-task__text',
      );
      for (const key of ['cy', 'w', 'h', 'textX'] as const)
        expect(
          Math.abs(rendered[key] - edited[key]),
          `${key}: ${rendered[key]} x ${edited[key]}`,
        ).toBeLessThanOrEqual(1);
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
      await expect(caption).toHaveCSS('text-align', 'start');
      const [muted, captionSize, cellSize] = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--rte-text-muted)';
        const root = document.querySelector('[data-testid="render-input"]')!;
        root.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        const px = (sel: string) =>
          parseFloat(getComputedStyle(root.querySelector(sel)!).fontSize);
        return [color, px('caption'), px('td')];
      });
      await expect(caption).toHaveCSS('color', muted);
      expect(captionSize).toBeCloseTo(cellSize * 0.875, 1);
      const padding = await caption.evaluate((el) =>
        parseFloat(getComputedStyle(el).paddingBottom),
      );
      expect(padding).toBeCloseTo(captionSize * 0.4, 1);
    });
  });
}
