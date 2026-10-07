import { expect, test, type Page } from '@playwright/test';
import {
  appUrl,
  editorHost,
  gotoApp,
  readFixture,
  settlePage,
  waitForEditor,
} from './helpers/app';

// N5 (spec 05a, R10 e R11): com `default-src 'self'; script-src 'self';
// style-src 'self'` por cabeçalho, carregar, hidratar, criar, editar,
// redimensionar a imagem e destruir não viola a CSP nem acrescenta `<style>`;
// o `editor.css` deixa o editor funcional (placeholder, alças, tarefas,
// tabelas, realce e foco) em claro e escuro.
//
// Exceção medida, só no Chromium: ler HTML com atributos `style` (a carga do
// valor; o Tiptap usa `DOMParser`) reporta `style-src-attr` `inline` por
// atributo, embora o documento do parser seja inerte e nada seja aplicado (o
// Chromium reporta em qualquer análise de HTML: `DOMParser`, `template`,
// `createHTMLDocument`). Firefox e WebKit não reportam. Nesse documento o
// Chromium deixa `element.style` vazio: o core lê o **atributo** `style`
// (`getAttribute('style')`, inclusive o `text-align`, que o Tiptap leria do
// CSSOM e perderia), o conteúdo chega inteiro ao documento do editor (o teste
// compara o `getRteHtml` do editor vivo com o fixture) e o editor desenha os
// estilos pelo CSSOM, permitido pela CSP.

/**
 * Hosts dos `iframe` de terceiros do fixture: a CSP do app (só `'self'`)
 * barra esses quadros por escolha do integrador, não por algo do editor.
 */
const EMBED_HOSTS = [
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'open.spotify.com',
];

/** Cor computada de `--rte-code-keyword` no tema padrão (static-tokens.ts). */
const KEYWORD = {
  light: 'rgb(107, 33, 168)',
  dark: 'rgb(210, 168, 255)',
} as const;

/**
 * O `all-features.html` com as mídias de `example.com` trocadas por recursos
 * do mesmo origin (o PNG do app ou 404): a CSP só aceita `'self'` e a imagem
 * precisa carregar para ter alças e tamanho.
 */
function sameOriginFixture(): string {
  return readFixture('all-features.html')
    .replace(/https:\/\/example\.com\/[\w./-]+\.(?:jpg|png)/g, '/e2e.png')
    .replaceAll('/img/b.png', '/e2e.png')
    .replaceAll('https://example.com/', '/missing/');
}

/** Violações desde a última leitura (a lista é esvaziada), sem os quadros de terceiros. */
async function takeViolations(page: Page) {
  await settlePage(page);
  const all = await page.evaluate(() => window.__violations.splice(0));
  return all.filter(
    (v) =>
      !(
        /^(?:frame-src|child-src|default-src)$/.test(v.directive) &&
        EMBED_HOSTS.some((host) => v.blockedURI.includes(host))
      ),
  );
}

async function styleCountInRawHtml(page: Page, url: string): Promise<number> {
  const raw = await (await page.request.get(url)).text();
  return (raw.match(/<style[\s>]/g) ?? []).length;
}

for (const scheme of ['light', 'dark'] as const) {
  test(`N5 (${scheme}): CSP estrita sem violações e editor.css funcional`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: scheme });
    const stylesBefore = await styleCountInRawHtml(page, appUrl('/content'));
    await gotoApp(page, '/content');
    const host = editorHost(page, 'content');
    await waitForEditor(page, 'content');
    const editable = host.locator('.ProseMirror');
    await expect(editable).toHaveClass(/\brte-content\b/);

    // Placeholder visível no editor vazio (D17).
    const placeholder = editable.locator('.rte-placeholder');
    await expect(placeholder).toHaveCount(1);
    expect(
      await placeholder.evaluate((p) => {
        const before = getComputedStyle(p, '::before');
        return { content: before.content, display: before.display };
      }),
    ).toEqual({ content: '"Write here"', display: 'block' });

    // Carregar, hidratar e criar (documento vazio): nenhuma violação.
    expect(await takeViolations(page)).toEqual([]);

    // Carregar o all-features (carga externa, D9).
    const fixture = sameOriginFixture();
    await page.evaluate(
      (html) => window.rteE2e.setValue('content', html),
      fixture,
    );
    await expect(editable.locator('table')).toHaveCount(1);
    // O conteúdo chega íntegro ao **documento** do editor (não ao modelo da
    // página, que a carga externa não reescreve): o `all-features.html` é
    // ponto fixo do `getRteHtml`, então o HTML do editor vivo é o próprio
    // fixture, com todo atributo `style` (alinhamento, cores, larguras,
    // proporções) intacto, inclusive no Chromium que relata a CSP.
    const live = await host.evaluate((root) => window.rteE2e.rteHtml(root));
    expect(live).toBe(fixture);
    const styles = (html: string) =>
      (html.match(/ style="[^"]*"/g) ?? []).sort();
    expect(styles(live ?? '')).toEqual(styles(fixture));
    expect(styles(fixture).length).toBeGreaterThan(20);
    for (const align of ['center', 'justify', 'left', 'right'])
      expect(live).toContain(`style="text-align: ${align}"`);
    // E o desenho segue o atributo (CSSOM, permitido pela CSP).
    expect(
      await editable
        .locator('p', { hasText: 'Parágrafo justificado.' })
        .evaluate((p) => getComputedStyle(p).textAlign),
    ).toBe('justify');
    const onLoad = await takeViolations(page);
    if (browserName === 'chromium') {
      const styleAttrs = (fixture.match(/ style="/g) ?? []).length;
      expect(onLoad.length).toBeGreaterThan(0);
      expect(onLoad.length).toBeLessThanOrEqual(styleAttrs);
      expect(
        onLoad.filter(
          (v) => v.directive !== 'style-src-attr' || v.blockedURI !== 'inline',
        ),
      ).toEqual([]);
    } else {
      expect(onLoad).toEqual([]);
    }

    // Editar com o teclado real.
    await editable.locator('p', { hasText: 'Parágrafo justificado.' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' ok');
    await expect
      .poll(() => page.evaluate(() => window.rteE2e.value('content')))
      .toContain('Parágrafo justificado. ok</p>');

    // Imagem: alças só com a seleção, `touch-action: none`, arrasto redimensiona.
    const img = editable.locator('img[alt="Foto C"]');
    const figure = editable.locator('figure.rt-figure', {
      has: page.locator('img[alt="Foto C"]'),
    });
    const handle = figure.locator('.rte-image__handle--se');
    await img.scrollIntoViewIfNeeded();
    await expect(handle).toBeHidden();
    await img.click();
    await expect(figure).toHaveClass(/\brte-image--selected\b/);
    await expect(handle).toBeVisible();
    expect(await handle.evaluate((h) => getComputedStyle(h).touchAction)).toBe(
      'none',
    );
    const widthBefore = await img.getAttribute('width');
    const box = await handle.boundingBox();
    if (!box) throw new Error('alça sem caixa');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y - 30, { steps: 5 });
    await page.mouse.move(x - 80, y - 60, { steps: 5 });
    await page.mouse.up();
    await expect(img).not.toHaveAttribute('width', widthBefore ?? '');
    const widthAfter = Number(await img.getAttribute('width'));
    expect(widthAfter).toBeLessThan(Number(widthBefore));

    // Tarefa: o checkbox (fora da área editável) alterna `data-checked`.
    const task = editable.locator('li.rt-task').first();
    await expect(task).toHaveAttribute('data-checked', 'true');
    await task.locator('input[type="checkbox"]').click();
    await expect(task).toHaveAttribute('data-checked', 'false');

    // Tabela: alça de coluna ao passar o mouse na borda da célula.
    const th = editable.locator('th').first();
    await th.scrollIntoViewIfNeeded();
    const cell = await th.boundingBox();
    if (!cell) throw new Error('célula sem caixa');
    await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2);
    await page.mouse.move(cell.x + cell.width - 2, cell.y + cell.height / 2, {
      steps: 3,
    });
    // Uma alça por célula da coluna (a borda da 1ª coluna atravessa as linhas).
    const resize = editable.locator('.column-resize-handle').first();
    await expect(resize).toBeAttached();
    expect(await resize.evaluate((h) => getComputedStyle(h).position)).toBe(
      'absolute',
    );

    // Realce: a cor de `hljs-keyword` é a de `--rte-code-keyword` no `.rte-root`.
    await expect(editable.locator('.hljs-keyword').first()).toBeAttached();
    const colors = await host.evaluate((root) => {
      const keyword = root.querySelector('.hljs-keyword') as Element;
      // CSSOM (permitido pela CSP), não atributo `style`.
      const probe = document.createElement('span');
      probe.style.color = 'var(--rte-code-keyword)';
      root.appendChild(probe);
      const out = {
        keyword: getComputedStyle(keyword).color,
        token: getComputedStyle(probe).color,
      };
      probe.remove();
      return out;
    });
    expect(colors.keyword).toBe(colors.token);
    expect(colors.keyword).toBe(KEYWORD[scheme]);

    // Foco visível pelo teclado: `outline-width` = `--rte-focus-width`.
    await page.locator('#nav-perf').focus();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      if (await editable.evaluate((e) => e === document.activeElement)) break;
    }
    await expect(editable).toBeFocused();
    const focus = await editable.evaluate((e) => {
      const s = getComputedStyle(e);
      return {
        width: s.outlineWidth,
        style: s.outlineStyle,
        token: s.getPropertyValue('--rte-focus-width').trim(),
      };
    });
    expect(focus.style).toBe('solid');
    expect(focus.width).toBe(focus.token);
    expect(focus.width).toBe('2px');

    // Destruir: navegar para `/` (sem editor) pelo roteador.
    await page.locator('#nav-home').click();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.ProseMirror')).toHaveCount(0);
    expect(await page.evaluate(() => window.rteE2e.readyAt.content)).toEqual(
      expect.any(Number),
    );

    // Editar, redimensionar, alternar a tarefa, focar e destruir: nenhuma.
    expect(await takeViolations(page)).toEqual([]);
    expect(await page.evaluate(() => window.__styleAdds)).toEqual([]);
    expect(
      await page.evaluate(() => document.querySelectorAll('style').length),
    ).toBe(stylesBefore);

    // Controle: um atributo `style` É barrado por esta CSP e chega ao coletor;
    // sem isto o "nenhuma violação" acima não provaria nada.
    await page.evaluate(() =>
      document.querySelector('h1')?.setAttribute('style', 'color: red'),
    );
    await expect
      .poll(async () => (await takeViolations(page)).length)
      .toBeGreaterThan(0);
  });
}

test('N5 (build zone): carregar, hidratar, criar, editar e destruir sem violações', async ({
  page,
}) => {
  await gotoApp(page, '/content', { zone: true });
  await waitForEditor(page, 'content');
  const editable = editorHost(page, 'content').locator('.ProseMirror');
  await editable.click();
  await page.keyboard.type('zone');
  await expect
    .poll(() => page.evaluate(() => window.rteE2e.value('content')))
    .toBe('<p>zone</p>');
  await page.locator('#nav-home').click();
  await expect(page.locator('.ProseMirror')).toHaveCount(0);
  expect(await takeViolations(page)).toEqual([]);
  expect(await page.evaluate(() => window.__styleAdds)).toEqual([]);
});

/** Editores de cada rota do app (smoke dos dois builds). */
const ROUTES = [
  { path: '/forms', ids: ['signal', 'reactive', 'plain'] },
  { path: '/labels', ids: ['labels'] },
  { path: '/lifecycle', ids: ['lifecycle'] },
  { path: '/perf', ids: ['perf'] },
] as const;

for (const zone of [false, true]) {
  test(`app de teste (${zone ? 'zone' : 'zoneless'}): toda rota hidrata e cria os editores sem violações nem erros`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    for (const route of ROUTES) {
      await gotoApp(page, route.path, { zone });
      for (const id of route.ids) await waitForEditor(page, id);
      // Sem imports pendentes ao sair (um import abortado pela navegação vira
      // erro de console no WebKit).
      await page.waitForLoadState('networkidle');
      expect(await takeViolations(page)).toEqual([]);
      expect(await page.evaluate(() => window.__styleAdds)).toEqual([]);
    }
    // A ponte lê e escreve os modelos dos três formulários.
    await gotoApp(page, '/forms', { zone });
    await waitForEditor(page, 'signal');
    for (const id of ['signal', 'reactive', 'plain'] as const) {
      await page.evaluate((i) => window.rteE2e.setValue(i, '<p>x</p>'), id);
      await expect
        .poll(() =>
          page.evaluate(
            (i) =>
              window.rteE2e
                .getRteEditor(
                  document.querySelector(`rte-editor[data-testid="${i}"]`)!,
                )
                ?.getText(),
            id,
          ),
        )
        .toBe('x');
      expect(await page.evaluate((i) => window.rteE2e.value(i), id)).toBe(
        '<p>x</p>',
      );
    }
    expect(await page.evaluate(() => window.rteE2e.state('signal'))).toEqual({
      valid: true,
      touched: false,
      dirty: false,
      errors: [],
    });
    expect(errors).toEqual([]);
  });
}
