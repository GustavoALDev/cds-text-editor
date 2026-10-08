import { expect, test, type Page } from '@playwright/test';
import { ORIGIN, textOf, watch } from './helpers';

// J3 (spec 07b, W12): os três modos de formulário e o limite de caracteres (`rteMaxChars`).

const MODES = [
  { id: 'signal', name: 'Texto (Signal Forms)', seed: 'Signal Forms' },
  { id: 'reactive', name: 'Texto (Reactive Forms)', seed: 'Reactive Forms' },
  { id: 'template', name: 'Texto (Template Forms)', seed: 'Template Forms' },
] as const;

const editorOf = (page: Page, name: string) =>
  page.getByRole('textbox', { name }).first();

test.beforeEach(async ({ page }) => {
  await page.goto(`${ORIGIN}/forms`);
  await expect(page.locator('.ProseMirror').first()).toBeVisible({
    timeout: 30_000,
  });
});

for (const mode of MODES) {
  test(`J3: ${mode.id} reflete o valor e a validade`, async ({ page }) => {
    const problems = await watch(page);
    const editor = editorOf(page, mode.name);
    await expect(page.getByTestId(`${mode.id}-state`)).toHaveText(
      'Válido: sim',
    );
    expect(await textOf(page, `${mode.id}-value`)).toContain(mode.seed);

    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' ok');
    await expect
      .poll(() => textOf(page, `${mode.id}-value`))
      .toContain(`${mode.seed} ok`);
    await expect(page.getByTestId(`${mode.id}-state`)).toHaveText(
      'Válido: sim',
    );
    await expect(page.getByTestId(`${mode.id}-errors`)).toHaveText('');
    expect(problems.messages).toEqual([]);
  });
}

test('J3: apagar tudo reprova o required do Signal Forms (erro traduzido)', async ({
  page,
}) => {
  const editor = editorOf(page, MODES[0].name);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('signal-state')).toHaveText('Válido: não');
  await expect(page.getByTestId('signal-errors')).not.toHaveText('');
  await expect(page.getByTestId('signal-errors')).toHaveAttribute(
    'aria-live',
    'polite',
  );
});

test('J3: texto acima do limite (rteMaxChars) reprova nos três modos e o erro é anunciado', async ({
  page,
}) => {
  // O editor barra a digitação além do limite (`maxLength`), então o texto longo entra por
  // código (o botão da página faz `model.set`, `control.setValue` e `ngModel`): a validação o
  // reprova e `formatRteError` traduz o erro numa região `aria-live`.
  await page.getByTestId('fill-long').click();
  for (const mode of MODES) {
    await expect(page.getByTestId(`${mode.id}-state`)).toHaveText(
      'Válido: não',
    );
    await expect(page.getByTestId(`${mode.id}-errors`)).toContainText('60');
    await expect(page.getByTestId(`${mode.id}-errors`)).toHaveAttribute(
      'aria-live',
      'polite',
    );
  }

  // Digitar não passa do limite: o editor corta a entrada.
  const editor = editorOf(page, MODES[0].name);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('y'.repeat(80));
  await expect(page.getByTestId('signal-state')).toHaveText('Válido: sim');
  await expect(page.getByTestId('signal-errors')).toHaveText('');
});

test('J3: [(value)] sem formulário acompanha a digitação', async ({ page }) => {
  const editor = editorOf(page, 'Texto (value)');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('!');
  await expect
    .poll(() => textOf(page, 'plain-value'))
    .toContain('Sem formulário!');
});
