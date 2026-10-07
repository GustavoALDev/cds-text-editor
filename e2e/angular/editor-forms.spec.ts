import { expect, test } from '@playwright/test';
import {
  editableOf,
  formState,
  gotoApp,
  modelValue,
  waitForEditor,
} from './helpers/app';

// N1 (spec 05a, R4–R6, R14), nos builds zoneless e `zone`: o teclado real
// escreve o HTML canônico nos três modelos (Signal Forms, Reactive Forms e
// `[(value)]`); a carga externa não ecoa, não suja e não entra no histórico;
// `reset` limpa; `touched` só quando o foco sai do host; no build `zone`, o
// ouvinte de `editorBlur` com campo comum atualiza a tela.

const IDS = ['signal', 'reactive', 'plain'] as const;

for (const zone of [false, true]) {
  const build = zone ? 'zone' : 'zoneless';

  test.describe(`N1 (${build})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/forms', { zone });
      for (const id of IDS) await waitForEditor(page, id);
    });

    test('digitar com o teclado real escreve o HTML canônico nos três modelos', async ({
      page,
    }) => {
      for (const id of IDS) {
        await editableOf(page, id).click();
        await page.keyboard.type('Olá');
        await page.keyboard.press('Enter');
        await page.keyboard.type('mundo');
        await expect
          .poll(() => modelValue(page, id))
          .toBe('<p>Olá</p><p>mundo</p>');
      }
      for (const id of ['signal', 'reactive'] as const) {
        expect(await formState(page, id)).toMatchObject({
          dirty: true,
          valid: true,
        });
      }
    });

    test('carga externa sem eco nem dirty, fora do histórico; reset volta a vazio', async ({
      page,
    }) => {
      const editable = editableOf(page, 'signal');
      await page.evaluate(() =>
        window.rteE2e.setValue('signal', '<p>carga</p>'),
      );
      await expect(editable).toHaveText('carga');
      expect(await modelValue(page, 'signal')).toBe('<p>carga</p>');
      expect((await formState(page, 'signal')).dirty).toBe(false);

      // Mod+Z com o foco no editor não volta ao documento de antes da carga.
      await editable.click();
      await expect(editable).toBeFocused();
      await page.keyboard.press('ControlOrMeta+Z');
      await expect(editable).toHaveText('carga');
      expect(await modelValue(page, 'signal')).toBe('<p>carga</p>');
      expect((await formState(page, 'signal')).dirty).toBe(false);

      await page.evaluate(() => window.rteE2e.reset('signal'));
      await expect.poll(() => modelValue(page, 'signal')).toBe('');
      await expect(editable).toHaveText('');

      // Reactive Forms: HTML não canônico chega ao editor sem reescrita no controle.
      const raw = '<p><b>negrito</b></p>';
      await page.evaluate((v) => window.rteE2e.setValue('reactive', v), raw);
      await expect(editableOf(page, 'reactive').locator('strong')).toHaveText(
        'negrito',
      );
      expect(await modelValue(page, 'reactive')).toBe(raw);
      expect((await formState(page, 'reactive')).dirty).toBe(false);
    });

    test('touched só depois de Tab para fora do host', async ({ page }) => {
      const blurCount = page.locator('#blur-count');
      await expect(blurCount).toHaveText('0');

      // Clicar dentro (duas vezes, em pontos diferentes do host) não toca.
      await editableOf(page, 'signal').click();
      await editableOf(page, 'signal').click({ position: { x: 4, y: 4 } });
      await expect(editableOf(page, 'signal')).toBeFocused();
      expect((await formState(page, 'signal')).touched).toBe(false);

      await page.keyboard.press('Tab');
      await expect(editableOf(page, 'reactive')).toBeFocused();
      await expect
        .poll(async () => (await formState(page, 'signal')).touched)
        .toBe(true);
      expect((await formState(page, 'reactive')).touched).toBe(false);

      await page.keyboard.press('Tab');
      await expect(editableOf(page, 'plain')).toBeFocused();
      await expect
        .poll(async () => (await formState(page, 'reactive')).touched)
        .toBe(true);

      // R14: no build `zone`, o campo comum do ouvinte de `editorBlur` chega à
      // tela (uma saída por saída do foco, na ordem real de `focusout`).
      if (zone) await expect(blurCount).toHaveText('2');
    });
  });
}
