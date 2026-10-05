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
import { frames, rteHtml, selectIn } from './helpers/toolbar';

// N22 (spec 05b2b, R5): a posição dos menus flutuantes em navegador real —
// acima da seleção com 8 px, abaixo na primeira linha visível do contêiner,
// `overlay` com a tabela mais alta que a área visível, limites da viewport em
// 320 px, acompanha a rolagem da página e do contêiner, some e volta quando a
// âncora sai e reentra, nenhum quadro em `0,0`, `rtl`, endereço de 2000
// caracteres e `pointer: coarse` (texto abaixo da seleção).

const ID = 'floating';
const GAP = 8;

async function ready(page: Page): Promise<void> {
  await waitForEditor(page, ID);
  await expect.poll(() => rteHtml(page, ID)).toContain('Segundo parágrafo.');
  await waitFloatingReady(page, ID);
}

/** Troca o documento do `floating` e espera a mudança chegar ao editor. */
async function setDoc(page: Page, html: string, marker: string): Promise<void> {
  await frames(page);
  await page.evaluate((h) => window.rteE2e.setValue('floating', h), html);
  await expect.poll(() => rteHtml(page, ID)).toContain(marker);
}

/** Documento com um parágrafo-alvo no topo e muitos parágrafos depois. */
function longDoc(): string {
  return (
    '<p>Alvo da rolagem.</p>' +
    Array.from({ length: 60 }, (_, i) => `<p>Enchimento ${i}</p>`).join('')
  );
}

/** Rola a página inteira por `dy` com a roda, fora do contêiner. */
async function wheelPage(page: Page, dy: number): Promise<void> {
  await page.mouse.move(4, 300);
  await page.mouse.wheel(0, dy);
}

/** Rola o contêiner por `dy` com a roda, sobre ele. */
async function wheelScroller(
  page: Page,
  dy: number,
  afterPageWheel = false,
): Promise<void> {
  // Firefox mantém a "transação de roda" (~1,5 s) no último alvo rolado.
  if (afterPageWheel) await page.waitForTimeout(1600);
  const box = await page.locator('.e2e-floating-scroller').boundingBox();
  if (!box) throw new Error('contêiner ausente');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, dy);
}

function scrollTopOf(page: Page): Promise<number> {
  return page.locator('.e2e-floating-scroller').evaluate((el) => el.scrollTop);
}

/** Área visível do editável dentro do contêiner e da viewport. */
function visibleTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document
      .querySelector('.e2e-floating-scroller')
      ?.getBoundingClientRect();
    const editable = document
      .querySelector('rte-editor[data-testid="floating"] .ProseMirror')
      ?.getBoundingClientRect();
    return Math.max(0, scroller?.top ?? 0, editable?.top ?? 0);
  });
}

for (const zone of [false, true]) {
  test.describe(`N22 (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/floating', { zone });
      await ready(page);
    });

    test('texto: acima da seleção com 8 px de folga', async ({ page }) => {
      await centerScroller(page);
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      await frames(page);
      const menu = await floatingRect(page, ID, 'text');
      const word = await wordRect(page, ID, 'p', 'Segundo');
      expect(Math.abs(menu.bottom + GAP - word.top)).toBeLessThanOrEqual(1);
      // inteiro na viewport, centrado na seleção
      const vw = page.viewportSize()?.width ?? 0;
      expect(menu.left).toBeGreaterThanOrEqual(8);
      expect(menu.right).toBeLessThanOrEqual(vw - 8);
      const wordCenter = (word.left + word.right) / 2;
      expect(Math.abs((menu.left + menu.right) / 2 - wordCenter)).toBeLessThan(
        2,
      );
    });

    test('texto na primeira linha visível do contêiner: abaixo', async ({
      page,
    }) => {
      await centerScroller(page);
      await selectIn(page, ID, 'Primeiro');
      await expectFloating(page, ID, 'text');
      await frames(page);
      const menu = await floatingRect(page, ID, 'text');
      const word = await wordRect(page, ID, 'p', 'Primeiro');
      expect(Math.abs(menu.top - (word.bottom + GAP))).toBeLessThanOrEqual(1);
    });

    test('tabela mais alta que a área visível: overlay no topo visível + 8', async ({
      page,
    }) => {
      const rows = Array.from(
        { length: 40 },
        (_, i) => `<tr><td><p>L${i}</p></td></tr>`,
      ).join('');
      await setDoc(page, `<table><tbody>${rows}</tbody></table>`, 'L39');
      await centerScroller(page);
      await selectIn(page, ID, 'L1', 1, 1);
      await expectFloating(page, ID, 'table');
      await frames(page);
      const menu = await floatingRect(page, ID, 'table');
      const table = await editableOf(page, ID)
        .locator('table')
        .evaluate((el) => el.getBoundingClientRect().toJSON());
      const top = await visibleTop(page);
      const expected = Math.max(table.top, top) + GAP;
      expect(Math.abs(menu.top - expected)).toBeLessThanOrEqual(1);
    });

    test('viewport de 320 x 640: menus em [8, 312], sem rolagem horizontal', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await centerScroller(page);
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      await frames(page);
      const checks: [string, () => Promise<void>][] = [
        ['text', async () => undefined],
        [
          'link',
          async () => {
            await selectIn(page, ID, 'um link', 2, 2);
          },
        ],
        [
          'table',
          async () => {
            await editableOf(page, ID)
              .locator('td', { hasText: 'A1' })
              .scrollIntoViewIfNeeded();
            await selectIn(page, ID, 'A1', 1, 1);
          },
        ],
      ];
      for (const [kind, prepare] of checks) {
        await prepare();
        await expectFloating(page, ID, kind as 'text' | 'link' | 'table');
        await frames(page);
        const r = await floatingRect(
          page,
          ID,
          kind as 'text' | 'link' | 'table',
        );
        expect(r.left, kind).toBeGreaterThanOrEqual(8);
        expect(r.right, kind).toBeLessThanOrEqual(312);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          kind,
        ).toBeLessThanOrEqual(320);
      }
    });

    test('rolar a página e o contêiner: o menu acompanha a âncora', async ({
      page,
    }) => {
      await setDoc(page, longDoc(), 'Enchimento 59');
      await centerScroller(page);
      await selectIn(page, ID, 'Alvo', 0, 4);
      await expectFloating(page, ID, 'text');
      const gap = async (): Promise<number> => {
        const menu = await floatingRect(page, ID, 'text');
        const word = await wordRect(page, ID, 'p', 'Alvo');
        // acima (menu.bottom + 8 = âncora.top) ou abaixo (menu.top = âncora.bottom + 8)
        return Math.min(
          Math.abs(menu.bottom + GAP - word.top),
          Math.abs(menu.top - (word.bottom + GAP)),
        );
      };
      expect(await gap()).toBeLessThanOrEqual(1);

      const before = await wordRect(page, ID, 'p', 'Alvo');
      await wheelPage(page, 60);
      await expect
        .poll(async () => (await wordRect(page, ID, 'p', 'Alvo')).top)
        .toBeLessThan(before.top);
      await expect.poll(gap).toBeLessThanOrEqual(1);
      await expectFloating(page, ID, 'text');

      await wheelScroller(page, 40, true);
      await expect.poll(() => scrollTopOf(page)).toBeGreaterThan(0);
      await expect.poll(gap).toBeLessThanOrEqual(1);
      await expectFloating(page, ID, 'text');
    });

    test('a âncora sai da área visível do contêiner: nenhum menu; volta sem mudar a seleção', async ({
      page,
    }) => {
      await setDoc(page, longDoc(), 'Enchimento 59');
      await centerScroller(page);
      await selectIn(page, ID, 'Alvo', 0, 4);
      await expectFloating(page, ID, 'text');
      const selection = () =>
        editorHost(page, ID).evaluate((host) => {
          const { from, to } = window.rteE2e.getRteEditor(host)?.state
            .selection ?? {
            from: -1,
            to: -1,
          };
          return { from, to };
        });
      const original = await selection();

      for (let i = 0; i < 12 && (await scrollTopOf(page)) < 800; i++) {
        await wheelScroller(page, 400);
        await frames(page);
      }
      expect(await scrollTopOf(page)).toBeGreaterThan(300);
      await expectFloating(page, ID, null);
      expect(await selection()).toEqual(original);

      for (let i = 0; i < 12 && (await scrollTopOf(page)) > 0; i++) {
        await wheelScroller(page, -400);
        await frames(page);
      }
      expect(await scrollTopOf(page)).toBe(0);
      await expectFloating(page, ID, 'text');
      expect(await selection()).toEqual(original);
    });

    test('nenhum quadro em 0,0: a posição lida no primeiro toggle já é a final', async ({
      page,
    }) => {
      await editorHost(page, ID).evaluate((host) => {
        const w = window as unknown as {
          __opens: { kind: string | null; left: number; top: number }[];
        };
        w.__opens = [];
        for (const el of host.querySelectorAll<HTMLElement>('.rte-floating')) {
          el.addEventListener('toggle', (e) => {
            if ((e as ToggleEvent).newState !== 'open') return;
            const r = el.getBoundingClientRect();
            w.__opens.push({
              kind: el.getAttribute('data-rte-kind'),
              left: r.left,
              top: r.top,
            });
          });
        }
      });
      await centerScroller(page);
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      await selectIn(page, ID, 'um link', 2, 2);
      await expectFloating(page, ID, 'link');
      await selectIn(page, ID, 'A1', 1, 1);
      await expectFloating(page, ID, 'table');
      await frames(page);
      const opens = await page.evaluate(
        () => (window as unknown as { __opens: unknown[] }).__opens,
      );
      expect(opens.length).toBeGreaterThanOrEqual(3);
      for (const o of opens as { kind: string; left: number; top: number }[]) {
        expect(o.left === 0 && o.top === 0, o.kind).toBe(false);
        expect(o.left, o.kind).toBeGreaterThan(0);
        expect(o.top, o.kind).toBeGreaterThan(0);
      }
    });

    test('dir=rtl no host: continua centrado na seleção', async ({ page }) => {
      await editorHost(page, ID).evaluate((host) =>
        host.setAttribute('dir', 'rtl'),
      );
      await centerScroller(page);
      await selectIn(page, ID, 'Segundo');
      await expectFloating(page, ID, 'text');
      await frames(page);
      const menu = await floatingRect(page, ID, 'text');
      const word = await wordRect(page, ID, 'p', 'Segundo');
      expect(
        Math.abs((menu.left + menu.right) / 2 - (word.left + word.right) / 2),
      ).toBeLessThan(2);
    });

    test('link com href de 2000 caracteres: endereço com reticências, menu na viewport', async ({
      page,
    }) => {
      const href = `https://example.com/${'a'.repeat(1980)}`;
      await setDoc(
        page,
        `<p>Com <a href="${href}">um link longo</a> aqui.</p>`,
        'um link longo',
      );
      await centerScroller(page);
      await selectIn(page, ID, 'um link longo', 3, 3);
      await expectFloating(page, ID, 'link');
      await frames(page);
      const menu = floatingMenu(page, ID, 'link');
      const link = menu.locator('.rte-floating__link');
      const address = link.locator('.rte-floating__address');
      const info = await link.evaluate((el) => {
        const root = parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        );
        const span = el.querySelector('.rte-floating__address') as HTMLElement;
        const icon = el.querySelector('svg') as SVGElement;
        const l = el.getBoundingClientRect();
        const i = icon.getBoundingClientRect();
        return {
          width: l.width,
          max: 20 * root,
          scrollWidth: span.scrollWidth,
          clientWidth: span.clientWidth,
          overflow: getComputedStyle(span).textOverflow,
          iconWidth: i.width,
          iconInside: i.left >= l.left - 0.5 && i.right <= l.right + 0.5,
        };
      });
      expect(info.width).toBeLessThanOrEqual(info.max + 0.5);
      expect(info.scrollWidth).toBeGreaterThan(info.clientWidth);
      expect(info.overflow).toBe('ellipsis');
      expect(info.iconWidth).toBeGreaterThan(8);
      expect(info.iconInside).toBe(true);
      await expect(address).toBeVisible();
      const r = await floatingRect(page, ID, 'link');
      const vw = page.viewportSize()?.width ?? 0;
      expect(r.left).toBeGreaterThanOrEqual(8);
      expect(r.right).toBeLessThanOrEqual(vw - 8);
    });
  });
}

test('N22 (pointer: coarse, Chromium): o menu de texto fica abaixo da seleção', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'isMobile/hasTouch só no Chromium');
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 700, height: 900 },
  });
  try {
    const page = await context.newPage();
    await gotoApp(page, '/floating');
    await ready(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    await centerScroller(page);
    await selectIn(page, ID, 'Segundo');
    await expectFloating(page, ID, 'text');
    await frames(page);
    const menu = await floatingRect(page, ID, 'text');
    const word = await wordRect(page, ID, 'p', 'Segundo');
    expect(Math.abs(menu.top - (word.bottom + GAP))).toBeLessThanOrEqual(1);
  } finally {
    await context.close();
  }
});
