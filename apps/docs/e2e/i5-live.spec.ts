import { expect, test } from '@playwright/test';
import { ORIGIN, ready, url, watch } from './helpers';

// I5 (spec 07c): os exemplos vivos funcionam depois do prerender e da hidratação. O editor do
// Início rápido aceita texto, mostra o erro de `rteMaxChars` e a exibição acompanha; o exemplo da
// Configuração reflete o provider da rota.

test.describe('I5: exemplos vivos', () => {
  test('Início rápido: o editor aceita texto e a exibição atualiza', async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await ready(page);
    const live = page.locator('.doc-live');
    const area = live.locator('.ProseMirror').first();
    await expect(area).toBeVisible({ timeout: 30_000 });
    await area.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Texto novo');
    await expect(live.locator('article')).toContainText('Texto novo');
    await expect(live.getByTestId('erros')).toHaveText('');
    expect(problems.messages).toEqual([]);
  });

  test('Início rápido: valor acima do limite mostra o erro e volta a válido', async ({
    page,
  }) => {
    await page.goto(url(ORIGIN, 'guia/inicio-rapido'));
    await ready(page);
    const live = page.locator('.doc-live');
    await expect(live.locator('.ProseMirror').first()).toBeVisible({
      timeout: 30_000,
    });
    await live
      .getByRole('button', { name: 'Preencher acima do limite' })
      .click();
    await expect(live.getByTestId('erros')).toContainText('60');
    // A exibição mostra o conteúdo longo; o editor aceita apagar e o erro some.
    await expect(live.locator('article')).toContainText('texto texto');
    const area = live.locator('.ProseMirror').first();
    await area.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('curto');
    await expect(live.getByTestId('erros')).toHaveText('');
    await expect(live.locator('article')).toContainText('curto');
  });

  test('Configuração: o exemplo reflete o provider da rota', async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.goto(url(ORIGIN, 'guia/configuracao'));
    await ready(page);
    const com = page.getByTestId('com-provider');
    const sem = page.getByTestId('sem-provider');
    await expect(com.locator('.ProseMirror')).toBeVisible({ timeout: 30_000 });
    await expect(sem.locator('.ProseMirror')).toBeVisible({ timeout: 30_000 });
    // Com o provider: rótulos em português e a barra minimal (sem o menu de títulos).
    await expect(com.getByRole('button', { name: 'Negrito' })).toBeVisible();
    await expect(com.getByRole('button', { name: 'Sublinhado' })).toHaveCount(
      0,
    );
    // Sem o provider: rótulos em inglês e a barra article (com sublinhado).
    await expect(sem.getByRole('button', { name: 'Bold' })).toBeVisible();
    await expect(sem.getByRole('button', { name: 'Underline' })).toBeVisible();
    expect(problems.messages).toEqual([]);
  });
});
