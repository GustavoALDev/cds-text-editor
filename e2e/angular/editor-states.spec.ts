import { expect, test, type Page } from '@playwright/test';
import {
  editableOf,
  editorHost,
  formState,
  gotoApp,
  modelValue,
  waitForEditor,
} from './helpers/app';
import { expectToolbarFocused } from './helpers/toolbar';

// N2 (spec 05a, R5, R7, D10, D12): `disabled`, `readonly` e `hidden` do Signal
// Forms com o teclado real; `rteMaxChars(50)` recusa a digitação além do
// limite (formulário válido) e mantém a carga acima (inválido, sem corte);
// apagar tudo dá `''` e `rteRequired`.

const TASKS =
  '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li></ul>';

/** Leva o foco ao último link da navegação, logo antes do editor `signal`. */
async function focusBeforeSignal(page: Page): Promise<void> {
  await page.locator('#nav-perf').focus();
  await expect(page.locator('#nav-perf')).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/forms');
  for (const id of ['signal', 'reactive', 'plain'] as const) {
    await waitForEditor(page, id);
  }
});

test('N2: disabled fica fora da ordem de Tab e não é editável', async ({
  page,
}) => {
  const editable = editableOf(page, 'signal');
  await page.evaluate(() => window.rteE2e.toggle('disabled'));
  await expect(editorHost(page, 'signal')).toHaveClass(/rte-editor--disabled/);
  await expect(editable).toHaveAttribute('contenteditable', 'false');
  await expect(editable).toHaveAttribute('aria-disabled', 'true');

  // Nem o editável nem a barra (botões `disabled` nativos, spec 05b1): a
  // próxima parada é a barra do `reactive`.
  await focusBeforeSignal(page);
  await page.keyboard.press('Tab');
  await expectToolbarFocused(page, 'reactive');

  await editable.click({ force: true });
  await page.keyboard.type('nada');
  await expect(editable).not.toBeFocused();
  expect(await modelValue(page, 'signal')).toBe('');
});

test('N2: disabled com o foco dentro tira o foco e emite editorBlur uma vez', async ({
  page,
}) => {
  const editable = editableOf(page, 'signal');
  await editable.click();
  await expect(editable).toBeFocused();
  expect((await formState(page, 'signal')).touched).toBe(false);

  await page.evaluate(() => window.rteE2e.toggle('disabled'));
  await expect(editable).not.toBeFocused();
  // A ordem real de `blur()`/`focusout` emite uma vez (Review Focus 4 da Tarefa 5).
  await expect(page.locator('#blur-count')).toHaveText('1');
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))),
  );
  await expect(page.locator('#blur-count')).toHaveText('1');
  // O `touch` sai junto com o `editorBlur`, mas o Signal Forms ignora
  // `markAsTouched` num campo não interativo (`shouldSkipValidation`): o campo
  // continua não tocado, também depois de reabilitar.
  expect((await formState(page, 'signal')).touched).toBe(false);
  await page.evaluate(() => window.rteE2e.toggle('disabled'));
  await expect(editable).toHaveAttribute('contenteditable', 'true');
  expect((await formState(page, 'signal')).touched).toBe(false);
  await expect(page.locator('#blur-count')).toHaveText('1');
});

test('N2: os checkboxes das tarefas seguem o disabled ligado depois da criação', async ({
  page,
}) => {
  await page.evaluate((v) => window.rteE2e.setValue('signal', v), TASKS);
  const box = editableOf(page, 'signal').locator('input[type="checkbox"]');
  await expect(box).toBeEnabled();
  await page.evaluate(() => window.rteE2e.toggle('disabled'));
  await expect(box).toBeDisabled();
  await page.evaluate(() => window.rteE2e.toggle('disabled'));
  await expect(box).toBeEnabled();
  expect(await modelValue(page, 'signal')).toBe(TASKS);
});

test('N2: readonly é focável por Tab, selecionável e não editável, com placeholder', async ({
  page,
}) => {
  const editable = editableOf(page, 'signal');
  await page.evaluate(() => window.rteE2e.toggle('readonly'));
  await expect(editorHost(page, 'signal')).toHaveClass(/rte-editor--readonly/);
  await expect(editable).toHaveAttribute('aria-readonly', 'true');

  // Placeholder visível no documento vazio.
  const placeholder = editable.locator('.rte-placeholder');
  await expect(placeholder).toHaveCount(1);
  expect(
    await placeholder.evaluate((p) => getComputedStyle(p, '::before').content),
  ).toBe('"Write here"');

  await focusBeforeSignal(page);
  await page.keyboard.press('Tab');
  await expect(editable).toBeFocused();
  await page.keyboard.type('nada');
  expect(await modelValue(page, 'signal')).toBe('');

  // Seleção pelo teclado num texto carregado (Chromium e WebKit não estendem
  // a seleção num `contenteditable="false"`; o componente faz, D10).
  await page.evaluate(() => window.rteE2e.setValue('signal', '<p>abc</p>'));
  await expect(editable).toHaveText('abc');
  await editable.locator('p').click({ position: { x: 1, y: 5 } });
  await expect(editable).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('ab');
  // Sem `Backspace`: no WebKit, fora de um campo editável, ele volta a página.
  await page.keyboard.type('z');
  await expect(editable).toHaveText('abc');
  expect(await modelValue(page, 'signal')).toBe('<p>abc</p>');
});

test('N2: hidden esconde o editor', async ({ page }) => {
  await page.evaluate(() => window.rteE2e.toggle('hidden'));
  await expect(editorHost(page, 'signal')).toBeHidden();
  await page.evaluate(() => window.rteE2e.toggle('hidden'));
  await expect(editorHost(page, 'signal')).toBeVisible();
});

test('N2: rteMaxChars(50) recusa a digitação além do limite e mantém a carga acima', async ({
  page,
}) => {
  const editable = editableOf(page, 'signal');
  const sixty = '0123456789'.repeat(6);

  await editable.click();
  await page.keyboard.type(sixty);
  await expect
    .poll(() => modelValue(page, 'signal'))
    .toBe(`<p>${sixty.slice(0, 50)}</p>`);
  await expect(editable).toHaveText(sixty.slice(0, 50));
  expect(await formState(page, 'signal')).toMatchObject({
    valid: true,
    errors: [],
  });

  // Carga acima do limite: inteira, sem corte, e o formulário inválido.
  await page.evaluate(
    (v) => window.rteE2e.setValue('signal', `<p>${v}</p>`),
    sixty,
  );
  await expect(editable).toHaveText(sixty);
  expect(await modelValue(page, 'signal')).toBe(`<p>${sixty}</p>`);
  expect(await formState(page, 'signal')).toMatchObject({
    valid: false,
    errors: ['rteMaxChars'],
  });

  // Apagar tudo: `''` e `rteRequired`.
  await editable.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await expect.poll(() => modelValue(page, 'signal')).toBe('');
  expect(await formState(page, 'signal')).toMatchObject({
    valid: false,
    errors: ['rteRequired'],
  });
});
