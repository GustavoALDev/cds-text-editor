import { expect, test } from '@playwright/test';
import { ORIGIN, ready, url, watch } from './helpers';

// I7 (spec 07d, L8): um `describe` por exemplo vivo do guia, com uma afirmação de comportamento.
// Esqueleto da T1: cada tarefa (T2 formularios/barra-e-recursos/idiomas/tema, T3 exibicao)
// troca os `test.fixme` do SEU `describe` pelo corpo real e registra o id em
// `examples/registry.ts` (uma linha por id, ordem alfabética). Rotas novas entram sozinhas no
// I1 (lista da nav.json), I2 e I3.

// Mantém os imports usados enquanto os corpos são `fixme`.
void [expect, ORIGIN, ready, url, watch];

test.describe('I7 tema', () => {
  test.fixme('os tokens computados do .meu-tema .rte-root refletem cada nível (1: sementes; 2: raio e densidade; 3: mira .rte-root)', () => undefined);
  test.fixme('a chave "site escuro" muda o color-scheme do ancestral e o editor com inherit o acompanha; o :root do site não muda', () => undefined);
});

test.describe('I7 formularios', () => {
  test.fixme('texto além do limite mostra o erro de rteMaxChars (mensagem de formatRteError)', () => undefined);
  test.fixme('campo vazio dispara rteRequired', () => undefined);
  test.fixme('[(value)] funciona nos dois sentidos: digitar atualiza o valor e "definir valor" atualiza o editor', () => undefined);
});

test.describe('I7 barra-e-recursos', () => {
  test.fixme('trocar o preset recria o editor (@for/track) e muda os botões da barra', () => undefined);
});

test.describe('I7 idiomas', () => {
  test.fixme('pt-BR, en e es mudam o nome acessível de um botão sem recriar o editor (o nó .ProseMirror sobrevive)', () => undefined);
});

test.describe('I7 exibicao', () => {
  test('rte-toc lista os ids rt- do conteúdo e a âncora rola até o título', async ({
    page,
  }) => {
    const problems = await watch(page);
    const pageUrl = url(ORIGIN, 'guia/exibicao');
    await page.goto(pageUrl);
    await ready(page);
    const live = page.getByTestId('exibicao');
    await expect(live.locator('.ProseMirror')).toBeVisible({ timeout: 30_000 });

    const links = live.locator('nav.rte-toc a.rte-toc__link');
    await expect(links).toHaveText(['Primeiros passos', 'Configuração', 'Barra']);
    // Os títulos da exibição carregam os mesmos ids rt-<slug>.
    const article = live.getByTestId('artigo');
    await expect(article.locator('h2#rt-primeiros-passos')).toBeVisible();
    await expect(article.locator('h3#rt-barra')).toBeVisible();
    // O href resolve contra o endereço do documento, sob o prefixo de publicação (<base href>).
    expect(await links.nth(2).evaluate((a) => (a as HTMLAnchorElement).href)).toBe(
      `${pageUrl}#rt-barra`,
    );

    // Clicar na entrada rola até o título.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await links.nth(2).click();
    await expect(page).toHaveURL(`${pageUrl}#rt-barra`);
    await expect(article.locator('#rt-barra')).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    // Editar o título muda o id, e o sumário acompanha.
    const heading = live.locator('.ProseMirror h2', { hasText: 'Configuração' });
    await heading.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' extra');
    await expect(links.nth(1)).toHaveText('Configuração extra');
    await expect(links.nth(1)).toHaveAttribute('href', /#rt-configuracao-extra$/);
    await expect(article.locator('h2#rt-configuracao-extra')).toBeVisible();
    await expect(article.locator('#rt-configuracao')).toHaveCount(0);
    expect(problems.messages).toEqual([]);
  });
});
