import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { editableOf, gotoApp, waitForEditor } from './helpers/app';

// N39 (spec 05c2b, R1-R4, R9; S2-S7): rascunho automático em navegador real.
// Digitar, recarregar, aviso com data (sem o conteúdo), axe sem `serious` ou
// `critical` no aviso, "Restaurar" (conteúdo de volta e foco no editável) e
// "Descartar" numa segunda recarga; duas páginas no mesmo contexto (o aviso
// chega pelo evento `storage`); `clearLocalDrafts` limpa. Rota `draft`, CSP
// estrita, nos builds zoneless e zone.js.

const STORAGE_KEY = 'rte-draft:e2e-draft';
const PROMPT = 'section.rte-draft';

for (const zone of [false, true]) {
  test.describe(`N39 rascunho (${zone ? 'zone.js' : 'zoneless'})`, () => {
    async function open(page: Page): Promise<void> {
      await gotoApp(page, '/draft', { zone });
      await waitForEditor(page, 'draft');
    }

    /** Espera a gravação adiada (1000 ms) chegar ao `localStorage`. */
    async function savedHtml(page: Page): Promise<string> {
      await expect
        .poll(
          () => page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY),
          {
            timeout: 10_000,
          },
        )
        .not.toBeNull();
      return page.evaluate(
        (k) =>
          (JSON.parse(localStorage.getItem(k) ?? '{}') as { html: string })
            .html,
        STORAGE_KEY,
      );
    }

    test('digitar, recarregar, avisar, restaurar e descartar', async ({
      page,
    }) => {
      const violations = () => page.evaluate(() => window.__violations);
      await open(page);
      await editableOf(page, 'draft').click();
      await page.keyboard.type('texto persistido');
      expect(await savedHtml(page)).toContain('texto persistido');

      await page.reload();
      await waitForEditor(page, 'draft');
      const prompt = page.locator(PROMPT);
      await expect(prompt).toBeVisible();
      await expect(prompt).toHaveAttribute('role', 'region');
      await expect(prompt).toHaveAttribute('aria-label', 'Saved draft');
      await expect(prompt).toContainText(
        /A draft saved on .*\d{4}.* is available\./,
      );
      await expect(prompt).not.toContainText('persistido');
      await expect(page.locator('.rte-draft__status')).toContainText(
        /A draft saved on/,
      );
      // não rouba o foco
      await expect(editableOf(page, 'draft')).not.toBeFocused();

      const results = await new AxeBuilder({ page }).include(PROMPT).analyze();
      expect(
        results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        ),
      ).toEqual([]);
      for (const box of await prompt.locator('button').all()) {
        const rect = await box.boundingBox();
        expect(rect?.width).toBeGreaterThanOrEqual(24);
        expect(rect?.height).toBeGreaterThanOrEqual(24);
      }

      await prompt.getByRole('button', { name: 'Restore' }).click();
      await expect(prompt).toHaveCount(0);
      await expect(editableOf(page, 'draft')).toContainText('texto persistido');
      await expect(editableOf(page, 'draft')).toBeFocused();
      await expect(page.locator('.rte-draft__status')).toHaveText('');

      // segunda recarga: o rascunho segue gravado; descartar o apaga
      await page.reload();
      await waitForEditor(page, 'draft');
      await expect(page.locator(PROMPT)).toBeVisible();
      await page
        .locator(PROMPT)
        .getByRole('button', { name: 'Discard' })
        .click();
      await expect(page.locator(PROMPT)).toHaveCount(0);
      await expect(editableOf(page, 'draft')).toBeFocused();
      expect(
        await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY),
      ).toBeNull();

      await page.reload();
      await waitForEditor(page, 'draft');
      await expect(page.locator(PROMPT)).toHaveCount(0);
      expect(await violations()).toEqual([]);
    });

    test('duas páginas no mesmo contexto: o aviso chega pelo evento storage', async ({
      context,
    }) => {
      const a = await context.newPage();
      const b = await context.newPage();
      await open(b);
      await open(a);
      await expect(b.locator(PROMPT)).toHaveCount(0);
      await editableOf(a, 'draft').click();
      await a.keyboard.type('de outra aba');
      expect(await savedHtml(a)).toContain('de outra aba');
      await expect(b.locator(PROMPT)).toBeVisible();
      await expect(b.locator(PROMPT)).not.toContainText('outra aba');
      // a outra aba descarta: o aviso some na primeira (aba suja não é avisada)
      await b.locator(PROMPT).getByRole('button', { name: 'Discard' }).click();
      expect(
        await b.evaluate((k) => localStorage.getItem(k), STORAGE_KEY),
      ).toBeNull();
    });

    test('foco no aviso que some por evento externo vai ao editável, N63 (spec 08b, ADR 0014)', async ({
      context,
    }) => {
      const a = await context.newPage();
      const b = await context.newPage();
      await open(b);
      await open(a);
      await editableOf(a, 'draft').click();
      await a.keyboard.type('de outra aba');
      expect(await savedHtml(a)).toContain('de outra aba');
      await expect(b.locator(PROMPT)).toBeVisible();
      await b.bringToFront();
      await b.locator(PROMPT).getByRole('button', { name: 'Restore' }).focus();
      await expect(
        b.locator(PROMPT).getByRole('button', { name: 'Restore' }),
      ).toBeFocused();
      // outra aba apaga o rascunho: o aviso some em b e o foco não cai no body
      await a.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
      await expect(b.locator(PROMPT)).toHaveCount(0);
      await expect(editableOf(b, 'draft')).toBeFocused();
    });

    test('pagehide descarrega o rascunho antes do adiamento, N40 (spec 08b, N62)', async ({
      page,
    }, testInfo) => {
      await open(page);
      await editableOf(page, 'draft').click();
      await page.keyboard.type('saiu rápido');
      // antes dos 1000 ms: ainda nada gravado
      expect(
        await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY),
      ).toBeNull();
      await page.reload();
      await waitForEditor(page, 'draft');
      let stored = await page.evaluate(
        (k) => localStorage.getItem(k),
        STORAGE_KEY,
      );
      if (stored === null) {
        // o motor não disparou  sozinho no reload: dispara à mão (causa no ADR 0021)
        testInfo.annotations.push({
          type: 'pagehide-manual',
          description: 'reload não disparou pagehide a tempo',
        });
        // no Chromium do CI o reload dispara o pagehide de verdade: o fallback manual aqui
        // esconderia uma regressão do descarregamento (ADR 0021)
        expect(
          !process.env['CI'] || testInfo.project.name !== 'chromium',
          'o reload não disparou pagehide no Chromium do CI (fallback manual usado)',
        ).toBe(true);
        await editableOf(page, 'draft').click();
        await page.keyboard.type('saiu rápido');
        await page.evaluate(() =>
          window.dispatchEvent(new PageTransitionEvent('pagehide')),
        );
        stored = await page.evaluate(
          (k) => localStorage.getItem(k),
          STORAGE_KEY,
        );
      }
      expect(stored).toContain('saiu rápido');
    });

    test('clearLocalDrafts limpa os rascunhos', async ({ page }) => {
      await open(page);
      await editableOf(page, 'draft').click();
      await page.keyboard.type('apagar');
      await savedHtml(page);
      await page.getByTestId('clear-drafts').click();
      await expect(page.getByTestId('cleared')).toHaveText('1');
      expect(
        await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY),
      ).toBeNull();
    });
  });
}
