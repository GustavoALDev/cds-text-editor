// Spec 06, §6.2 L4 (R10 e R5; H8, H9): CSP e Trusted Types na rota `render`, nos builds
// zoneless e zone.js.
//
// `/render` (CSP estrita do app, sem `'unsafe-inline'`): depois da carga e da hidratação, e de
// novo depois de trocar a entrada livre por outro HTML com `style`, as únicas violações (fora
// das mídias e quadros de terceiros, pré-voo 14) são do atributo `style` do conteúdo
// (`style-src-attr`/`style-src` com `blockedURI` `inline`), no máximo 2 por elemento com estilo
// (análise do HTML do servidor + re-inserção da hidratação, H10), e nenhuma `script-src*`.
// `/render-tt` (mais `require-trusted-types-for 'script'; trusted-types angular
// angular#unsafe-bypass`): nos motores com Trusted Types, 0 violações de TT, com o controle
// positivo de que a política é imposta; em todos, o conteúdo exibido.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/app';
import { firstColumnWidth } from './helpers/content-styles';
import { blockThirdParty, gotoRender, renderHost } from './helpers/render';

/** Outro HTML com `style` do esquema (alinhamento, largura de coluna, proporção de embed). */
const STYLED_INPUT =
  '<p style="text-align: center">centro</p>' +
  '<h3 style="text-align: right">direita</h3>' +
  '<table><colgroup><col style="width: 120px"><col></colgroup><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>' +
  '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" width="315" height="560" style="aspect-ratio: 9 / 16" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe></figure>';

const THIRD_PARTY =
  /example\.com|youtube-nocookie\.com|player\.vimeo\.com|open\.spotify\.com/;

type Violation = { directive: string; blockedURI: string; sample: string };

/** Contagem por `where` (diagnóstico). */
function count(targets: readonly { directive: string; where: string }[]) {
  const out: Record<string, number> = {};
  for (const t of targets) {
    const key = `${t.directive} ${t.where}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Violações desde a última leitura, sem as mídias e quadros de terceiros (pré-voo 14). */
async function takeViolations(page: Page): Promise<Violation[]> {
  await settlePage(page);
  const all = await page.evaluate(() => window.__violations.splice(0));
  return all.filter((v) => !THIRD_PARTY.test(v.blockedURI));
}

/** Espera o número de violações registradas parar de crescer (entre duas esperas seguidas). */
async function settleViolations(page: Page): Promise<void> {
  let last = -1;
  await expect
    .poll(async () => {
      await settlePage(page);
      const now = await page.evaluate(() => window.__violations.length);
      const stable = now === last;
      last = now;
      return stable;
    })
    .toBe(true);
}

type Target = { directive: string; where: string };

/**
 * Diagnóstico: para cada violação, o elemento alvo (`tag` e `data-testid` do host mais
 * próximo); o evento vai ao elemento cujo `style` foi barrado.
 */
async function watchTargets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspTargets?: Target[] };
    if (w.__cspTargets) return;
    const list: Target[] = (w.__cspTargets = []);
    document.addEventListener('securitypolicyviolation', (e) => {
      const el = e.target instanceof Element ? e.target : null;
      const host = el?.closest('[data-testid]')?.getAttribute('data-testid');
      list.push({
        directive: e.effectiveDirective || e.violatedDirective,
        where: el
          ? `${host ?? '-'} ${el.localName}`
          : `#document ${e.sourceFile}:${e.lineNumber}:${e.columnNumber} [${e.sample}]`,
      });
    });
  });
}

/**
 * Todo alvo é um elemento de uma exibição `render-*` ou o documento (o Chromium e o WebKit
 * atribuem ao documento a violação levantada pela própria atribuição de `innerHTML` do
 * *renderer* do Angular, com `sourceFile` no *bundle* principal, ver `e2e/README.md`).
 */
function expectContentTargets(targets: readonly Target[]): void {
  const styles = targets.filter((t) => t.directive.startsWith('style-src'));
  expect(
    styles.filter(
      (t) => !t.where.startsWith('#document') && !t.where.startsWith('render-'),
    ),
  ).toEqual([]);
}

function takeTargets(page: Page): Promise<Target[]> {
  return page.evaluate(() =>
    (
      (window as unknown as { __cspTargets?: Target[] }).__cspTargets ?? []
    ).splice(0),
  );
}

/** Elementos com `style` dentro do seletor. */
function styledCount(page: Page, selector: string): Promise<number> {
  return page.locator(`${selector} [style]`).count();
}

/**
 * Só o atributo `style` do conteúdo, entre `min` e `2 × styled` violações, e nenhuma de script.
 */
function expectOnlyContentStyles(
  found: Violation[],
  styled: number,
  min: number,
): void {
  expect(found.filter((v) => v.directive.startsWith('script-src'))).toEqual([]);
  expect(
    found.filter(
      (v) =>
        !(
          (v.directive === 'style-src-attr' || v.directive === 'style-src') &&
          v.blockedURI === 'inline'
        ),
    ),
  ).toEqual([]);
  expect(found.length).toBeGreaterThanOrEqual(min);
  expect(found.length).toBeLessThanOrEqual(2 * styled);
}

for (const zone of [false, true]) {
  const build = zone ? 'zone.js' : 'zoneless';

  test.describe(`L4 CSP e Trusted Types (${build})`, () => {
    test.beforeEach(async ({ context }) => {
      await blockThirdParty(context);
    });

    test('render: só o style do conteúdo, na carga e depois de trocar o HTML', async ({
      page,
    }, testInfo) => {
      await watchTargets(page);
      await gotoRender(page, '/render', { zone });
      const main = renderHost(page, 'render-main');
      await expect(main.locator('#rt-subtitulo')).toHaveCSS(
        'text-align',
        'center',
      );
      // Na rota: o fixture e a tabela larga; a entrada livre (vazia) e `render-keep` sem `style`.
      const styled = await styledCount(page, '.rte-content');
      await settleViolations(page);
      const load = await takeViolations(page);
      const loadTargets = await takeTargets(page);
      expectContentTargets(loadTargets);
      // Piso = controle positivo (cada `style` do HTML do servidor é barrado ao menos uma vez);
      // teto = análise do servidor + re-inserção da hidratação (H10).
      expectOnlyContentStyles(load, styled, styled);
      const note = `${testInfo.project.name} ${build}: ${load.length} violações de style na carga (${styled} elementos com style)`;
      testInfo.annotations.push({ type: 'L4', description: note });
      console.log(`[L4] ${note}`);
      console.log(
        `[L4] alvos da carga: ${JSON.stringify(count(loadTargets.filter((t) => t.directive.startsWith('style-src'))))}`,
      );

      await page.evaluate(
        (html) => window.rteE2e.setRenderInput(html),
        STYLED_INPUT,
      );
      const input = renderHost(page, 'render-input');
      // Modo `sanitize`: o conteúdo é exibido e a H8 reaplicou os estilos do HTML (R5).
      await expect(input.locator('p')).toHaveCount(3);
      await expect(input.locator('p').first()).toHaveCSS(
        'text-align',
        'center',
      );
      await expect(input.locator('h3')).toHaveCSS('text-align', 'right');
      // `width` de `col`: estilo computado (o WebKit devolve `0px`, sem caixa) e geometria.
      if (testInfo.project.name !== 'webkit')
        await expect(input.locator('col').first()).toHaveCSS('width', '120px');
      expect(
        Math.abs(
          (await firstColumnWidth(page, '[data-testid="render-input"]')) - 120,
        ),
      ).toBeLessThanOrEqual(1);
      await expect(input.locator('iframe')).toHaveCSS('aspect-ratio', '9 / 16');
      await settleViolations(page);
      const swap = await takeViolations(page);
      const swapTargets = await takeTargets(page);
      expectContentTargets(swapTargets);
      console.log(
        `[L4] ${testInfo.project.name} ${build}: ${swap.length} violações de style na troca; alvos ${JSON.stringify(count(swapTargets))}`,
      );
      const swapStyled = await styledCount(
        page,
        '[data-testid="render-input"]',
      );
      expectOnlyContentStyles(swap, swapStyled, swapStyled);
    });

    test('render-tt: conteúdo exibido e, com Trusted Types, nenhuma violação e a política imposta', async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await gotoRender(page, '/render-tt', { zone });
      await expect(
        renderHost(page, 'render-main').locator('#rt-subtitulo'),
      ).toBeVisible();
      await expect(
        renderHost(page, 'render-main').locator('#rt-subtitulo'),
      ).toHaveCSS('text-align', 'center');

      const supported = await page.evaluate(() => 'trustedTypes' in window);
      console.log(
        `[L4] ${testInfo.project.name} ${build}: trustedTypes=${supported}`,
      );
      const tt = (v: Violation) =>
        v.directive === 'require-trusted-types-for' ||
        v.directive === 'trusted-types';
      const found = await takeViolations(page);
      expect(found.filter((v) => v.directive.startsWith('script-src'))).toEqual(
        [],
      );
      expect(errors).toEqual([]);
      if (!supported) {
        testInfo.annotations.push({
          type: 'trusted-types',
          description: `${testInfo.project.name}: sem 'trustedTypes' em window; só o conteúdo exibido`,
        });
        return;
      }
      expect(found.filter(tt)).toEqual([]);

      // Controle positivo: a política é imposta (atribuição crua lança) e o ouvinte a enxerga.
      const threw = await page.evaluate(() => {
        try {
          document.createElement('div').innerHTML = '<b>x</b>';
          return false;
        } catch {
          return true;
        }
      });
      expect(threw).toBe(true);
      expect(
        (await takeViolations(page)).filter(tt).map((v) => v.directive),
      ).toContain('require-trusted-types-for');
    });
  });
}
