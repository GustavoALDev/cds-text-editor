import { expect, test } from '@playwright/test';
import { editableOf, gotoApp, modelValue, waitForEditor } from './helpers/app';
import { frames } from './helpers/toolbar';

// N48 (spec 08a, X7; lacuna da auditoria): digitar, formatar pelo teclado e desfazer/refazer
// com `Mod+Z`, `Mod+Shift+Z` e `Ctrl+Y`, no editor `signal` de `/forms`. Os fluxos de mídia já
// têm o seu desfazer (N16, N28, N40, N41); aqui fica o texto puro.

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/forms');
  await waitForEditor(page, 'signal');
});

test('N48: digitar, negrito por Mod+B, desfazer e refazer', async ({
  page,
}) => {
  const editable = editableOf(page, 'signal');
  await editable.click();
  await page.keyboard.type('alfa ');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('beta');
  await page.keyboard.press('ControlOrMeta+b');
  await frames(page);
  await expect
    .poll(() => modelValue(page, 'signal'))
    .toBe('<p>alfa <strong>beta</strong></p>');

  // Cada Mod+Z recua um passo do histórico; Mod+Shift+Z os refaz. Um passo agrupa um trecho
  // digitado, então o número de passos não é fixado: desfaz-se até o texto original sumir.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ControlOrMeta+z');
    await frames(page);
  }
  await expect.poll(() => modelValue(page, 'signal')).not.toContain('beta');

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await frames(page);
  }
  await expect
    .poll(() => modelValue(page, 'signal'))
    .toBe('<p>alfa <strong>beta</strong></p>');
});

test('N48: Ctrl+Y refaz o que o Mod+Z desfez (fora do macOS)', async ({
  page,
}) => {
  test.skip(
    process.platform === 'darwin',
    'no macOS o atalho de refazer é Cmd+Shift+Z',
  );
  const editable = editableOf(page, 'signal');
  await editable.click();
  await page.keyboard.type('gama');
  await frames(page);
  await expect.poll(() => modelValue(page, 'signal')).toBe('<p>gama</p>');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => modelValue(page, 'signal')).not.toContain('gama');
  await page.keyboard.press('Control+y');
  await expect.poll(() => modelValue(page, 'signal')).toBe('<p>gama</p>');
});
