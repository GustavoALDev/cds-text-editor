import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  appUrl,
  editorHost,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import { openMenu } from './helpers/toolbar';

// N12 (spec 05b1, R10, U15): tema por instância. Duas instâncias com
// primárias diferentes têm tokens computados diferentes, cada uma igual ao que
// o `applyRteTheme` produz num `.rte-root` isolado com a mesma semente; o modo
// escuro numa só não vaza para a outra; trocar ao vivo reaplica e
// `undefined` volta à cascata; o HTML do servidor traz `data-rte-mode` e
// nenhum atributo `style`; o menu aberto herda as cores da instância; nada
// disso viola a CSP.

/** Temas da página `toolbar` (`pages/toolbar.ts`). */
const MAIN = { primary: '#1d4ed8' };
const ALT = { primary: '#0b6e4f', mode: 'light' as const };

const TOKENS = [
  '--rte-primary',
  '--rte-primary-text',
  '--rte-primary-subtle',
  '--rte-surface',
  '--rte-text',
] as const;

type Theme = { primary?: string; mode?: 'light' | 'dark' };

/** Cor computada de cada token no elemento (sonda com `color: var(...)` por CSSOM). */
function tokensOf(target: Locator): Promise<Record<string, string>> {
  return target.evaluate((el, tokens) => {
    const out: Record<string, string> = {};
    for (const token of tokens) {
      const probe = el.ownerDocument.createElement('span');
      probe.style.setProperty('color', `var(${token})`);
      el.appendChild(probe);
      out[token] = getComputedStyle(probe).color;
      probe.remove();
    }
    return out;
  }, TOKENS);
}

/** Tokens de um `.rte-root` isolado com `applyRteTheme(theme)` (ou sem tema). */
function referenceTokens(
  page: Page,
  theme: Theme | null,
): Promise<Record<string, string>> {
  return page.evaluate(
    ({ theme, tokens }) => {
      const root = document.createElement('div');
      root.className = 'rte-root';
      document.body.appendChild(root);
      if (theme) window.rteE2e.applyTheme(root, theme);
      const out: Record<string, string> = {};
      for (const token of tokens) {
        const probe = document.createElement('span');
        probe.style.setProperty('color', `var(${token})`);
        root.appendChild(probe);
        out[token] = getComputedStyle(probe).color;
      }
      root.remove();
      return out;
    },
    { theme, tokens: TOKENS },
  );
}

function setTheme(page: Page, id: 'toolbar' | 'toolbar-alt', theme?: Theme) {
  return page.evaluate(({ id, theme }) => window.rteE2e.setTheme(id, theme), {
    id,
    theme,
  });
}

async function expectNoViolations(page: Page): Promise<void> {
  await settlePage(page);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/toolbar');
  await waitForEditor(page, 'toolbar');
  await waitForEditor(page, 'toolbar-alt');
});

test('N12: duas instâncias com primárias diferentes, cada uma igual ao applyRteTheme isolado', async ({
  page,
}) => {
  const main = editorHost(page, 'toolbar');
  const alt = editorHost(page, 'toolbar-alt');
  await expect
    .poll(async () => (await tokensOf(main))['--rte-primary'])
    .toBe('rgb(29, 78, 216)');
  const mainTokens = await tokensOf(main);
  const altTokens = await tokensOf(alt);
  expect(mainTokens['--rte-primary-text']).not.toBe(
    altTokens['--rte-primary-text'],
  );
  expect(mainTokens['--rte-primary-subtle']).not.toBe(
    altTokens['--rte-primary-subtle'],
  );
  expect(mainTokens).toEqual(await referenceTokens(page, MAIN));
  expect(altTokens).toEqual(await referenceTokens(page, ALT));
  // Um editor sem tema segue a cascata.
  expect(await tokensOf(editorHost(page, 'toolbar-nofeat'))).toEqual(
    await referenceTokens(page, null),
  );
  // Só o `toolbar-alt` tem modo.
  await expect(alt).toHaveAttribute('data-rte-mode', 'light');
  await expect(main).not.toHaveAttribute('data-rte-mode');
  await expectNoViolations(page);
});

test('N12: modo escuro numa instância só; troca ao vivo e limpeza', async ({
  page,
}) => {
  const main = editorHost(page, 'toolbar');
  const alt = editorHost(page, 'toolbar-alt');
  const scheme = (host: Locator) =>
    host.evaluate((el) => getComputedStyle(el).colorScheme);
  const mainBefore = await tokensOf(main);

  await setTheme(page, 'toolbar-alt', { mode: 'dark' });
  await expect(alt).toHaveAttribute('data-rte-mode', 'dark');
  await expect.poll(() => scheme(alt)).toBe('dark');
  // O outro segue o padrão do theme.css (sem modo: `light dark`, o sistema,
  // aqui claro) e os tokens não mudam.
  expect(await scheme(main)).toBe('light dark');
  expect(await tokensOf(alt)).toEqual(
    await referenceTokens(page, { mode: 'dark' }),
  );
  expect(await tokensOf(main)).toEqual(mainBefore);

  // Troca ao vivo: reaplica com a semente nova.
  const red = { primary: '#b3261e' };
  await setTheme(page, 'toolbar', red);
  await expect
    .poll(async () => (await tokensOf(main))['--rte-primary'])
    .toBe('rgb(179, 38, 30)');
  expect(await tokensOf(main)).toEqual(await referenceTokens(page, red));

  // `undefined`: a limpeza tira tudo o que o tema gravou; vale a cascata.
  await setTheme(page, 'toolbar', undefined);
  await setTheme(page, 'toolbar-alt', undefined);
  await expect(alt).not.toHaveAttribute('data-rte-mode');
  const cascade = await referenceTokens(page, null);
  await expect.poll(() => tokensOf(main)).toEqual(cascade);
  await expect.poll(() => tokensOf(alt)).toEqual(cascade);
  for (const host of [main, alt]) {
    expect(await host.getAttribute('style')).toBeFalsy();
  }
  await expectNoViolations(page);
});

test('N12: o menu aberto herda as cores da instância', async ({ page }) => {
  await page.evaluate(() => window.rteE2e.setToolbar('toolbar-alt', 'full'));
  const alt = editorHost(page, 'toolbar-alt');
  const menu = await openMenu(page, 'toolbar-alt', 'Text color');
  const surface = (await tokensOf(alt))['--rte-surface'];
  const text = (await tokensOf(alt))['--rte-text'];
  expect(
    await menu.evaluate((m) => {
      const s = getComputedStyle(m);
      return { background: s.backgroundColor, color: s.color };
    }),
  ).toEqual({ background: surface, color: text });

  // Em escuro, o menu acompanha (herda `color-scheme` e tokens do host).
  await page.keyboard.press('Escape');
  await setTheme(page, 'toolbar-alt', { primary: '#0b6e4f', mode: 'dark' });
  await expect(alt).toHaveAttribute('data-rte-mode', 'dark');
  const dark = await openMenu(page, 'toolbar-alt', 'Text color');
  const darkSurface = (await tokensOf(alt))['--rte-surface'];
  expect(darkSurface).not.toBe(surface);
  expect(await dark.evaluate((m) => getComputedStyle(m).backgroundColor)).toBe(
    darkSurface,
  );
  await expectNoViolations(page);
});

for (const zone of [false, true]) {
  test(`N12 (${zone ? 'zone' : 'zoneless'}): HTML do servidor com data-rte-mode e sem style no editor`, async ({
    request,
  }) => {
    const html = await (await request.get(appUrl('/toolbar', { zone }))).text();
    const tag = (id: string) =>
      new RegExp(`<rte-editor[^>]*data-testid="${id}"[^>]*>`).exec(html)?.[0];
    expect(tag('toolbar-alt')).toContain('data-rte-mode="light"');
    expect(tag('toolbar')).toBeDefined();
    expect(tag('toolbar')).not.toContain('data-rte-mode');
    const editors = html.match(/<rte-editor[\s\S]*?<\/rte-editor>/g) ?? [];
    expect(editors).toHaveLength(4);
    for (const editor of editors) {
      expect(editor).toContain('class="rte-toolbar');
      expect(editor).not.toMatch(/\sstyle=/);
    }
  });
}
