import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRteTheme } from '../../../packages/theme/src/index';
import { ORIGIN, watch } from './helpers';

const CHECK_PAGE = readFileSync(
  new URL('./fixtures/theme-check.html', import.meta.url),
  'utf8',
);

// J7 (spec 07b, W12/W13): playground do tema. Preset muda os tokens computados da prévia; o
// relatório mostra 72 verificações; o CSS copiado, aplicado numa página estática só com o
// `theme.css` (`theme-check.html`), reproduz os 37 tokens da prévia (5 presets x claro/escuro e
// um tema próprio); a cópia pela área de transferência só é verificada no Chromium (permissões).
// "Usar sugestão": `checkRteTheme` não reprova cor real (os derivados se adaptam, ADR 0002), então
// o botão só aparece com relatório injetado, coberto pelo unitário (CONTRAST_TOOLS).

const TOKENS = Object.keys(createRteTheme());
const PRESETS = ['angular', 'ocean', 'forest', 'sunset', 'monochrome'] as const;
const PREVIEW = '[data-testid="preview-editor"]';

async function openTheme(
  browser: Browser,
  scheme: 'light' | 'dark',
  options: { clipboard?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    colorScheme: scheme,
    baseURL: ORIGIN,
    ...(options.clipboard
      ? { permissions: ['clipboard-read', 'clipboard-write'] }
      : {}),
  });
  const page = await context.newPage();
  await page.goto('/theme');
  await expect(page.locator(`${PREVIEW} .ProseMirror`)).toBeVisible({
    timeout: 30_000,
  });
  return { context, page };
}

/** Valor computado de cada token em `selector`; cores viram o `rgb()` resolvido por uma sonda. */
function tokensOf(
  page: Page,
  selector: string,
): Promise<Record<string, string>> {
  return page.evaluate(
    ({ selector, keys }) => {
      const el = document.querySelector(selector) as HTMLElement;
      const cs = getComputedStyle(el);
      const probe = document.createElement('span');
      el.appendChild(probe);
      const out: Record<string, string> = {};
      for (const key of keys) {
        probe.style.setProperty('border-top-color', 'rgb(1, 2, 3)');
        probe.style.setProperty('border-top-color', `var(${key})`);
        const resolved = getComputedStyle(probe).borderTopColor;
        const raw = cs.getPropertyValue(key).trim().replace(/\s+/g, ' ');
        out[key] = /light-dark|oklch|color-mix|rgb|#|color\(/.test(raw)
          ? resolved
          : raw;
      }
      probe.remove();
      return out;
    },
    { selector, keys: TOKENS },
  );
}

const settle = (page: Page) => page.waitForTimeout(250);

test('J7: o createRteTheme tem os 37 tokens', () => {
  expect(TOKENS).toHaveLength(37);
});

test('J7: preset muda os tokens da prévia; relatório 72/72 anunciado; sem erros', async ({
  browser,
}) => {
  const context = await browser.newContext({
    colorScheme: 'light',
    baseURL: ORIGIN,
  });
  const page = await context.newPage();
  const problems = await watch(page);
  await page.goto('/theme');
  await expect(page.locator(`${PREVIEW} .ProseMirror`)).toBeVisible({
    timeout: 30_000,
  });
  const summary = page.getByTestId('contrast-summary');
  await expect(summary).toHaveText('72 verificações: 0 reprovadas');
  await expect(summary).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByTestId('contrast-failed')).toHaveCount(0);

  const before = await tokensOf(page, PREVIEW);
  await page.getByTestId('preset-ocean').click();
  await settle(page);
  const after = await tokensOf(page, PREVIEW);
  expect(after['--rte-primary']).not.toBe(before['--rte-primary']);
  await expect(summary).toHaveText('72 verificações: 0 reprovadas');
  expect(problems.messages).toEqual([]);
  await context.close();
});

test('J7: cor inválida marca o campo, entra na lista e vira comentário no CSS', async ({
  browser,
}) => {
  const { context, page } = await openTheme(browser, 'light');
  await page.getByTestId('color-secondary').fill('banana');
  await expect(page.getByTestId('color-secondary')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByTestId('contrast-invalid')).toContainText('secondary');
  await expect(page.getByTestId('css-snippet')).toContainText(
    '/* secondary inválida: vale o padrão */',
  );
  await context.close();
});

async function reproduces(
  browser: Browser,
  scheme: 'light' | 'dark',
  setup: (page: Page) => Promise<void>,
): Promise<void> {
  const { context, page } = await openTheme(browser, scheme);
  await setup(page);
  await settle(page);
  const css = (await page.getByTestId('css-snippet').textContent()) ?? '';
  const preview = await tokensOf(page, PREVIEW);
  const check = await context.newPage();
  await check.route('**/copied.css', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: css }),
  );
  // A página fica em e2e/fixtures (fora do artefato publicado): o E2E a serve por `route`.
  await check.route('**/theme-check.html', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: CHECK_PAGE,
    }),
  );
  await check.goto('/theme-check.html');
  await expect(check.locator('#probe')).toBeVisible();
  await settle(check);
  const copied = await tokensOf(check, '#probe');
  const diffs = TOKENS.filter((k) => preview[k] !== copied[k]).map(
    (k) => `${k}: ${preview[k]} != ${copied[k]}`,
  );
  expect(diffs).toEqual([]);
  await context.close();
}

for (const preset of PRESETS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`J7: theme-check.html reproduz os 37 tokens (${preset}, ${scheme})`, async ({
      browser,
    }) => {
      await reproduces(browser, scheme, (page) =>
        page.getByTestId(`preset-${preset}`).click(),
      );
    });
  }
}

test('J7: theme-check.html reproduz o tema próprio (oklch, raio 2, densidade 0,9, cinza, secundária inválida, escuro)', async ({
  browser,
}) => {
  await reproduces(browser, 'light', async (page) => {
    await page.getByTestId('color-primary').fill('oklch(0.55 0.2 250)');
    await page.getByTestId('color-secondary').fill('banana');
    await page.getByTestId('radius').fill('2');
    await page.getByTestId('density').fill('0.9');
    await page.getByTestId('neutral').selectOption('gray');
    await page.getByTestId('mode').selectOption('dark');
  });
});

test('J7: cópia do CSS e do TypeScript (área de transferência só no Chromium; senão pelo <pre>)', async ({
  browser,
  browserName,
}) => {
  const { context, page } = await openTheme(browser, 'light', {
    clipboard: browserName === 'chromium',
  });
  await page.getByTestId('preset-sunset').click();
  await expect(page.getByTestId('css-snippet')).toContainText('--rte-primary');
  const css = (await page.getByTestId('css-snippet').textContent()) ?? '';
  const ts = (await page.getByTestId('ts-snippet').textContent()) ?? '';
  expect(css).toContain('--rte-primary');
  expect(ts).toContain("import { provideRichText } from '@cds/rte-angular';");
  if (browserName === 'chromium') {
    await page.getByTestId('copy-css').click();
    await expect(page.getByTestId('copied')).toHaveText('CSS copiado.');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    // O Chromium no Windows devolve CRLF; o <pre> usa LF.
    expect(clip.replace(/\r\n/g, '\n')).toBe(css);
    await page.getByTestId('copy-ts').click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          navigator.clipboard.readText().then((t) => t.replace(/\r\n/g, '\n')),
        ),
      )
      .toBe(ts);
  }
  await context.close();
});
