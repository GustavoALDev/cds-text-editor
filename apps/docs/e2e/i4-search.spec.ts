import { expect, test } from '@playwright/test';
import { BASE, ORIGIN, ready, url, watch } from './helpers';

// I4 (spec 07c): digitar acha uma seção do guia e um item da API; teclado (setas, Enter, Escape);
// o resultado navega para a âncora; termo sem resultado é anunciado.

test.describe('I4: busca', () => {
  test('acha uma seção do guia, mesmo sem acento, e navega para a âncora com Enter', async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.goto(url(ORIGIN, 'guia/instalacao'));
    await ready(page);
    const box = page.getByRole('combobox', { name: 'Buscar na documentação' });
    await expect(box).toBeVisible();
    await box.focus();
    await box.fill('valor vence');
    const options = page.getByRole('option');
    await expect(options.first()).toContainText('Qual valor vence');
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(page).toHaveURL(
      `${ORIGIN}${BASE}guia/configuracao#qual-valor-vence`,
    );
    await expect(page.locator('#qual-valor-vence')).toBeInViewport();
    expect(problems.messages).toEqual([]);
  });

  test('acha um item da API por prefixo e abre a página de API', async ({
    page,
  }) => {
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await ready(page);
    const box = page.getByRole('combobox', { name: 'Buscar na documentação' });
    await box.focus();
    await box.fill('provideRich');
    const option = page
      .getByRole('option')
      .filter({ hasText: 'provideRichText' })
      .first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(page).toHaveURL(/\/api\/angular#providerichtext$/);
    await expect(page.locator('#providerichtext')).toBeInViewport();
  });

  test('as setas movem a opção ativa e Escape fecha a lista', async ({
    page,
  }) => {
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await ready(page);
    const box = page.getByRole('combobox', { name: 'Buscar na documentação' });
    await box.focus();
    await box.fill('editor');
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeGreaterThan(1);
    await box.press('ArrowDown');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await box.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await box.press('ArrowUp');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await box.press('Escape');
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listbox')).toBeHidden();
  });

  test('um termo ausente anuncia zero resultados', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await ready(page);
    const box = page.getByRole('combobox', { name: 'Buscar na documentação' });
    await box.focus();
    await box.fill('zzzxqwv');
    await expect(page.getByRole('option')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: /\S/ }),
    ).toContainText(/nenhum|0/i);
  });

  test('a barra "/" foca a busca', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await ready(page);
    await page.locator('h1').click();
    await page.keyboard.press('/');
    await expect(
      page.getByRole('combobox', { name: 'Buscar na documentação' }),
    ).toBeFocused();
  });
});
