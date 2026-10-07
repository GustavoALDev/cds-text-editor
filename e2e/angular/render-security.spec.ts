// Spec 06, §6.2 L1 (R3): segurança da exibição em navegador real, nos builds zoneless e
// zone.js, com a CSP estrita do app. O corpus de XSS do sanitizador e 2000 casos hostis
// passam pelo `RteContent` (modo `sanitize`); o DOM exibido nunca tem código executável, a
// sentinela `__xss` não é chamada e nenhuma violação `script-src*` é registrada.
import { expect, test, type Page } from '@playwright/test';
import * as fc from 'fast-check';
import { prepareRteHtml } from '../../packages/render/src/prepare-html';
import { hostileHtml } from '../../packages/sanitizer/src/testing/html-arbitraries';
import { XSS_CORPUS } from '../../packages/sanitizer/src/testing/xss-corpus';
import { appUrl, readFixture, settlePage } from './helpers/app';
import { blockThirdParty, gotoRender, renderHost } from './helpers/render';

const FIXTURE = readFixture('all-features.html').replace(/\r\n?/g, '\n');
const RUNS = Number(process.env['FC_RUNS'] ?? 2000);
const SEED = 20261005;
const BATCH = 250;

/** Sentinela de XSS antes de qualquer script da página, como na `e2e/sanitizer`. */
async function installSentinel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__xssCalls = 0;
    window.__xss = () => {
      window.__xssCalls++;
    };
    // Os payloads dos corpora chamam `alert(1)`: os diálogos também são a sentinela.
    window.alert = () => {
      window.__xss();
    };
    window.confirm = () => {
      window.__xss();
      return false;
    };
    window.prompt = () => {
      window.__xss();
      return null;
    };
  });
}

/** Problemas de `probeRender` em lotes (um `evaluate` por lote). */
async function probeAll(
  page: Page,
  htmls: readonly string[],
): Promise<{ index: number; problems: string[] }[]> {
  const found: { index: number; problems: string[] }[] = [];
  for (let i = 0; i < htmls.length; i += BATCH) {
    const batch = htmls.slice(i, i + BATCH);
    const part = await page.evaluate(
      (list) => window.rteE2e.probeRender(list),
      batch,
    );
    for (const p of part)
      found.push({ index: i + p.index, problems: p.problems });
  }
  return found;
}

for (const zone of [false, true]) {
  const build = zone ? 'zone.js' : 'zoneless';
  const base = zone ? '/zone/render' : '/render';

  test.describe(`L1 segurança (${build})`, () => {
    test.setTimeout(240_000);

    test.beforeEach(async ({ context, page }) => {
      await blockThirdParty(context);
      await installSentinel(page);
    });

    test('o fixture exibido é o do servidor e o HTML do servidor traz as âncoras no caminho do documento', async ({
      page,
      request,
    }) => {
      await gotoRender(page, '/render', { zone });
      await settlePage(page);
      const rendered = await page.evaluate(() =>
        window.rteE2e.renderedHtml('render-main'),
      );
      expect(rendered.replace(/\r\n?/g, '\n')).toBe(FIXTURE);
      await expect(renderHost(page, 'render-main')).not.toBeEmpty();

      const response = await request.get(appUrl('/render', { zone }));
      expect(response.ok()).toBe(true);
      const server = await response.text();
      expect(server).toContain(prepareRteHtml(FIXTURE, { fragmentBase: base }));
    });

    test(`corpus de XSS (${XSS_CORPUS.length}) e ${RUNS} casos hostis: nada executável no DOM, sentinela intacta`, async ({
      page,
    }) => {
      await gotoRender(page, '/render', { zone });
      const corpus = await probeAll(
        page,
        XSS_CORPUS.map((c) => c.input),
      );
      expect(corpus).toEqual([]);

      const hostile = fc.sample(hostileHtml, { numRuns: RUNS, seed: SEED });
      expect(hostile).toHaveLength(RUNS);
      expect(await probeAll(page, hostile)).toEqual([]);
      await settlePage(page);
      expect(await page.evaluate(() => window.__xssCalls)).toBe(0);
      const scripts = await page.evaluate(() =>
        window.__violations.filter((v) => v.directive.startsWith('script-src')),
      );
      expect(scripts).toEqual([]);

      // Controle da sonda, depois das asserções de violação (em trusted o navegador registra os handlers crus): o gerador produz marcação perigosa de verdade.
      const raw = await page.evaluate(
        (list) => window.rteE2e.probeRender(list, 'trusted'),
        hostile.slice(0, BATCH),
      );
      expect(raw.length).toBeGreaterThan(0);
    });

    test('controle positivo: handler cru fora do Angular vira violação script-src-attr', async ({
      page,
    }) => {
      await gotoRender(page, '/render', { zone });
      await page.evaluate(() => {
        const div = document.createElement('div');
        div.innerHTML = '<img src="x" onerror="window.__xss()">';
        document.body.appendChild(div);
      });
      await settlePage(page);
      const directives = await page.evaluate(() =>
        window.__violations.map((v) => v.directive),
      );
      expect(directives).toContain('script-src-attr');
      expect(await page.evaluate(() => window.__xssCalls)).toBe(0);
    });

    test('modo trusted exibe o que recebe (data-x presente)', async ({
      page,
    }) => {
      await gotoRender(page, '/render', { zone });
      await page.evaluate(() =>
        window.rteE2e.setRenderInput('<p data-x="1">t</p>', 'trusted'),
      );
      await expect(
        renderHost(page, 'render-input').locator('p'),
      ).toHaveAttribute('data-x', '1');
      // Controle negativo da sonda: em trusted, HTML perigoso é exibido e a sonda o acusa.
      const dirty = await page.evaluate(() =>
        window.rteE2e.probeRender(
          [
            '<img src="x" onerror="1">',
            '<a href="javascript:1">x</a>',
            '<p>ok</p>',
          ],
          'trusted',
        ),
      );
      expect(dirty.map((d) => d.index)).toEqual([0, 1]);
      await page.evaluate(() =>
        window.rteE2e.setRenderInput('<p data-x="1">t</p>', 'sanitize'),
      );
      await expect(
        renderHost(page, 'render-input').locator('p[data-x]'),
      ).toHaveCount(0);
    });

    test('render-tt (Trusted Types): conteúdo exibido, sem violação nem erro', async ({
      page,
      request,
    }) => {
      for (const path of ['/render-tt', '/render-tt/']) {
        const res = await request.get(appUrl(path, { zone }));
        expect(res.headers()['content-security-policy']).toContain(
          "require-trusted-types-for 'script'",
        );
      }
      const plain = await request.get(appUrl('/render', { zone }));
      expect(plain.headers()['content-security-policy']).not.toContain(
        'trusted-types',
      );
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await gotoRender(page, '/render-tt', { zone });
      await settlePage(page);
      await expect(
        renderHost(page, 'render-main').locator('h2').first(),
      ).toBeVisible();
      expect(
        await page.evaluate(() =>
          window.rteE2e.probeRender(['<p onclick="1">x</p>']),
        ),
      ).toEqual([]);
      const violations = await page.evaluate(() =>
        window.__violations.map((v) => `${v.directive} ${v.sample}`),
      );
      // Imagens, mídia e embeds de terceiros do fixture são barrados pela CSP do app (N13): só
      // importam as violações de script e de Trusted Types.
      expect(
        violations.filter((v) =>
          /^(script-src|require-trusted|trusted-types)/.test(v),
        ),
      ).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
