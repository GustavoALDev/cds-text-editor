import { expect, test } from '@playwright/test';
import { BASE, ORIGIN, url } from './helpers';

// I3 (spec 07c): com JavaScript desligado, o HTML pré-renderizado já traz o conteúdo; os links
// (relativos à base) e as âncoras funcionam como navegação nativa.

test.use({ javaScriptEnabled: false });

test.describe('I3: sem JavaScript', () => {
  test('o conteúdo do guia está no HTML', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await expect(page.locator('h1')).toHaveText('Início rápido');
    await expect(page.locator('.doc pre').first()).toContainText('npm install');
    await expect(page.locator('.doc pre').nth(1)).toContainText(
      '@comodeviaser/rte-theme/theme.css',
    );
  });

  test('um link de conteúdo navega (carregamento nativo)', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await page.locator('.doc a[href="guia/instalacao"]').first().click();
    await expect(page).toHaveURL(`${ORIGIN}${BASE}guia/instalacao`);
    await expect(page.locator('h1')).toHaveText('Instalação');
  });

  test('a âncora do sumário leva ao destino', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/configuracao'));
    await page
      .getByRole('navigation', { name: 'Nesta página' })
      .getByRole('link', { name: 'Qual valor vence' })
      .click();
    await expect(page).toHaveURL(
      `${ORIGIN}${BASE}guia/configuracao#qual-valor-vence`,
    );
    await expect(page.locator('#qual-valor-vence')).toBeInViewport();
  });

  test('a barra lateral lista o guia e as páginas de API', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/instalacao'));
    const nav = page.getByRole('navigation', { name: 'Documentação' });
    await expect(nav.getByRole('link', { name: 'Configuração' })).toBeVisible();
    expect(await nav.getByRole('link').count()).toBeGreaterThanOrEqual(18);
  });

  test('a busca fica escondida', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/instalacao'));
    await expect(page.locator('.search')).toBeHidden();
  });
});
