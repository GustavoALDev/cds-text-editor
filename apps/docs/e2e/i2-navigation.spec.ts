import { expect, test, type Page } from '@playwright/test';
import { BASE, ORIGIN, ready, url, watch } from './helpers';

// I2 (spec 07c): barra lateral, sumário, anterior/próximo e links de conteúdo navegam sem recarga
// (um marcador na `window` sobrevive); a âncora rola e recebe foco; recarregar uma URL profunda
// funciona; rota inexistente devolve a página 404.

const KEY = '__semRecarga';

/** Marca a `window`: a marca some se a página recarregar. */
async function mark(page: Page): Promise<void> {
  await page.evaluate((key) => {
    (window as unknown as Record<string, boolean>)[key] = true;
  }, KEY);
}

async function marked(page: Page): Promise<boolean> {
  return page.evaluate(
    (key) => (window as unknown as Record<string, boolean>)[key] === true,
    KEY,
  );
}

test.describe('I2: navegação', () => {
  test('a barra lateral navega sem recarregar', async ({ page }) => {
    const problems = await watch(page);
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await ready(page);
    await mark(page);
    await page
      .getByRole('navigation', { name: 'Documentação' })
      .getByRole('link', { name: 'Instalação' })
      .click();
    await expect(page).toHaveURL(`${ORIGIN}${BASE}guia/instalacao`);
    await expect(page.locator('h1')).toHaveText('Instalação');
    expect(await marked(page)).toBe(true);
    expect(problems.messages).toEqual([]);
  });

  test('anterior e próximo navegam sem recarregar', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/instalacao'));
    await ready(page);
    await mark(page);
    await page.locator('a[rel="next"]').click();
    await expect(page).toHaveURL(`${ORIGIN}${BASE}guia/configuracao`);
    await expect(page.locator('h1')).toHaveText('Configuração');
    await page.locator('a[rel="prev"]').click();
    await expect(page).toHaveURL(`${ORIGIN}${BASE}guia/instalacao`);
    expect(await marked(page)).toBe(true);
  });

  test('link de conteúdo (relativo à base) navega sem recarregar', async ({
    page,
  }) => {
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await ready(page);
    await mark(page);
    await page.locator('.doc a[href="guia/configuracao"]').first().click();
    await expect(page).toHaveURL(`${ORIGIN}${BASE}guia/configuracao`);
    await expect(page.locator('h1')).toHaveText('Configuração');
    expect(await marked(page)).toBe(true);
  });

  test('o sumário leva à âncora: muda a URL e rola até o título, sem recarregar', async ({
    page,
  }) => {
    await page.goto(url(ORIGIN, 'guia/configuracao'));
    await ready(page);
    await mark(page);
    await page
      .getByRole('navigation', { name: 'Nesta página' })
      .getByRole('link', { name: 'Qual valor vence' })
      .click();
    await expect(page).toHaveURL(/#qual-valor-vence$/);
    await expect(page.locator('#qual-valor-vence')).toBeInViewport();
    expect(await marked(page)).toBe(true);
  });

  test('o link de salto vai ao conteúdo e o foca', async ({ page }) => {
    await page.goto(url(ORIGIN, 'guia/instalacao'));
    await ready(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#conteudo$/);
    await expect(page.locator('#conteudo')).toBeFocused();
  });

  test('recarregar uma URL profunda com âncora funciona', async ({ page }) => {
    const problems = await watch(page);
    await page.goto(url(ORIGIN, 'guia/configuracao#qual-valor-vence'));
    await ready(page);
    await expect(page.locator('h1')).toHaveText('Configuração');
    await expect(page.locator('#qual-valor-vence')).toBeInViewport();
    await page.reload();
    await ready(page);
    await expect(page.locator('h1')).toHaveText('Configuração');
    expect(problems.messages).toEqual([]);
  });

  test('rota inexistente devolve o 404', async ({ page }) => {
    const response = await page.goto(url(ORIGIN, 'guia/nao-existe'));
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Página não encontrada');
  });

  test('a raiz do prefixo vai ao início rápido', async ({ page }) => {
    await page.goto(`${ORIGIN}${BASE}`);
    await ready(page);
    await expect(page).toHaveURL(`${ORIGIN}${BASE}guia/inicio-rapido`);
  });
});
