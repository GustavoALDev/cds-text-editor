import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { coreBundle } from './bundle';

const BLANK = resolve(__dirname, '../../fixtures/blank.html');

export const ORIGIN = 'https://rte.test';

/** Abre o blank.html numa origem http(s) falsa e injeta `window.RteCore`. */
export async function loadCorePage(page: Page): Promise<void> {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: readFileSync(BLANK, 'utf8'),
    }),
  );
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ content: coreBundle() });
}
