import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const baseUrl = process.env['BASE_URL'] ?? pathToFileURL(resolve(__dirname, 'fixtures/blank.html')).href;

test('loads a blank page in a real browser', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.locator('h1')).toHaveText('cds-text-editor');
});
