import { expect, test } from '@playwright/test';
import { ORIGIN, watch } from './helpers';

// J4 (spec 07b, W12): pt-BR -> en -> es troca os rótulos da barra e o nome acessível do mesmo
// editor, sem recriá-lo.

test('J4: trocar o idioma atualiza a barra sem recriar o editor', async ({
  page,
}) => {
  const problems = await watch(page);
  await page.goto(`${ORIGIN}/i18n`);
  const editable = page.locator('.ProseMirror').first();
  await expect(editable).toBeVisible({ timeout: 30_000 });
  const host = page.locator('rte-editor');
  const toolbar = host.getByRole('toolbar');
  await expect(toolbar).toBeVisible();

  // O mesmo nó DOM antes e depois (marca no elemento: recriar a instância o perderia).
  await host.evaluate((el) => el.setAttribute('data-e2e-mark', 'mesma'));
  await editable.click();
  await page.keyboard.type('texto');

  const bold = {
    'pt-BR': /negrito/i,
    en: /^bold/i,
    es: /negrita/i,
  } as const;
  for (const lang of ['pt-BR', 'en', 'es'] as const) {
    await page.getByTestId('lang').selectOption(lang);
    await expect(
      toolbar.getByRole('button', { name: bold[lang] }).first(),
    ).toBeVisible();
    await expect(host).toHaveAttribute('data-e2e-mark', 'mesma');
    await expect(host.locator('.ProseMirror')).toContainText('texto');
  }
  expect(problems.messages).toEqual([]);
});
