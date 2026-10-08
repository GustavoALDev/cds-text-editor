import { expect, test, type Page } from '@playwright/test';
import { editableOf, gotoApp, waitForEditor } from './helpers/app';

declare global {
  interface Window {
    __draftSave?: { removed: string[][]; release(): void };
  }
}

test.describe('compat: angular/editor-draft-save', { tag: '@compat' }, () => {
  // N40 (spec 05c2b, R5, R8; S8-S10): `isDirty`, `markSaved(html)` com
  // `onMediaRemoved` e o aviso `beforeunload` (`warnOnUnsaved`) em navegador
  // real. Rota `draft-save`, CSP estrita, nos builds zoneless e zone.js.
  // Chromium: o diálogo de `beforeunload` do Playwright exige ativação.

  const IMG_TWO = '/e2e.png?b';

  for (const zone of [false, true]) {
    test.describe(`N40 salvar e sair (${zone ? 'zone.js' : 'zoneless'})`, () => {
      test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'N40 roda só no Chromium',
      );

      async function open(page: Page): Promise<void> {
        await gotoApp(page, '/draft-save', { zone });
        await waitForEditor(page, 'draft-save');
      }

      const dirty = (page: Page) => page.getByTestId('dirty');
      const removed = (page: Page) =>
        page.evaluate(() => window.__draftSave?.removed ?? []);

      async function removeSecondImage(page: Page): Promise<void> {
        await editableOf(page, 'draft-save').locator('img').nth(1).click();
        await page.keyboard.press('Delete');
        await expect(editableOf(page, 'draft-save').locator('img')).toHaveCount(
          1,
        );
      }

      test('isDirty acompanha a edição e o salvamento', async ({ page }) => {
        await open(page);
        await expect(dirty(page)).toHaveText('false');
        await editableOf(page, 'draft-save').locator('p').first().click();
        await page.keyboard.type('x');
        await expect(dirty(page)).toHaveText('true');
        await page.keyboard.press('Backspace');
        await expect(dirty(page)).toHaveText('false');
        await page.keyboard.type('y');
        await expect(dirty(page)).toHaveText('true');
        await page.getByTestId('save').click();
        await expect(dirty(page)).toHaveText('false');
        expect(await removed(page)).toEqual([]);
      });

      test('remover uma imagem e salvar entrega o endereço', async ({
        page,
      }) => {
        await open(page);
        await removeSecondImage(page);
        await expect(dirty(page)).toHaveText('true');
        expect(await removed(page)).toEqual([]);
        await page.getByTestId('save').click();
        await expect(dirty(page)).toHaveText('false');
        await expect.poll(() => removed(page)).toEqual([[IMG_TWO]]);
      });

      test('com envio lento em curso a entrega espera o fim', async ({
        page,
      }) => {
        await open(page);
        await removeSecondImage(page);
        await page.getByTestId('send').click();
        await expect(page.getByTestId('pending')).toHaveText('1');
        await page.getByTestId('save').click();
        await page.waitForTimeout(300);
        expect(await removed(page)).toEqual([]);
        await page.evaluate(() => window.__draftSave?.release());
        await expect(page.getByTestId('pending')).toHaveText('0');
        await expect.poll(() => removed(page)).toEqual([[IMG_TWO]]);
      });

      test('beforeunload só aparece sujo', async ({ page }) => {
        await open(page);
        const dialogs: string[] = [];
        page.on('dialog', (dialog) => {
          dialogs.push(dialog.type());
          void dialog.accept();
        });
        // ativação do usuário: sem ela o navegador não mostra o aviso
        await editableOf(page, 'draft-save').locator('p').first().click();

        // limpo: sai sem aviso
        await page.reload();
        await waitForEditor(page, 'draft-save');
        expect(dialogs).toEqual([]);

        await editableOf(page, 'draft-save').locator('p').first().click();
        await page.keyboard.type('x');
        await expect(dirty(page)).toHaveText('true');
        await page.reload();
        await waitForEditor(page, 'draft-save');
        expect(dialogs).toEqual(['beforeunload']);

        // salvo: sem novo aviso
        await editableOf(page, 'draft-save').locator('p').first().click();
        await page.keyboard.type('x');
        await page.getByTestId('save').click();
        await expect(dirty(page)).toHaveText('false');
        await page.reload();
        await waitForEditor(page, 'draft-save');
        expect(dialogs).toEqual(['beforeunload']);
      });
    });
  }
});
