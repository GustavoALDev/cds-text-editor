import { expect, test } from '@playwright/test';
import { editableOf, editorHost, gotoApp, waitForEditor } from './helpers/app';

// N47 (spec 08a, X7; ADR 0015): com o editor `readonly`, `Mod+F` abre a
// busca e navega entre os resultados, mas a substituição fica fora da tela.
test.describe('N47: readonly', () => {
  test('Mod+F abre a busca, Enter e Shift+Enter navegam e não há substituir', async ({
    page,
  }) => {
    await gotoApp(page, '/forms');
    await waitForEditor(page, 'signal');
    await page.evaluate(() =>
      window.rteE2e.setValue(
        'signal',
        '<p>uva banana</p><p>pera banana</p><p>fim banana</p>',
      ),
    );
    await expect(editableOf(page, 'signal')).toContainText('fim banana');
    await page.evaluate(() => window.rteE2e.toggle('readonly'));
    await expect(editorHost(page, 'signal')).toHaveClass(
      /rte-editor--readonly/,
    );

    const searchBar = editorHost(page, 'signal').locator('.rte-search');
    await editableOf(page, 'signal').focus();
    await expect(editableOf(page, 'signal')).toBeFocused();
    await page.keyboard.press('ControlOrMeta+f');
    await expect(searchBar).toBeVisible();
    const input = searchBar.locator('.rte-search__input');
    await expect(input).toHaveCount(1);
    await expect(input).toBeFocused();
    await input.fill('banana');
    const total = searchBar.locator('.rte-search__count');
    await expect(total).toHaveText('1 of 3');
    await page.keyboard.press('Enter');
    await expect(total).toHaveText('2 of 3');
    await page.keyboard.press('Shift+Enter');
    await expect(total).toHaveText('1 of 3');

    // ADR 0015: sem o botão que expande a substituição, sem campo e sem "Replace".
    await expect(searchBar.locator('[aria-expanded]')).toHaveCount(0);
    await expect(
      searchBar.getByRole('button', { name: /Replace/ }),
    ).toHaveCount(0);
    await expect(searchBar.getByRole('textbox')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(searchBar).toBeHidden();
  });
});
