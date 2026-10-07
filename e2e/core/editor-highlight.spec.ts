// E5 (spec 03b, §6 e §7.6): a gramática do bloco `language-javascript` é
// carregada sob demanda e vira decorações `hljs-*`; a saída canônica nunca
// leva `hljs`; o bloco que vira parágrafo perde as decorações.
import { expect, test } from '@playwright/test';
import { loadEditorPage } from './helpers/editor-page';

const CODE = '<pre><code class="language-javascript">const a = 1;</code></pre>';

test('E5: realce sob demanda e saída sem hljs', async ({ page }) => {
  // Catálogo padrão com `load()` espionado: só a gramática usada é carregada.
  await loadEditorPage(page, {
    content: CODE,
    editor: `{
      codeLanguages: RteEditorLab.RTE_CODE_LANGUAGES.map((language) => ({
        ...language,
        load: () => {
          (window.e2eLoads ??= []).push(language.id);
          return language.load();
        },
      })),
    }`,
  });
  const keyword = page.locator('#editor pre .hljs-keyword');
  await expect(keyword).toHaveText('const');
  expect(
    await page.evaluate(() => (window as { e2eLoads?: string[] }).e2eLoads),
  ).toEqual(['javascript']);
  expect(
    await page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor)),
  ).toBe(CODE);

  await page.evaluate(() => {
    window.editor.chain().focus('start').setParagraph().run();
  });
  await expect(page.locator('#editor .ProseMirror > p')).toHaveText(
    'const a = 1;',
  );
  await expect(page.locator('#editor [class*="hljs"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.RteEditorLab.getRteHtml(window.editor)),
  ).toBe('<p>const a = 1;</p>');
});

test('E5: sem catálogo não há realce', async ({ page }) => {
  await loadEditorPage(page, { content: CODE });
  await expect(page.locator('#editor pre code')).toHaveText('const a = 1;');
  // Dá tempo a uma eventual carga assíncrona antes de afirmar a ausência.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  await expect(page.locator('#editor [class*="hljs"]')).toHaveCount(0);
});
