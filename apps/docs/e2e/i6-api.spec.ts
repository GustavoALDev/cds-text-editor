import { expect, test } from '@playwright/test';
import { API_ROUTES, ORIGIN, ready, url, watch } from './helpers';

// I6 (spec 07c): a página de cada pacote abre, a âncora de um item resolve e nenhum nome interno
// (`ɵ`) aparece. Os entries secundários são cobertos pela I1 e pelo teste de cobertura do build.

const PACKAGES = ['angular', 'core', 'theme', 'sanitizer', 'render'] as const;

test.describe('I6: referência da API', () => {
  test('o build tem uma página por entry publicado', () => {
    for (const name of PACKAGES) {
      expect(API_ROUTES).toContain(`api/${name}`);
    }
  });

  for (const name of PACKAGES) {
    test(`api/${name}: abre, o índice leva a uma âncora e não mostra ɵ`, async ({
      page,
    }) => {
      const problems = await watch(page);
      await page.goto(url(ORIGIN, `api/${name}`));
      await ready(page);
      await expect(page.locator('h1')).toContainText(`@comodeviaser/rte-${name}`);
      await expect(page.locator('#indice')).toBeVisible();

      const text = (await page.locator('.doc').innerText()) ?? '';
      expect(text).not.toContain('ɵ');

      // Um link do índice para um item da própria página: muda a URL e rola até o item.
      const link = page.locator('.doc a[href*="#"]').filter({
        hasNotText: /^$/,
      });
      const href = await link.first().getAttribute('href');
      expect(href).toMatch(new RegExp(`^api/${name}#.+`));
      const id = (href ?? '').split('#')[1] ?? '';
      await link.first().click();
      await expect(page).toHaveURL(new RegExp(`/api/${name}#${id}$`));
      await expect(page.locator(`[id="${id}"]`)).toBeInViewport();
      expect(problems.messages).toEqual([]);
    });
  }

  test('a âncora de um item famoso resolve por URL direta', async ({
    page,
  }) => {
    await page.goto(url(ORIGIN, 'api/angular#providerichtext'));
    await ready(page);
    await expect(page.locator('#providerichtext')).toBeInViewport();
    await expect(page.locator('#providerichtext')).toContainText(
      'provideRichText',
    );
  });
});
