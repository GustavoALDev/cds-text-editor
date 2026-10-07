// E1 (spec 03b, §7.6): o fixture "todos os recursos" carregado no editor de
// cada motor sai byte a byte igual por `getRteHtml`; o `editor.getHTML()` (com
// o `style` serializado pelo CSSOM real do motor) é aceito pelo esquema e só
// difere da saída canônica na forma do `style` e nos ids de título.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

const FIXTURE = readFileSync(
  resolve(__dirname, '../../fixtures/content/all-features.html'),
  'utf8',
).replace(/\r\n?/g, '\n');

test('E1: fixture all-features é ponto fixo e getHTML() é aceito', async ({
  page,
}) => {
  await loadEditorPage(page, {
    content: FIXTURE,
    editor: '{ codeLanguages: RteEditorLab.RTE_CODE_LANGUAGES }',
  });
  const result = await page.evaluate(() => {
    const { getRteHtml, validateHtml, getHtmlSchema, normalizeForCompare } =
      window.RteEditorLab;
    const schema = getHtmlSchema();
    const canonical = getRteHtml(window.editor);
    const raw = window.editor.getHTML();
    return {
      canonical,
      raw,
      violations: validateHtml(raw, schema, { mode: 'accepted' }),
      canonicalViolations: validateHtml(canonical, schema),
      normalizedRaw: normalizeForCompare(raw, schema, document),
      normalizedCanonical: normalizeForCompare(canonical, schema, document),
    };
  });
  expect(result.canonical).toBe(FIXTURE);
  expect(result.canonicalViolations).toEqual([]);
  expect(result.violations).toEqual([]);
  expect(result.normalizedRaw).toBe(result.normalizedCanonical);
});

// R7 (spec 03c, C19): com a busca por "a" ativa (decorações no DOM do motor),
// a saída canônica continua o fixture e o `getHTML()` não leva as decorações.
test('E1 (R7): busca ativa não vaza para o HTML', async ({ page }) => {
  await loadEditorPage(page, {
    content: FIXTURE,
    editor: '{ codeLanguages: RteEditorLab.RTE_CODE_LANGUAGES }',
  });
  const result = await page.evaluate(() => {
    const rawBefore = window.editor.getHTML();
    window.editor.commands.setSearchQuery('a');
    return {
      rawBefore,
      total: window.RteEditorLab.getSearchState(window.editor)?.total ?? 0,
      decorated: document.querySelectorAll('#editor .rte-search-match').length,
      canonical: window.RteEditorLab.getRteHtml(window.editor),
      raw: window.editor.getHTML(),
    };
  });
  expect(result.total).toBeGreaterThan(0);
  // Um resultado que atravessa marcas vira mais de um `span`.
  expect(result.decorated).toBeGreaterThanOrEqual(result.total);
  expect(result.canonical).toBe(FIXTURE);
  expect(result.raw).toBe(result.rawBefore);
  expect(result.raw).not.toContain('rte-search-match');
});
