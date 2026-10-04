import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  caretAfter,
  editableOf,
  gotoApp,
  modelValue,
  waitForEditor,
} from './helpers/app';
import { expectToolbarFocused } from './helpers/toolbar';

// N6 (spec 05a, R13, D13): axe sem violações `serious`/`critical` na página
// com os três editores, em claro e escuro; papel, `aria-multiline` e nome
// acessível; com o teclado real, `Tab`/`Shift+Tab` saem do editor a partir de
// um parágrafo, da última/primeira célula da tabela e passam pelo checkbox da
// tarefa; `Mod+B`, `Mod+I` e `Mod+Z` funcionam. O editor do meio (`reactive`)
// tem vizinhos focáveis dos dois lados (`signal` antes, `plain` depois).
// Spec 05b1 (pré-voo 6): a barra é a primeira parada de cada editor, então o
// `Tab` para fora chega à barra do `plain` e o `Shift+Tab` do editável para
// na barra do próprio editor; um segundo `Shift+Tab` sai dele.

const TABLE =
  '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>';

const TASKS =
  '<p>antes</p><ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li></ul>';

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/forms');
  for (const id of ['signal', 'reactive', 'plain'] as const) {
    await waitForEditor(page, id);
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`N6 (${scheme}): axe sem violações serious/critical`, async ({
    page,
  }) => {
    // O axe é lento no Firefox com 4 workers no Windows.
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({
        id: v.id,
        impact: v.impact,
        targets: v.nodes.map((n) => n.target.join(' ')),
      }));
    expect(severe).toEqual([]);
  });
}

test('N6: papel, aria-multiline e nome acessível do editável', async ({
  page,
}) => {
  for (const [id, name] of [
    ['signal', 'Signal Forms'],
    ['reactive', 'Reactive Forms'],
    ['plain', 'Plain value'],
  ] as const) {
    const editable = editableOf(page, id);
    await expect(editable).toHaveAttribute('role', 'textbox');
    await expect(editable).toHaveAttribute('aria-multiline', 'true');
    await expect(editable).toHaveAccessibleName(name);
  }
  await expect(editableOf(page, 'signal')).toHaveAttribute(
    'aria-required',
    'true',
  );
});

test('N6: Tab e Shift+Tab saem do editor a partir de um parágrafo', async ({
  page,
}) => {
  await page.evaluate(() => window.rteE2e.setValue('reactive', '<p>abc</p>'));
  await caretAfter(page, 'reactive', 'abc');
  await page.keyboard.press('Tab');
  await expectToolbarFocused(page, 'plain');

  await caretAfter(page, 'reactive', 'abc');
  await page.keyboard.press('Shift+Tab');
  await expectToolbarFocused(page, 'reactive');
  await page.keyboard.press('Shift+Tab');
  await expect(editableOf(page, 'signal')).toBeFocused();
  expect(await modelValue(page, 'reactive')).toBe('<p>abc</p>');
});

test('N6: Tab na última célula e Shift+Tab na primeira saem da tabela', async ({
  page,
}) => {
  await page.evaluate((v) => window.rteE2e.setValue('reactive', v), TABLE);
  await caretAfter(page, 'reactive', 'd');
  await page.keyboard.press('Tab');
  await expectToolbarFocused(page, 'plain');

  await caretAfter(page, 'reactive', 'a');
  await page.keyboard.press('Shift+Tab');
  await expectToolbarFocused(page, 'reactive');
  await page.keyboard.press('Shift+Tab');
  await expect(editableOf(page, 'signal')).toBeFocused();
  // Nenhuma linha criada: o valor é a carga (sem eco nem edição).
  expect(await modelValue(page, 'reactive')).toBe(TABLE);
  await expect(editableOf(page, 'reactive').locator('tr')).toHaveCount(2);
});

test('N6: Tab passa pelo checkbox da tarefa e sai do editor', async ({
  page,
  browserName,
}) => {
  await page.evaluate((v) => window.rteE2e.setValue('reactive', v), TASKS);
  const box = editableOf(page, 'reactive').locator('input[type="checkbox"]');
  await caretAfter(page, 'reactive', 'antes');
  await page.keyboard.press('Tab');
  const reached = await box.evaluate((b) => b === document.activeElement);
  if (!reached && browserName === 'firefox') {
    // ADR 0004, decisão 33: o Firefox parte do cursor na navegação por Tab.
    test.info().annotations.push({
      type: 'ADR 0004 (33)',
      description:
        'Firefox: o Tab a partir do parágrafo antes da lista não chegou ao checkbox',
    });
  } else {
    await expect(box).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expectToolbarFocused(page, 'plain');
  expect(await modelValue(page, 'reactive')).toBe(TASKS);
});

test('N6: Mod+B, Mod+I e Mod+Z com o teclado real', async ({ page }) => {
  const editable = editableOf(page, 'plain');
  await editable.click();
  await page.keyboard.type('a');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.type('b');
  await page.keyboard.press('ControlOrMeta+B');
  await page.keyboard.press('ControlOrMeta+I');
  await page.keyboard.type('i');
  const full = '<p>a<strong>b</strong><em>i</em></p>';
  await expect.poll(() => modelValue(page, 'plain')).toBe(full);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => modelValue(page, 'plain')).not.toBe(full);
  for (let i = 0; i < 5 && (await modelValue(page, 'plain')) !== ''; i++) {
    await page.keyboard.press('ControlOrMeta+Z');
  }
  expect(await modelValue(page, 'plain')).toBe('');
});
