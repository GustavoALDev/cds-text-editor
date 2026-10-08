import { expect, test, type Page } from '@playwright/test';
import { ORIGIN, ready, url, watch } from './helpers';

// I7 (spec 07d, L8): um `describe` por exemplo vivo do guia, com uma afirmação de comportamento.
// Esqueleto da T1: cada tarefa (T2 formularios/barra-e-recursos/idiomas/tema, T3 exibicao)
// troca os `test.fixme` do SEU `describe` pelo corpo real e registra o id em
// `examples/registry.ts` (uma linha por id, ordem alfabética). Rotas novas entram sozinhas no
// I1 (lista da nav.json), I2 e I3.

// Mantém os imports usados enquanto os corpos são `fixme`.
void [expect, ORIGIN, ready, url, watch];

/** Normaliza uma cor CSS (ou o valor computado de uma semente) para `rgb(...)`, pelo navegador. */
const normalizeColor = (page: Page, value: string): Promise<string> =>
  page.evaluate((v) => {
    const probe = document.createElement('span');
    probe.style.color = v;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, value);

test.describe('I7 tema', () => {
  test('os tokens computados do .meu-tema .rte-root refletem cada nível (1: sementes; 2: raio e densidade; 3: mira .rte-root)', async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.goto(url(ORIGIN, 'guia/tema'));
    await ready(page);
    const box = page.getByTestId('tema');
    await expect(box.locator('.ProseMirror')).toBeVisible({ timeout: 30_000 });
    const root = box.locator('.rte-root').first();
    const token = (name: string): Promise<string> =>
      root.evaluate(
        (el, n) => getComputedStyle(el).getPropertyValue(n).trim(),
        name,
      );
    const siteToken = (name: string): Promise<string> =>
      page.evaluate(
        (n) =>
          getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    const siteBefore = await siteToken('--rte-primary');

    // Com a classe: nível 1 (sementes), 2 (forma) e 3 (token fino, mirando .rte-root).
    expect(await normalizeColor(page, await token('--rte-primary'))).toBe(
      await normalizeColor(page, '#0369a1'),
    );
    expect(await normalizeColor(page, await token('--rte-secondary'))).toBe(
      await normalizeColor(page, '#0e7490'),
    );
    expect(await normalizeColor(page, await token('--rte-tertiary'))).toBe(
      await normalizeColor(page, '#4f46e5'),
    );
    expect(await token('--rte-radius')).toBe('2px');
    expect(Number(await token('--rte-density'))).toBeCloseTo(0.85, 5);
    expect(await normalizeColor(page, await token('--rte-danger'))).toBe(
      await normalizeColor(page, '#c62828'),
    );
    expect(await token('--rte-focus-width')).toBe('4px');

    // Sem a classe, voltam ao padrão (o que prova que vêm do CSS do exemplo).
    await page.getByLabel('Aplicar a classe meu-tema').uncheck();
    await expect(box).not.toHaveClass(/meu-tema(\s|$)/);
    expect(await normalizeColor(page, await token('--rte-primary'))).not.toBe(
      await normalizeColor(page, '#0369a1'),
    );
    expect(await token('--rte-radius')).not.toBe('2px');
    expect(await token('--rte-focus-width')).not.toBe('4px');

    // O :root do site não muda em nenhum dos dois estados.
    expect(await siteToken('--rte-primary')).toBe(siteBefore);
    expect(problems.messages).toEqual([]);
  });

  test('a chave "site escuro" muda o color-scheme do ancestral e o editor com inherit o acompanha; o :root do site não muda', async ({
    page,
  }) => {
    await page.goto(url(ORIGIN, 'guia/tema'));
    await ready(page);
    const box = page.getByTestId('tema');
    await expect(box.locator('.ProseMirror')).toBeVisible({ timeout: 30_000 });
    const root = box.locator('.rte-root').first();
    const scheme = (selector: 'root' | 'site'): Promise<string> =>
      selector === 'root'
        ? root.evaluate((el) => getComputedStyle(el).colorScheme)
        : page.evaluate(
            () => getComputedStyle(document.documentElement).colorScheme,
          );
    // O token guarda a expressão light-dark(); a cor resolvida se lê num filho que a usa.
    const surface = (): Promise<string> =>
      root.evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--rte-surface)';
        el.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });

    await expect(root).toHaveAttribute('data-rte-mode', 'inherit');
    expect(await scheme('root')).toBe('light');
    const siteScheme = await scheme('site');
    const lightSurface = await surface();

    await page.getByLabel('Site escuro').check();
    await expect(box).toHaveClass(/meu-site--escuro/);
    await expect.poll(() => scheme('root')).toBe('dark');
    await expect.poll(surface).not.toBe(lightSurface);
    // O resto do site (o :root) segue como estava.
    expect(await scheme('site')).toBe(siteScheme);

    await page.getByLabel('Site escuro').uncheck();
    await expect.poll(() => scheme('root')).toBe('light');
    await expect.poll(surface).toBe(lightSurface);
  });
});

test.describe('I7 formularios', () => {
  const open = async (page: Page): Promise<void> => {
    await page.goto(url(ORIGIN, 'guia/formularios'));
    await ready(page);
    for (const id of ['template', 'reactive', 'value']) {
      await expect(page.getByTestId(id).locator('.ProseMirror')).toBeVisible({
        timeout: 30_000,
      });
    }
  };

  for (const [id, erro] of [
    ['template', 'template-erro'],
    ['reactive', 'reactive-erro'],
  ] as const) {
    test(`${id}: texto além do limite mostra o erro de rteMaxChars (mensagem de formatRteError)`, async ({
      page,
    }) => {
      const problems = await watch(page);
      await open(page);
      const block = page.getByTestId(id);
      await expect(block.getByTestId(erro)).toHaveText('');
      await block
        .getByRole('button', { name: 'Preencher acima do limite' })
        .click();
      await expect(block.getByTestId(erro)).toContainText(
        'Use no máximo 60 caracteres',
      );
      // Voltar ao limite apaga o erro.
      await block.getByRole('button', { name: 'Esvaziar' }).click();
      await expect(block.getByTestId(erro)).not.toContainText('caracteres');
      expect(problems.messages).toEqual([]);
    });

    test(`${id}: campo vazio dispara rteRequired`, async ({ page }) => {
      await open(page);
      const block = page.getByTestId(id);
      await block.getByRole('button', { name: 'Esvaziar' }).click();
      await expect(block.getByTestId(erro)).toHaveText(
        'Este campo é obrigatório.',
      );
    });
  }

  test('[(value)] funciona nos dois sentidos: digitar atualiza o valor e "definir valor" atualiza o editor', async ({
    page,
  }) => {
    await open(page);
    const block = page.getByTestId('value');
    const area = block.locator('.ProseMirror');
    await area.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' mais');
    await expect(block.getByTestId('valor')).toContainText(
      'Sem formulário mais',
    );
    await block.getByRole('button', { name: 'Definir valor' }).click();
    await expect(area).toHaveText('Valor definido');
    await expect(block.getByTestId('valor')).toHaveText(
      '<p>Valor definido</p>',
    );
  });
});

test.describe('I7 barra-e-recursos', () => {
  test('trocar o preset recria o editor (@for/track) e muda os botões da barra', async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.goto(url(ORIGIN, 'guia/barra-e-recursos'));
    await ready(page);
    const live = page.locator('.doc-live');
    const area = live.locator('.ProseMirror');
    await expect(area).toBeVisible({ timeout: 30_000 });
    const buttons = live.locator('.rte-toolbar').getByRole('button');

    const counts: Record<string, number> = {};
    for (const preset of ['minimal', 'article', 'full']) {
      // Marca o editor atual: depois da troca o nó é outro (recriado).
      await area.evaluate((el) => el.setAttribute('data-marca', '1'));
      await live.locator(`[data-preset="${preset}"]`).click();
      await expect(live.locator('.ProseMirror[data-marca]')).toHaveCount(0);
      await expect(live.locator(`[data-preset="${preset}"]`)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(area).toBeVisible({ timeout: 30_000 });
      counts[preset] = await buttons.count();
    }
    expect(counts['minimal']).toBeLessThan(counts['article']!);
    expect(counts['article']).toBeLessThan(counts['full']!);
    // O valor sobrevive à recriação ([(value)]).
    await expect(area).toContainText('Troque o preset');
    expect(problems.messages).toEqual([]);
  });
});

test.describe('I7 idiomas', () => {
  test('pt-BR, en e es mudam o nome acessível de um botão sem recriar o editor (o nó .ProseMirror sobrevive)', async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.goto(url(ORIGIN, 'guia/idiomas'));
    await ready(page);
    const live = page.locator('.doc-live');
    const area = live.locator('.ProseMirror');
    await expect(area).toBeVisible({ timeout: 30_000 });
    await expect(live.getByRole('button', { name: 'Negrito' })).toBeVisible();
    await area.evaluate((el) => el.setAttribute('data-marca', '1'));

    for (const [lang, name] of [
      ['en', 'Bold'],
      ['es', 'Negrita'],
      ['pt-BR', 'Negrito'],
    ] as const) {
      await live.locator(`[data-lang="${lang}"]`).click();
      await expect(live.getByRole('button', { name })).toBeVisible();
    }
    // Nada foi recriado: o mesmo nó segue na página.
    await expect(live.locator('.ProseMirror[data-marca]')).toHaveCount(1);
    expect(problems.messages).toEqual([]);
  });
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
    await expect(links).toHaveText([
      'Primeiros passos',
      'Configuração',
      'Barra',
    ]);
    // Os títulos da exibição carregam os mesmos ids rt-<slug>.
    const article = live.getByTestId('artigo');
    await expect(article.locator('h2#rt-primeiros-passos')).toBeVisible();
    await expect(article.locator('h3#rt-barra')).toBeVisible();
    // O href resolve contra o endereço do documento, sob o prefixo de publicação (<base href>).
    expect(
      await links.nth(2).evaluate((a) => (a as HTMLAnchorElement).href),
    ).toBe(`${pageUrl}#rt-barra`);

    // Clicar na entrada rola até o título.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await links.nth(2).click();
    await expect(page).toHaveURL(`${pageUrl}#rt-barra`);
    await expect(article.locator('#rt-barra')).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    // Editar o título muda o id, e o sumário acompanha.
    const heading = live.locator('.ProseMirror h2', {
      hasText: 'Configuração',
    });
    await heading.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' extra');
    await expect(links.nth(1)).toHaveText('Configuração extra');
    await expect(links.nth(1)).toHaveAttribute(
      'href',
      /#rt-configuracao-extra$/,
    );
    await expect(article.locator('h2#rt-configuracao-extra')).toBeVisible();
    await expect(article.locator('#rt-configuracao')).toHaveCount(0);
    expect(problems.messages).toEqual([]);
  });
});
