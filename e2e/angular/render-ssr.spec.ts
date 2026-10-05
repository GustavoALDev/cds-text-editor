// Spec 06, §6.2 L2 (R8; R5 sem JS; H10): a rota `render` pré-renderizada, nos builds
// zoneless e zone.js, com a CSP estrita do app. O HTML do servidor já traz o conteúdo
// transformado (H6) e o sumário; sem JavaScript o texto, o rolador, os links do sumário e a
// paleta funcionam (os `style` do conteúdo ficam bloqueados pela CSP); com JavaScript a
// hidratação não emite `NG05xx`/`NG0100`/`NG0101` e reaplica os estilos por CSSOM (H8).
import { expect, test, type Page } from '@playwright/test';
import { appUrl, collectConsole, settlePage } from './helpers/app';
import {
  blockThirdParty,
  gotoRender,
  measureH10,
  renderHost,
  watchServerNodes,
  type H10Measure,
} from './helpers/render';

/** Vermelho da paleta no claro (`light-dark(#b3261e, …)` do `content.css`). */
const RED_LIGHT = 'rgb(179, 38, 30)';

/** Hidratação e erros de detecção de mudanças que não podem aparecer no console. */
const NG_ERRORS = /NG05\d\d|NG010[01]/;

/** Elementos do fixture cujos estilos só existem com JavaScript (H8). */
function justified(page: Page) {
  return renderHost(page, 'render-main')
    .locator('p')
    .filter({ hasText: 'Parágrafo justificado.' });
}
function verticalEmbed(page: Page) {
  return renderHost(page, 'render-main').locator('iframe[src*="aqz-KE-bpKQ"]');
}

for (const zone of [false, true]) {
  const build = zone ? 'zone.js' : 'zoneless';
  const base = zone ? '/zone/render' : '/render';

  test.describe(`L2 SSR e hidratação (${build})`, () => {
    test.beforeEach(async ({ context }) => {
      await blockThirdParty(context);
    });

    test('HTML do servidor: conteúdo transformado e sumário', async ({
      request,
    }) => {
      const res = await request.get(appUrl('/render', { zone }));
      expect(res.ok()).toBe(true);
      const html = await res.text();
      const main = html.match(
        /<article[^>]*data-testid="render-main"[\s\S]*?<\/article>/,
      )?.[0];
      expect(main).toBeDefined();
      // H6: rolador em volta da tabela, sem os atributos do rolador transbordado (H7, só no navegador).
      const scrollers = main!.match(/<div class="rte-table-scroll"[^>]*>/g);
      expect(scrollers).toEqual(['<div class="rte-table-scroll">']);
      expect(main).toContain('<div class="rte-table-scroll"><table>');
      // Fragmento no caminho do documento (pré-voo 6).
      expect(main).toContain(`href="${base}#rt-subtitulo"`);
      expect(main).not.toContain('href="#rt-subtitulo"');

      const nav = html.match(/<nav class="rte-toc"[\s\S]*?<\/nav>/)?.[0];
      expect(nav).toBeDefined();
      const links = [...nav!.matchAll(/<a[^>]*class="rte-toc__link"[^>]*>/g)];
      const hrefs = links.map((m) => m[0].match(/href="([^"]*)"/)?.[1]);
      expect(hrefs).toEqual(
        ['rt-titulo-principal', 'rt-subtitulo', 'rt-titulo-principal-2'].map(
          (id) => `${base}#${id}`,
        ),
      );
    });

    test('sem JavaScript: texto, rolador, sumário e paleta; sem os estilos do conteúdo (R5)', async ({
      browser,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        colorScheme: 'light',
      });
      await blockThirdParty(context);
      const page = await context.newPage();
      await page.goto(appUrl('/render', { zone }));
      const main = renderHost(page, 'render-main');

      await expect(main.locator('h2').first()).toHaveText('Título principal');
      await expect(main.locator('h2').first()).toBeVisible();
      await expect(main.locator('.rte-table-scroll')).toHaveCount(1);
      await expect(main.locator('.rte-table-scroll > table')).toBeVisible();
      await expect(main.locator('.rte-table-scroll')).not.toHaveAttribute(
        'tabindex',
        /.*/,
      );

      // Paleta: regras por `data-rt-color` no `content.css`, sem depender do `style`.
      await expect(main.locator('span[data-rt-color="red"]')).toHaveCSS(
        'color',
        RED_LIGHT,
      );
      // Os `style` do conteúdo ficam bloqueados pela CSP sem JS (documentado na R5).
      await expect(justified(page)).toHaveCSS('text-align', 'start');
      expect(
        await verticalEmbed(page).evaluate(
          (el) => getComputedStyle(el).aspectRatio,
        ),
      ).not.toBe('9 / 16');

      // Sumário: o clique muda o hash e rola até o título (navegação nativa no documento).
      const heading = page.locator('#rt-subtitulo');
      const margin = await heading.evaluate((el) =>
        parseFloat(getComputedStyle(el).scrollMarginTop),
      );
      expect(
        await heading.evaluate((el) => el.getBoundingClientRect().top),
      ).toBeGreaterThan(margin + 2);
      await page
        .locator(`[data-testid="render-toc"] a[href="${base}#rt-subtitulo"]`)
        .click();
      await expect(page).toHaveURL(new RegExp(`${base}#rt-subtitulo$`));
      await expect
        .poll(() => heading.evaluate((el) => el.getBoundingClientRect().top))
        .toBeCloseTo(margin, 0);
      await context.close();
    });

    test('com JavaScript: hidratação sem NG05xx, H10 e estilos reaplicados', async ({
      page,
    }, testInfo) => {
      const messages = collectConsole(page);
      await watchServerNodes(page);
      await gotoRender(page, '/render', { zone });
      await settlePage(page);

      // Depois da hidratação os estilos voltam por CSSOM (H8).
      await expect(justified(page)).toHaveCSS('text-align', 'justify');
      await expect(verticalEmbed(page)).toHaveCSS('aspect-ratio', '9 / 16');

      const h10: H10Measure = await measureH10(page);
      testInfo.annotations.push({
        type: 'H10',
        description: JSON.stringify(h10),
      });
      console.log(`H10 ${testInfo.project.name} ${build}`, JSON.stringify(h10));
      // Pré-voo 19, observado no Angular 22.2.1 nos 3 motores e nos 2 builds: a hidratação
      // re-atribui o `[innerHTML]` do host — os nós do servidor são trocados por novos e cada
      // `iframe` do fixture (4) é inserido de novo. Aceito (H10): conteúdo idêntico, sem
      // `NG05xx`, sem `ngSkipHydration` (ADR 0012). `iframeLoads` é só informativo.
      expect(h10.sameNodes).toEqual({
        h2: false,
        iframe: false,
        scroller: false,
      });
      expect(h10.iframeReloads).toBe(4);
      // Conteúdo idêntico ao do servidor depois da re-inserção.
      await expect(
        renderHost(page, 'render-main').locator('h2').first(),
      ).toHaveText('Título principal');

      expect(messages.filter((m) => NG_ERRORS.test(m))).toEqual([]);
      expect(messages.filter((m) => m.startsWith('pageerror:'))).toEqual([]);
    });
  });
}
