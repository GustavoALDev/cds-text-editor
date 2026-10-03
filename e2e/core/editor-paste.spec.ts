// E2 (spec 03b, §7.4 e §7.6): cada caso de `tolerant-cases.json` colado por
// `view.pasteHTML` num editor vazio sai como o `expected` (o mesmo JSON do Vitest).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

interface TolerantCase {
  name: string;
  input: string;
  expected: string;
  options?: Record<string, unknown>;
}

const CASES = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../fixtures/content/tolerant-cases.json'),
    'utf8',
  ),
) as TolerantCase[];

for (const c of CASES) {
  test(`E2: ${c.name}`, async ({ page }) => {
    await loadEditorPage(page, {
      editor: `{ codeLanguages: RteEditorLab.RTE_CODE_LANGUAGES, ...${JSON.stringify(c.options ?? {})} }`,
    });
    const out = await page.evaluate((input) => {
      const { editor } = window;
      editor.commands.focus('end');
      editor.view.pasteHTML(input);
      return window.RteEditorLab.getRteHtml(editor);
    }, c.input);
    expect(out).toBe(c.expected);
  });
}
