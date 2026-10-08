import { test } from '@playwright/test';
import { readFixture } from '../angular/helpers/app';
import { capHeight, openEditor, setDoc } from './helpers/pages';
import { expectShot } from './helpers/shot';

// O4: editor vazio com placeholder e o fixture all-features, claro e escuro.

test('editor vazio com placeholder', async ({ page }) => {
  const host = await openEditor(page, '/content', 'content');
  await expectShot(host, 'editor-empty-placeholder');
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test('editor com all-features.html', async ({ page }) => {
      const host = await openEditor(page, '/content', 'content');
      await setDoc(page, 'content', readFixture('all-features.html'));
      await capHeight(host);
      await expectShot(host, `editor-all-features-${scheme}`);
    });
  });
}
