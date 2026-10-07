// Spec 06, §6.2 L6 (R7; H6, H11, H12): sumário e âncoras em navegador real, nos builds
// zoneless e zone.js, na rota aninhada `render/artigo` (cabeçalho fixo de 64 px e
// `--rte-scroll-margin: 72px`). A navegação é nativa: muda só o fragmento da URL, sem
// recarga nem saída da rota, aplica `:target`, rola o título até a margem e o próximo `Tab`
// parte do título (pré-voo 20); o conteúdo não é re-inserido (o `iframe` é o mesmo nó).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { APP_URL } from './helpers/app';
import { blockThirdParty, gotoRender, renderHost } from './helpers/render';

const TARGET = 'rt-subtitulo';

/** Marca a página (some numa recarga) e guarda o primeiro `iframe` do conteúdo. */
function mark(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.__renderMarker = 'vivo';
    window.__renderIframe = document.querySelector(
      '[data-testid="render-main"] iframe',
    );
  });
}

/** Volta ao topo e tira o fragmento, sem navegar. */
async function reset(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    history.replaceState(history.state, '', p);
    window.scrollTo(0, 0);
  }, path);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

/** Navegação ao `#rt-subtitulo` pelo `link`: tudo o que a R7 exige. */
async function expectAnchorNavigation(
  page: Page,
  link: Locator,
  path: string,
): Promise<void> {
  await link.click();
  await expect(page).toHaveURL(`${APP_URL}${path}#${TARGET}`);
  expect(await page.evaluate(() => window.__renderMarker)).toBe('vivo');
  await expect(page.locator('.e2e-render-header')).toBeVisible();
  await expect(page.locator(`#${TARGET}:target`)).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator(`#${TARGET}`)
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBeGreaterThanOrEqual(71);
  const top = await page
    .locator(`#${TARGET}`)
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(top - 72)).toBeLessThanOrEqual(1);

  // Pré-voo 20: o próximo `Tab` parte do título (motor-agnóstico; o WebKit não tabula
  // links por padrão): o foco cai depois dele na ordem do documento, dentro do conteúdo.
  await page.keyboard.press('Tab');
  const after = await page.evaluate((id) => {
    const heading = document.getElementById(id)!;
    const el = document.activeElement;
    if (!el || el === document.body)
      return { follows: false, inContent: false };
    return {
      follows: !!(
        heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      inContent: !!el.closest('.rte-content'),
      tag: el.tagName,
    };
  }, TARGET);
  expect(after.follows, JSON.stringify(after)).toBe(true);
  expect(after.inContent, JSON.stringify(after)).toBe(true);
}

for (const zone of [false, true]) {
  const build = zone ? 'zone.js' : 'zoneless';
  const path = `${zone ? '/zone' : ''}/render/artigo`;

  test.describe(`L6 sumário e âncoras (${build})`, () => {
    test.beforeEach(async ({ context }) => {
      await blockThirdParty(context);
    });

    test('sumário e link de fragmento navegam só pelo fragmento', async ({
      page,
    }) => {
      await gotoRender(page, '/render/artigo', { zone });
      await mark(page);

      const tocLink = page
        .locator('nav.rte-toc')
        .getByRole('link', { name: 'Subtítulo' });
      await expect(tocLink).toHaveAttribute('href', `${path}#${TARGET}`);
      await expectAnchorNavigation(page, tocLink, path);

      await reset(page, path);
      const fragment = renderHost(page, 'render-main').getByRole('link', {
        name: 'fragmento',
      });
      await expect(fragment).toHaveAttribute('href', `${path}#${TARGET}`);
      await expectAnchorNavigation(page, fragment, path);

      // Review Focus 2: o conteúdo não foi re-inserido.
      expect(
        await page.evaluate(
          () =>
            window.__renderIframe !== null &&
            window.__renderIframe ===
              document.querySelector('[data-testid="render-main"] iframe'),
        ),
      ).toBe(true);
    });

    test("fragmentLinks: 'keep' mantém o href original", async ({ page }) => {
      await gotoRender(page, '/render/artigo', { zone });
      await expect(
        renderHost(page, 'render-keep').locator('a'),
      ).toHaveAttribute('href', '#rt-k');
      const hrefs = await page
        .locator('nav.rte-toc a, [data-testid="render-main"] a[href*="#"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('href')!));
      expect(hrefs.length).toBeGreaterThan(3);
      expect(hrefs.filter((h) => !h.startsWith(`${path}#`))).toEqual([]);
    });
  });
}
