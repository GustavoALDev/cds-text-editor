import { expect, test, type Page } from '@playwright/test';
import { editableOf, gotoApp, modelValue, waitForEditor } from './helpers/app';

// N3 (spec 05a, R8, D15): trocar o idioma (en → pt-BR → es) em tempo de
// execução muda o nome acessível, o placeholder do documento vazio, o rótulo
// do título vazio de caixa e o nome do checkbox da tarefa, sem editar: o
// documento do editor é o mesmo objeto (nenhuma transação de documento, logo
// nenhum `valueChange`) e o valor do modelo não muda.

const LANGS = [
  {
    lang: 'en',
    name: 'Rich text editor',
    placeholder: 'Write here',
    warning: 'Warning',
    task: 'Task: Task',
  },
  {
    lang: 'pt-BR',
    name: 'Editor de texto rico',
    placeholder: 'Escreva aqui',
    warning: 'Atenção',
    task: 'Tarefa: Task',
  },
  {
    lang: 'es',
    name: 'Editor de texto enriquecido',
    placeholder: 'Escribe aquí',
    warning: 'Atención',
    task: 'Tarea: Task',
  },
] as const;

/** `content` do `::before` de um elemento (aspas incluídas). */
function before(page: Page, selector: string): Promise<string> {
  return editableOf(page, 'labels')
    .locator(selector)
    .evaluate((el) => getComputedStyle(el, '::before').content);
}

/**
 * Guarda o documento atual do editor (`mark`) ou compara com o guardado:
 * o mesmo objeto = nenhuma transação de documento desde a marca.
 */
function docIdentity(page: Page, mode: 'mark' | 'same'): Promise<boolean> {
  return page.evaluate((mode) => {
    const host = document.querySelector('rte-editor[data-testid="labels"]');
    const doc = host && window.rteE2e.getRteEditor(host)?.state.doc;
    if (!doc) throw new Error("editor 'labels' ausente");
    const w = window as unknown as { __doc?: unknown };
    if (mode === 'mark') w.__doc = doc;
    return w.__doc === doc;
  }, mode);
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/labels');
  await waitForEditor(page, 'labels');
});

test('N3: título vazio de caixa, checkbox e nome acessível seguem o idioma sem editar', async ({
  page,
}) => {
  const textbox = page.locator(
    'rte-editor[data-testid="labels"] [role="textbox"]',
  );
  const checkbox = editableOf(page, 'labels').locator('input[type="checkbox"]');
  const value = await modelValue(page, 'labels');
  await docIdentity(page, 'mark');

  for (const l of LANGS) {
    await page.evaluate((lang) => window.rteE2e.setLang(lang), l.lang);
    await expect(textbox).toHaveAccessibleName(l.name);
    await expect(checkbox).toHaveAttribute('aria-label', l.task);
    await expect(checkbox).toHaveAccessibleName(l.task);
    await expect
      .poll(() => before(page, 'p.rt-callout__title'))
      .toBe(`"${l.warning}"`);
    expect(await docIdentity(page, 'same')).toBe(true);
    expect(await modelValue(page, 'labels')).toBe(value);
  }
});

test('N3: placeholder do documento vazio segue o idioma sem editar', async ({
  page,
}) => {
  await page.evaluate(() => window.rteE2e.setValue('labels', ''));
  const editable = editableOf(page, 'labels');
  await expect(editable.locator('.rte-placeholder--doc')).toHaveCount(1);
  await docIdentity(page, 'mark');

  for (const l of LANGS) {
    await page.evaluate((lang) => window.rteE2e.setLang(lang), l.lang);
    await expect
      .poll(() => before(page, '.rte-placeholder--doc'))
      .toBe(`"${l.placeholder}"`);
    await expect(editable).toHaveAttribute('aria-placeholder', l.placeholder);
    await expect(editable).toHaveAccessibleName(l.name);
    expect(await docIdentity(page, 'same')).toBe(true);
    expect(await modelValue(page, 'labels')).toBe('');
  }
});
