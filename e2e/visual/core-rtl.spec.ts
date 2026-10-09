import { expect, test } from '@playwright/test';
import { editorHost, openEditor, setDoc } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4: `dir="rtl"` no host: editor e barra.

test('editor e barra em rtl', async ({ page }) => {
  await openEditor(page, '/toolbar', 'toolbar');
  await setDoc(page, 'toolbar', '<p>مرحبا بالعالم، هذا نص تجريبي.</p>');
  const host = editorHost(page, 'toolbar');
  await host.evaluate((h) => h.setAttribute('dir', 'rtl'));
  await expect(host).toHaveAttribute('dir', 'rtl');
  await expectShot(host, 'editor-and-toolbar-rtl');
  await expectShot(host.locator('.rte-toolbar'), 'toolbar-rtl');
});
