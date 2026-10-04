import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, effectiveBackground, toRgb } from './helpers/contrast';
import {
  editorHost,
  gotoApp,
  readFixture,
  settlePage,
  waitForEditor,
} from './helpers/app';

// N13 (spec 05b1, R9, R11, R12): o fixture `all-features` no editor e a mesma
// marcação numa página estática (`/content-static`: só `theme.css` +
// `content.css`, `.rte-root > .rte-content`) têm os mesmos estilos computados;
// no escuro a paleta usa o valor `dark` mesmo com o `style` claro no HTML; a
// variável do consumidor vence; o contraste é >= 4,5.
//
// A página estática tem a CSP estrita do app: os atributos `style` do fixture
// (`text-align`, larguras de coluna, `aspect-ratio` dos embeds) ficam
// bloqueados e por isso fora da comparação.

const SELECTORS = [
  'p',
  'h2',
  'h3',
  'h4',
  'ul > li',
  'ol',
  'blockquote:not(.rt-pullquote blockquote)',
  'hr',
  ':not(pre) > code',
  'pre',
  'a',
  'sup',
  'sub',
  'th',
  'td',
  'li.rt-task',
  '.rt-figure--left',
  '.rt-figure--center',
  '.rt-figure--right',
  '.rt-figure--full',
  '.rt-figure--video',
  'figcaption',
  '.rt-credit',
  '.rt-embed',
  '.rt-pullquote',
  '.rt-callout--info',
  '.rt-callout--success',
  '.rt-callout--warning',
  '.rt-callout--danger',
  '.rt-callout__title',
  '.rt-read-also',
  '.rt-read-also__title',
  'span[data-rt-color]',
  'mark[data-rt-color]',
];

const PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'color',
  'background-color',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-left-width',
  'border-left-style',
  'border-left-color',
  'float',
  'list-style-type',
];

type Styles = Record<string, Record<string, string>[]>;

/**
 * Estilos computados de `PROPS` para todo elemento de cada seletor dentro do
 * `.rte-content`. Antes, a geometria do contêiner é igualada por CSSOM
 * (permitido pela CSP): o editor tem `padding` e a página não, e margens
 * `auto` (figura centralizada) dependem da largura disponível.
 */
function collectStyles(page: Page): Promise<Styles> {
  return page.evaluate(
    ({ selectors, props }) => {
      const root = document.querySelector('.rte-content') as HTMLElement;
      root.style.setProperty('box-sizing', 'border-box');
      root.style.setProperty('width', '640px');
      root.style.setProperty('padding', '12px 16px');
      const out: Record<string, Record<string, string>[]> = {};
      for (const selector of selectors) {
        out[selector] = [...root.querySelectorAll(selector)].map((el) => {
          const style = getComputedStyle(el);
          return Object.fromEntries(
            props.map((prop) => [prop, style.getPropertyValue(prop)]),
          );
        });
      }
      return out;
    },
    { selectors: SELECTORS, props: PROPS },
  );
}

/** Abre o editor `content` com o fixture carregado (carga externa, D9). */
async function openEditor(page: Page): Promise<void> {
  await gotoApp(page, '/content');
  await waitForEditor(page, 'content');
  await page.evaluate(
    (html) => window.rteE2e.setValue('content', html),
    readFixture('all-features.html'),
  );
  await expect(editorHost(page, 'content').locator('table')).toHaveCount(1);
}

/**
 * Violações de CSP desde a última leitura, sem o que a página não controla:
 * mídias e quadros de `example.com` e dos provedores (a CSP só aceita
 * 'self') e, no Chromium, o `style-src-attr` `inline` de ler HTML com
 * atributos `style` (ver `editor-csp.spec.ts`).
 */
async function unexpectedViolations(page: Page) {
  await settlePage(page);
  const all = await page.evaluate(() => window.__violations.splice(0));
  return all.filter(
    (v) =>
      !(
        /example\.com|youtube-nocookie\.com|player\.vimeo\.com|open\.spotify\.com/.test(
          v.blockedURI,
        ) ||
        (v.directive === 'style-src-attr' && v.blockedURI === 'inline')
      ),
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test(`N13 R12 (${scheme}): editor e página estática têm os mesmos estilos computados`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: scheme });
    await openEditor(page);
    const editor = await collectStyles(page);

    await gotoApp(page, '/content-static');
    await expect(page.locator('.rte-content table')).toHaveCount(1);
    const staticPage = await collectStyles(page);

    for (const selector of SELECTORS) {
      expect(
        editor[selector]?.length,
        `${selector}: ocorrências`,
      ).toBeGreaterThan(0);
      expect(editor[selector], selector).toEqual(staticPage[selector]);
    }
  });

  test(`N13 R9 (${scheme}): paleta, variável do consumidor e contraste`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: scheme });
    await openEditor(page);
    const host = editorHost(page, 'content');
    const color = (selector: string) =>
      host
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).color);
    const background = (selector: string) =>
      host
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);

    // A cor `dark` da paleta vence o `style` claro do HTML (e o claro aparece no claro).
    expect(await color('span[data-rt-color="red"]')).toBe(
      scheme === 'dark' ? 'rgb(255, 143, 135)' : 'rgb(179, 38, 30)',
    );
    expect(await background('mark[data-rt-color="yellow"]')).toBe(
      scheme === 'dark' ? 'rgb(77, 65, 0)' : 'rgb(255, 243, 163)',
    );

    // A variável do consumidor vence a paleta.
    await host.evaluate((el) => el.classList.add('e2e-custom-palette'));
    expect(await color('span[data-rt-color="red"]')).toBe('rgb(1, 2, 3)');
    await host.evaluate((el) => el.classList.remove('e2e-custom-palette'));

    // Contraste >= 4,5 sobre o fundo efetivo.
    const contentSelectors = [
      '.rt-callout--info p:not(.rt-callout__title)',
      '.rt-callout--info .rt-callout__title',
      '.rt-callout--success p:not(.rt-callout__title)',
      '.rt-callout--success .rt-callout__title',
      '.rt-callout--warning p:not(.rt-callout__title)',
      '.rt-callout--warning .rt-callout__title',
      '.rt-callout--danger p:not(.rt-callout__title)',
      '.rt-callout--danger .rt-callout__title',
      '.rt-read-also .rt-read-also__title',
      '.rt-read-also a',
      '.rt-pullquote blockquote p',
      'p > a',
      ...[
        'gray',
        'red',
        'orange',
        'green',
        'blue',
        'purple',
        'pink',
        'teal',
      ].map((name) => `span[data-rt-color="${name}"]`),
      ...['yellow', 'green', 'blue', 'pink', 'orange', 'purple'].map(
        (name) => `mark[data-rt-color="${name}"]`,
      ),
    ];
    for (const selector of contentSelectors) {
      const full = `rte-editor[data-testid="content"] .rte-content ${selector}`;
      const fg = await toRgb(page, await color(selector));
      const bg = await effectiveBackground(page, full);
      expect(
        contrastRatio(fg, bg),
        `${scheme} ${selector}: ${fg} sobre ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(await unexpectedViolations(page)).toEqual([]);
  });
}
