// Spec 06, §6.2 L5 (R6, R11, R12; H7, H16): acessibilidade da rota `render` nos builds
// zoneless e zone.js — axe sem `serious`/`critical` em claro, escuro e `forced-colors`
// (com a tabela com `caption`, ruling 10); `nav` do sumário nomeado; contraste e foco
// visível dos links do sumário e do conteúdo (ruling 13); alvos do sumário >= 24 px; o
// rolador da tabela larga focável e rolável pelo teclado só enquanto transborda; troca de
// idioma ao vivo nos rótulos, sem re-inserção do conteúdo.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { contrastRatio, effectiveBackground, toRgb } from './helpers/contrast';
import {
  blockThirdParty,
  gotoRender,
  renderHost,
  waitForRender,
} from './helpers/render';

/** Viewport em que a `WIDE_TABLE` do app transborda o contêiner (R6). */
const NARROW = { width: 400, height: 800 };

/** Tabela com legenda (ruling 10: o fixture não tem `caption`). */
const CAPTION_TABLE =
  '<table><caption>Legenda</caption><tbody><tr><td><p>a</p></td></tr></tbody></table>';

async function severe(page: Page, disabled: string[] = []) {
  const results = await new AxeBuilder({ page })
    .include('[data-testid^=render]')
    .include('rte-toc')
    .disableRules(disabled)
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
}

/** `outline` do elemento focado e o `--rte-focus-width` resolvido nele. */
function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.width = 'var(--rte-focus-width)';
    el.append(probe);
    const token = getComputedStyle(probe).width;
    probe.remove();
    return {
      visible: el.matches(':focus-visible'),
      style: s.outlineStyle,
      width: s.outlineWidth,
      token,
    };
  });
}

/** Foco "de teclado" num link: uma tecla antes e `focus()` (o WebKit não tabula links). */
async function keyboardFocus(page: Page, target: Locator): Promise<void> {
  await page.keyboard.press('Shift');
  await target.focus();
  await expect(target).toBeFocused();
}

function wideScroller(page: Page): Locator {
  return renderHost(page, 'render-wide').locator('.rte-table-scroll');
}

for (const zone of [false, true]) {
  const build = zone ? 'zone.js' : 'zoneless';

  test.describe(`L5 acessibilidade e rolador (${build})`, () => {
    test.beforeEach(async ({ context }) => {
      await blockThirdParty(context);
    });

    for (const scheme of ['light', 'dark', 'forced'] as const) {
      test(`R11 (${scheme}): axe sem violações serious/critical`, async ({
        page,
        browserName,
      }) => {
        test.setTimeout(120_000);
        // 400 px: a tabela larga transborda e o rolador marcado entra na análise.
        await page.setViewportSize(NARROW);
        await gotoRender(page, '/render', { zone });
        // Firefox não reavalia @media de folhas já carregadas ao mudar a emulação:
        // emulação e recarga (como o N14).
        await page.emulateMedia(
          scheme === 'forced'
            ? { forcedColors: 'active' }
            : { colorScheme: scheme },
        );
        await page.reload();
        await waitForRender(page);
        if (scheme === 'forced') {
          const active = await page.evaluate(
            () => matchMedia('(forced-colors: active)').matches,
          );
          if (browserName === 'chromium') expect(active).toBe(true);
          test.skip(
            !active,
            `${browserName}: emulateMedia({forcedColors}) não ativa (forced-colors: active) neste motor`,
          );
        } else {
          expect(
            await page.evaluate(
              (s) => matchMedia(`(prefers-color-scheme: ${s})`).matches,
              scheme,
            ),
          ).toBe(true);
        }
        await page.evaluate(
          (html) => window.rteE2e.setRenderInput(html),
          CAPTION_TABLE,
        );
        await expect(
          renderHost(page, 'render-input').locator('caption'),
        ).toHaveText('Legenda');
        await expect(wideScroller(page)).toHaveAttribute('role', 'region');
        await expect(page.locator('nav.rte-toc')).toBeVisible();
        // O WebKit não tem modo de cores forçadas (sem `forced-color-adjust`): a emulação só
        // liga a media query e as cores de sistema são as padrão do motor (`GrayText` =
        // preto a 40%, ~2,8:1 no branco), não uma paleta de contraste do sistema. Aí o
        // `color-contrast` não mede nada real (ele vale em claro e escuro nos 3 motores).
        const disabled: string[] = [];
        if (
          scheme === 'forced' &&
          !(await page.evaluate(() =>
            CSS.supports('forced-color-adjust', 'auto'),
          ))
        ) {
          disabled.push('color-contrast');
          test.info().annotations.push({
            type: 'forced-colors',
            description: `${browserName}: sem forced-color-adjust; color-contrast fora da análise`,
          });
        }
        expect(await severe(page, disabled)).toEqual([]);
      });
    }

    for (const scheme of ['light', 'dark'] as const) {
      test(`R11 (${scheme}): nav nomeado, contraste, alvos e foco visível dos links`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await gotoRender(page, '/render', { zone });
        await expect(page.locator('nav.rte-toc')).toHaveAccessibleName(
          'Table of contents',
        );

        const links: [string, Locator][] = [
          ['.rte-toc__link', page.locator('.rte-toc__link').first()],
          [
            '[data-testid="render-main"] a',
            renderHost(page, 'render-main').locator('a').first(),
          ],
        ];
        for (const [selector, link] of links) {
          const color = await toRgb(
            page,
            await link.evaluate((el) => getComputedStyle(el).color),
          );
          const bg = await effectiveBackground(page, selector);
          expect(
            contrastRatio(color, bg),
            `${selector}: ${color} sobre ${bg}`,
          ).toBeGreaterThanOrEqual(4.5);
        }

        const heights = await page
          .locator('.rte-toc__link')
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().height),
          );
        // `levels` padrão [2, 3]: os dois `h2` e o `h3` com texto (o vazio sai).
        expect(heights.length).toBe(3);
        expect(heights.filter((h) => h < 24)).toEqual([]);

        // Ruling 13: foco visível também nos links (sumário e conteúdo).
        for (const link of [
          page.locator('.rte-toc__link').first(),
          renderHost(page, 'render-main').getByRole('link', {
            name: 'fragmento',
          }),
        ]) {
          await keyboardFocus(page, link);
          const ring = await focusRing(page);
          expect(ring.visible).toBe(true);
          expect(ring.style).not.toBe('none');
          expect(ring.width).toBe(ring.token);
        }
      });
    }

    test('R6: rolador por teclado só enquanto a tabela transborda', async ({
      page,
    }) => {
      await page.setViewportSize(NARROW);
      await gotoRender(page, '/render', { zone });
      const scroller = wideScroller(page);
      await expect(scroller).toHaveAttribute('tabindex', '0');
      await expect(scroller).toHaveAttribute('role', 'region');
      await expect(scroller).toHaveAttribute('aria-label', 'Scrollable table');

      // `Tab` a partir do elemento anterior (o último link de `render-main`).
      await keyboardFocus(
        page,
        renderHost(page, 'render-main').getByRole('link', {
          name: 'Segunda matéria',
        }),
      );
      await page.keyboard.press('Tab');
      await expect(scroller).toBeFocused();
      const ring = await focusRing(page);
      expect(ring.visible).toBe(true);
      expect(ring.style).toBe('solid');
      expect(ring.width).toBe(ring.token);

      const left = () => scroller.evaluate((el) => el.scrollLeft);
      const max = await scroller.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      expect(max).toBeGreaterThan(0);
      await page.keyboard.press('ArrowRight');
      await expect.poll(left).toBeGreaterThan(0);
      // A seta rola com animação: esperar parar antes do `End`/`Home` (no Chromium o resto
      // da animação somava alguns px depois do `Home`).
      await expect
        .poll(async () => {
          const before = await left();
          await page.waitForTimeout(150);
          return before > 0 && (await left()) === before;
        })
        .toBe(true);
      await page.keyboard.press('End');
      await expect.poll(left).toBeGreaterThanOrEqual(max - 1);
      await page.keyboard.press('Home');
      await expect.poll(left).toBe(0);

      // Cabe: os três atributos saem.
      await page.setViewportSize({ width: 1600, height: 800 });
      for (const name of ['tabindex', 'role', 'aria-label']) {
        await expect
          .poll(() => scroller.evaluate((el, n) => el.hasAttribute(n), name))
          .toBe(false);
      }
    });

    test('R6: em 1280 o rolador de render-main nunca recebe foco', async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoRender(page, '/render', { zone });
      const mainScroller = renderHost(page, 'render-main').locator(
        '.rte-table-scroll',
      );
      await expect(mainScroller).toHaveCount(1);
      // A tabela do fixture cabe: o rolador não transborda.
      expect(
        await mainScroller.evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(false);

      // Do último link da navegação do app até o foco passar do rolador na ordem do
      // documento (depois dele não há volta num percurso para a frente). Não até o fim de
      // `render-main`: no Firefox o `Tab` fica dezenas de vezes nos `iframe` bloqueados.
      await keyboardFocus(page, page.locator('#nav-perf'));
      const seen: string[] = [];
      let past = false;
      for (let i = 0; i < 80 && !past; i++) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() => {
          const scroller = document.querySelector(
            '[data-testid="render-main"] .rte-table-scroll',
          )!;
          const el = document.activeElement;
          if (!el || el === document.body) return 'body';
          if (scroller.contains(el)) return 'main-scroller';
          if (
            scroller.compareDocumentPosition(el) &
            Node.DOCUMENT_POSITION_FOLLOWING
          )
            return 'past';
          return el.tagName;
        });
        seen.push(where);
        past = where === 'past' || where === 'body';
      }
      expect(past, seen.join(' ')).toBe(true);
      expect(seen).not.toContain('main-scroller');
      await expect(mainScroller).not.toHaveAttribute('tabindex');
    });

    test('R12: troca de idioma ao vivo, sem re-inserção', async ({ page }) => {
      await page.setViewportSize(NARROW);
      await gotoRender(page, '/render', { zone });
      const scroller = wideScroller(page);
      await expect(scroller).toHaveAttribute('aria-label', 'Scrollable table');
      await page.evaluate(() => {
        window.__renderH2 = document.querySelector(
          '[data-testid="render-main"] h2',
        );
      });
      await page.evaluate(() => window.rteE2e.setLang('pt-BR'));
      await expect(page.locator('nav.rte-toc')).toHaveAttribute(
        'aria-label',
        'Sumário',
      );
      await expect(scroller).toHaveAttribute(
        'aria-label',
        'Tabela com rolagem horizontal',
      );
      expect(
        await page.evaluate(
          () =>
            window.__renderH2 ===
            document.querySelector('[data-testid="render-main"] h2'),
        ),
      ).toBe(true);
    });
  });
}
