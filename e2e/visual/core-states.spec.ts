import { expect, test } from '@playwright/test';
import { gotoApp, waitForEditor } from '../angular/helpers/app';
import { productivityReady } from '../angular/helpers/productivity';
import { loadDoc } from '../angular/helpers/toolbar';
import { blockExternal, editorHost, openEditor, setDoc } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4: contadores perto do limite e acima dele, aviso de rascunho, disabled e readonly.

test.describe('contadores', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternal(page);
    await gotoApp(page, '/productivity');
    await productivityReady(page);
  });

  test('perto do limite', async ({ page }) => {
    await loadDoc(page, 'productivity', `<p>${'a'.repeat(190)}</p>`);
    const chars = editorHost(page, 'productivity').locator(
      '.rte-counter--chars',
    );
    await expect(chars).toHaveClass(/rte-counter--near/);
    await expectShot(
      editorHost(page, 'productivity').locator('.rte-editor__footer'),
      'counters-near-limit',
    );
  });

  test('acima do limite', async ({ page }) => {
    await loadDoc(page, 'productivity', `<p>${'a'.repeat(230)}</p>`);
    const chars = editorHost(page, 'productivity').locator(
      '.rte-counter--chars',
    );
    await expect(chars).toHaveClass(/rte-counter--over/);
    await expectShot(
      editorHost(page, 'productivity').locator('.rte-editor__footer'),
      'counters-over-limit',
    );
  });
});

test('aviso de rascunho', async ({ page }) => {
  // Data fixa: o aviso mostra a data do rascunho (dinâmica por natureza).
  const now = new Date('2026-03-10T15:00:00Z');
  await page.clock.setFixedTime(now);
  await page.addInitScript((savedAt) => {
    localStorage.setItem(
      'rte-draft:e2e-draft',
      JSON.stringify({ v: 1, savedAt, html: '<p>rascunho</p>' }),
    );
  }, now.getTime() - 3_600_000);
  await blockExternal(page);
  await gotoApp(page, '/draft');
  await waitForEditor(page, 'draft');
  const prompt = page.locator('section.rte-draft');
  await expect(prompt).toBeVisible();
  await expectShot(prompt, 'draft-prompt');
});

test.describe('estados da barra', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page, '/toolbar', 'toolbar');
    await setDoc(page, 'toolbar', '<p>Texto de exemplo.</p>');
  });

  test('disabled', async ({ page }) => {
    await page.evaluate(() => window.rteE2e.toggle('disabled'));
    const host = editorHost(page, 'toolbar');
    await expect(host).toHaveClass(/rte-editor--disabled/);
    await expectShot(host, 'state-disabled');
  });

  test('readonly', async ({ page }) => {
    await page.evaluate(() => window.rteE2e.toggle('readonly'));
    const host = editorHost(page, 'toolbar');
    await expect(host.locator('.ProseMirror')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    await expectShot(host, 'state-readonly');
  });
});
