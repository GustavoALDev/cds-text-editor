import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  appUrl,
  collectConsole,
  editableOf,
  editorHost,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import { contrastRatio, effectiveBackground, toRgb } from './helpers/contrast';
import {
  centerScroller,
  expectFloating,
  floatingItem,
  floatingMenu,
  waitFloatingReady,
  type FloatingKind,
} from './helpers/floating';
import { frames, rteHtml, selectIn } from './helpers/toolbar';

// N25 (spec 05b2b, R13–R16): acessibilidade, tema, CSP e SSR dos menus
// flutuantes — axe por menu (e com o submenu de tabela) em claro, escuro e
// `forced-colors`, nome acessível, foco visível, alvos, contraste, idioma ao
// vivo, duas instâncias com temas diferentes, 0 violações de CSP, HTML do
// servidor sem `.rte-floating`, console sem `NG05xx` e, no build zone, rolar a
// página com o menu visível sem detecção de mudanças.

const ID = 'floating';
const KINDS: FloatingKind[] = ['text', 'link', 'table', 'image'];

const NAMES: Record<FloatingKind, string> = {
  text: 'Text formatting',
  link: 'Link',
  table: 'Table',
  image: 'Image',
};

async function ready(page: Page, id: 'floating' | 'floating-alt' = ID) {
  await waitForEditor(page, id);
  await expect.poll(() => rteHtml(page, id)).toContain('Segundo parágrafo.');
  await waitFloatingReady(page, id);
}

/** Mostra o menu `kind` do editor `id` (rolando o alvo para a área visível). */
async function show(
  page: Page,
  kind: FloatingKind,
  id: 'floating' | 'floating-alt' = ID,
): Promise<void> {
  const editable = editableOf(page, id);
  if (kind === 'text') {
    await selectIn(page, id, 'Segundo');
  } else if (kind === 'link') {
    await selectIn(page, id, 'um link', 2, 2);
  } else if (kind === 'table') {
    await editable.locator('td', { hasText: 'A1' }).scrollIntoViewIfNeeded();
    await selectIn(page, id, 'A1', 1, 1);
  } else {
    // A imagem do fixture tem 1 x 1 px e um menu aberto pode cobri-la: o clique
    // real está no N21/N24; aqui a seleção de nó vem do comando.
    await editable.locator('figure img').scrollIntoViewIfNeeded();
    await editorHost(page, id).evaluate((host) => {
      const editor = window.rteE2e.getRteEditor(host);
      let at = -1;
      editor?.state.doc.descendants((node, pos) => {
        if (at < 0 && node.type.name === 'rtImage') at = pos;
        return at < 0;
      });
      editor?.chain().focus().setNodeSelection(at).run();
    });
  }
  await expectFloating(page, id, kind);
  await frames(page);
}

async function severe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
}

/** Abre o submenu "More table operations" do menu de tabela visível. */
async function openMore(page: Page, label = 'More table operations') {
  const menu = floatingMenu(page, ID, 'table');
  await floatingItem(menu, label).click();
  const sub = menu.locator('.rte-menu');
  await expect(sub).toBeVisible();
  return sub;
}

for (const scheme of ['light', 'dark', 'forced'] as const) {
  test(`N25 (${scheme}): axe sem violações serious/critical em cada menu e com o submenu`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    if (scheme === 'forced') {
      await page.emulateMedia({ forcedColors: 'active' });
    } else {
      await page.emulateMedia({ colorScheme: scheme });
    }
    // A emulação vem antes da carga (Firefox não reavalia @media já carregado).
    await gotoApp(page, '/floating');
    await ready(page);
    if (scheme === 'forced') {
      const active = await page.evaluate(
        () => matchMedia('(forced-colors: active)').matches,
      );
      if (browserName === 'chromium') expect(active).toBe(true);
      test.skip(
        !active,
        `${browserName}: emulateMedia({forcedColors}) não ativa (forced-colors: active) neste motor`,
      );
    }
    for (const kind of KINDS) {
      await show(page, kind);
      expect(await severe(page), kind).toEqual([]);
    }
    await show(page, 'table');
    await openMore(page);
    expect(await severe(page), 'table + submenu').toEqual([]);
  });
}

test('N25: cada menu tem o nome acessível do rótulo (en e pt-BR)', async ({
  page,
}) => {
  await gotoApp(page, '/floating');
  await ready(page);
  for (const kind of KINDS) {
    await show(page, kind);
    await expect(floatingMenu(page, ID, kind)).toHaveAccessibleName(
      NAMES[kind],
    );
    await expect(floatingMenu(page, ID, kind)).toHaveAttribute(
      'role',
      'toolbar',
    );
    await expect(floatingMenu(page, ID, kind)).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
  }
  await page.evaluate(() => window.rteE2e.setLang('pt-BR'));
  const pt: Record<FloatingKind, string> = {
    text: 'Formatação do texto',
    link: 'Link',
    table: 'Tabela',
    image: 'Imagem',
  };
  for (const kind of KINDS) {
    await show(page, kind);
    await expect(floatingMenu(page, ID, kind)).toHaveAccessibleName(pt[kind]);
  }
});

test('N25: foco visível com outline de --rte-focus-width no botão e no endereço', async ({
  page,
}) => {
  await gotoApp(page, '/floating');
  await ready(page);
  const outline = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return {
        width: s.outlineWidth,
        style: s.outlineStyle,
        token: s.getPropertyValue('--rte-focus-width').trim(),
      };
    });
  await show(page, 'text');
  await page.keyboard.press('Alt+F10');
  const button = await outline();
  expect(button.style).toBe('solid');
  expect(button.width).toBe(button.token);
  expect(button.width).toBe('2px');

  await page.keyboard.press('Escape');
  await show(page, 'link');
  await page.keyboard.press('Alt+F10');
  expect(
    await page.evaluate(() => document.activeElement?.tagName.toLowerCase()),
  ).toBe('a');
  const address = await outline();
  expect(address.style).toBe('solid');
  expect(address.width).toBe(address.token);
});

test('N25: alvos >= 24 x 24 em cada menu e no submenu', async ({ page }) => {
  await gotoApp(page, '/floating');
  await ready(page);
  const small = (kind: FloatingKind, selector: string) =>
    floatingMenu(page, ID, kind)
      .locator(selector)
      .evaluateAll((els) =>
        els
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              name:
                el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
              width: r.width,
              height: r.height,
            };
          })
          .filter((s) => s.width < 24 || s.height < 24),
      );
  for (const kind of KINDS) {
    await show(page, kind);
    const items = await floatingMenu(page, ID, kind)
      .locator('.rte-toolbar__button, a.rte-floating__link')
      .count();
    expect(items, kind).toBeGreaterThan(1);
    expect(
      await small(kind, '.rte-toolbar__button, a.rte-floating__link'),
      kind,
    ).toEqual([]);
  }
  await show(page, 'table');
  await openMore(page);
  expect(await small('table', '.rte-menu__item')).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`N25 (${scheme}): contraste >= 4,5 do endereço do link e dos rótulos do submenu`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await gotoApp(page, '/floating');
    await ready(page);
    const root = `rte-editor[data-testid="floating"]`;
    const ratio = async (selector: string): Promise<number> => {
      const color = await page.evaluate(
        (sel) => getComputedStyle(document.querySelector(sel) as Element).color,
        selector,
      );
      const bg = await effectiveBackground(page, selector);
      return contrastRatio(await toRgb(page, color), bg);
    };
    await show(page, 'link');
    expect(
      await ratio(`${root} .rte-floating--link .rte-floating__address`),
    ).toBeGreaterThanOrEqual(4.5);
    await show(page, 'table');
    await openMore(page);
    expect(
      await ratio(`${root} .rte-floating--table .rte-menu__label`),
    ).toBeGreaterThanOrEqual(4.5);
  });
}

test('N25: setLang pt-BR com o menu de link visível traduz sem ocultar', async ({
  page,
}) => {
  await gotoApp(page, '/floating');
  await ready(page);
  await show(page, 'link');
  const menu = floatingMenu(page, ID, 'link');
  const html = await rteHtml(page, ID);
  await page.evaluate(() => window.rteE2e.setLang('pt-BR'));
  await expect(menu.locator('[aria-label="Editar link"]')).toHaveCount(1);
  await expect(menu.locator('[aria-label="Remover link"]')).toHaveCount(1);
  await expect(menu.locator('a.rte-floating__link')).toHaveAttribute(
    'title',
    'Abre em nova aba',
  );
  await expectFloating(page, ID, 'link');
  expect(await rteHtml(page, ID)).toBe(html);
  await page.evaluate(() => window.rteE2e.setLang('en'));
  await expect(menu.locator('[aria-label="Edit link"]')).toHaveCount(1);
  await expectFloating(page, ID, 'link');
});

test('N25 (R14): dois editores com temas diferentes têm botões pressionados de cores diferentes', async ({
  page,
}) => {
  await gotoApp(page, '/floating');
  await ready(page);
  await waitForEditor(page, 'floating-alt');
  await waitFloatingReady(page, 'floating-alt');
  const pressed = async (id: 'floating' | 'floating-alt') => {
    await selectIn(page, id, 'Segundo');
    await expectFloating(page, id, 'text');
    const menu = floatingMenu(page, id, 'text');
    await floatingItem(menu, 'Bold').click();
    const button = menu.locator('.rte-toolbar__button--pressed');
    await expect(button.first()).toBeVisible();
    return button
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  };
  const a = await pressed('floating');
  const b = await pressed('floating-alt');
  expect(a).not.toBe(b);
});

test('N25 (R14): 0 violações de CSP ao mostrar, posicionar, rolar, executar e ocultar todos os menus', async ({
  page,
  browserName,
}) => {
  test.setTimeout(90_000);
  await gotoApp(page, '/floating');
  await ready(page);
  // Ruling 28 do ADR 0007: o desvio do Chromium (`style-src-attr`) só na carga.
  await settlePage(page);
  const load = await page.evaluate(() => window.__violations.splice(0));
  // a partir daqui, nenhum `<style>` novo: a posição é só por CSSOM (D16)
  await page.evaluate(() => window.__styleAdds.splice(0));
  expect(
    load.filter(
      (v) => !(browserName === 'chromium' && v.directive === 'style-src-attr'),
    ),
  ).toEqual([]);

  await centerScroller(page);
  // texto: mostrar, rolar a página, executar (Bold) e desfazer
  await show(page, 'text');
  await page.mouse.move(4, 300);
  await page.mouse.wheel(0, 30);
  await frames(page);
  await floatingItem(floatingMenu(page, ID, 'text'), 'Bold').click();
  await expect.poll(() => rteHtml(page, ID)).toContain('<strong>Segundo');
  await page.keyboard.press('ControlOrMeta+z');
  // link
  await show(page, 'link');
  await frames(page);
  // tabela: executar "Insert row below" e o submenu
  await show(page, 'table');
  await floatingItem(
    floatingMenu(page, ID, 'table'),
    'Insert row below',
  ).click();
  await expect.poll(() => rteHtml(page, ID)).toContain('<td><p></p></td>');
  await page.keyboard.press('ControlOrMeta+z');
  await show(page, 'table');
  await openMore(page);
  await page.keyboard.press('Escape');
  // imagem: executar um alinhamento e desfazer
  await show(page, 'image');
  await floatingItem(floatingMenu(page, ID, 'image'), 'Align left').click();
  await expect.poll(() => rteHtml(page, ID)).toContain('rt-figure--left');
  await page.keyboard.press('ControlOrMeta+z');
  // rolar o contêiner até a âncora sair e ocultar
  await show(page, 'text');
  await page.locator('.e2e-floating-scroller').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await frames(page);
  await selectIn(page, ID, 'Segundo parágrafo.', 2, 2);
  await expectFloating(page, ID, null);
  await settlePage(page);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(await page.evaluate(() => window.__styleAdds)).toEqual([]);
});

for (const zone of [false, true]) {
  test(`N25 (R16, ${zone ? 'zone' : 'zoneless'}): HTML do servidor sem .rte-floating; console sem NG05xx/NG0100/NG0101`, async ({
    page,
  }) => {
    const raw = await (
      await page.request.get(appUrl('/floating', { zone }))
    ).text();
    expect(raw).toContain('rte-editor');
    expect(raw).not.toContain('rte-floating');

    const messages = collectConsole(page);
    await gotoApp(page, '/floating', { zone });
    await ready(page);
    for (const kind of KINDS) await show(page, kind);
    await settlePage(page);
    expect(
      messages.filter((m) => /NG05\d\d|NG0100|NG0101/.test(m)),
      messages.join('\n'),
    ).toEqual([]);
  });
}

test('N25 (R16, zone): rolar a página 10x com o menu visível não dispara detecção de mudanças', async ({
  page,
}) => {
  await gotoApp(page, '/floating', { zone: true });
  await ready(page);
  await centerScroller(page);
  await show(page, 'text');
  await frames(page);
  const before = await page.evaluate(() => window.rteE2e.zoneTurns());
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 3));
    await frames(page);
  }
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  expect(await page.evaluate(() => window.rteE2e.zoneTurns())).toBe(before);
  await expectFloating(page, ID, 'text');
});

test('N25 (R16, zone): sanidade do contador — uma ação da ponte gera ao menos um turno', async ({
  page,
}) => {
  await gotoApp(page, '/floating', { zone: true });
  await ready(page);
  const before = await page.evaluate(() => window.rteE2e.zoneTurns());
  await page.evaluate(() => window.rteE2e.setLang('pt-BR'));
  await frames(page);
  expect(await page.evaluate(() => window.rteE2e.zoneTurns())).toBeGreaterThan(
    before,
  );
});
