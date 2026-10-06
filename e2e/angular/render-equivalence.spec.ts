// Spec 06, §6.2 L3 (H20; R9 e R5): o fixture `all-features` no editor (`/content`) e na rota
// `render` (diretiva, CSP estrita, depois da reaplicação da H8) têm os mesmos estilos computados
// (lista do N13 mais `text-align`, `width` de `col` e `aspect-ratio` de `iframe`) e a mesma
// largura/altura de cada bloco (±1 px), em claro e escuro, nos builds zoneless e zone.js.
//
// Exclusões (H20 e pré-voo 13 do plano), nenhuma delas medida aqui:
// - o que só existe na edição: alças da imagem, `tableWrapper` (a tabela conta, o invólucro
//   não; o rolador da exibição idem), placeholder e o DOM interno da tarefa (o `li.rt-task`
//   conta por estilo e por altura do `ul`; o `span.rte-task__check` × `label > input` não);
// - o realce do código (H15): os `span.hljs-*` do editor não são comparados (o `pre` sim);
// - a altura das tabelas largas (rolador): o fixture não tem nenhuma, e `collectBlocks` marca
//   `wide` para o caso de passar a ter.
// O título vazio (`h3#rt-section`) entra: o `content.css` dá uma linha a `p`/`h1`–`h6` vazios
// (`:empty`), a mesma altura do `br.ProseMirror-trailingBreak` do editor.
// Ruling 9 (spec 06): as tabelas **entram** na geometria (o pré-voo 13 as tirava).
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  editorHost,
  gotoApp,
  readFixture,
  settlePage,
  waitForEditor,
} from './helpers/app';
import {
  collectBlocks,
  collectStyles,
  CONTENT_PROPS,
  CONTENT_SELECTORS,
  equalizeContainer,
  firstColumnWidth,
  RENDER_EXTRA_SELECTORS,
  type ContentBlock,
  type ContentStyles,
} from './helpers/content-styles';
import { blockThirdParty, gotoRender, renderHost } from './helpers/render';

const E2E_PNG = resolve(__dirname, 'app/public/e2e.png');
const EDITOR_ROOT = 'rte-editor[data-testid="content"] .ProseMirror';
const RENDER_ROOT = '[data-testid="render-main"]';

interface Snapshot {
  styles: ContentStyles;
  extra: ContentStyles;
  blocks: ContentBlock[];
  firstColumn: number;
}

/**
 * Imagens com `loading="lazy"` só são pedidas perto da viewport, e a altura de uma imagem com
 * erro (a do fixture é 404 ou barrada pela CSP) muda quando o pedido termina: leva cada uma à
 * viewport e espera `complete` (no WebKit a figura centralizada variava entre as páginas).
 */
async function settleImages(page: Page, root: string): Promise<void> {
  const images = page.locator(`${root} img`);
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).complete))
      .toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** Estilos (N13 + extras da H8) e blocos do contêiner, depois de igualá-lo e da fonte. */
async function snapshot(page: Page, root: string): Promise<Snapshot> {
  await equalizeContainer(page, root);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await settleImages(page, root);
  await settlePage(page);
  const styles = await collectStyles(
    page,
    root,
    CONTENT_SELECTORS,
    CONTENT_PROPS,
  );
  const extra: ContentStyles = {};
  for (const [selector, props] of Object.entries(RENDER_EXTRA_SELECTORS)) {
    Object.assign(extra, await collectStyles(page, root, [selector], props));
  }
  return {
    styles,
    extra,
    blocks: await collectBlocks(page, root),
    firstColumn: await firstColumnWidth(page, root),
  };
}

/** Tabela de colunas largas (2 × 480 px): transborda o contêiner de 640 px nas duas páginas. */
const WIDE_COLS =
  '<table><colgroup><col style="width: 480px"><col style="width: 480px"></colgroup><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>';

/** Largura da tabela e da 1ª célula e se o invólucro (rolador ou `tableWrapper`) transborda. */
function measureTable(page: Page, root: string) {
  return page.evaluate((selector) => {
    const table = document.querySelector(`${selector} table`)!;
    const cell = table.querySelector('tr > :first-child')!;
    const wrapper = table.parentElement!;
    return {
      table: table.getBoundingClientRect().width,
      cell: cell.getBoundingClientRect().width,
      overflow: wrapper.scrollWidth > wrapper.clientWidth,
      wrapper: wrapper.className,
    };
  }, root);
}

async function editorSnapshot(page: Page, zone: boolean): Promise<Snapshot> {
  await gotoApp(page, '/content', { zone });
  await waitForEditor(page, 'content');
  await page.evaluate(
    (html) => window.rteE2e.setValue('content', html),
    readFixture('all-features.html'),
  );
  await expect(editorHost(page, 'content').locator('table')).toHaveCount(1);
  return snapshot(page, EDITOR_ROOT);
}

async function renderSnapshot(page: Page, zone: boolean): Promise<Snapshot> {
  await gotoRender(page, '/render', { zone });
  // A H8 já reaplicou os estilos do conteúdo.
  await expect(
    renderHost(page, 'render-main').locator('#rt-subtitulo'),
  ).toHaveCSS('text-align', 'center');
  return snapshot(page, RENDER_ROOT);
}

for (const zone of [false, true]) {
  const build = zone ? 'zone.js' : 'zoneless';

  for (const scheme of ['light', 'dark'] as const) {
    test(`L3 (${build}, ${scheme}): editor e rota render com os mesmos estilos e a mesma geometria`, async ({
      context,
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await blockThirdParty(context);
      // A única imagem do mesmo origin do fixture (`/img/b.png`, sem `width`/`height`) não existe
      // no app: o 404 deixava a figura centralizada com altura variável no WebKit (com ou sem o
      // ícone de imagem quebrada). Vira um PNG real (as de `example.com` ficam barradas pela
      // CSP e têm `width`/`height`).
      await context.route('**/img/b.png', (route) =>
        route.fulfill({ path: E2E_PNG, contentType: 'image/png' }),
      );
      await page.emulateMedia({ colorScheme: scheme });
      const editor = await editorSnapshot(page, zone);
      const render = await renderSnapshot(page, zone);

      // Estilos do N13.
      for (const selector of CONTENT_SELECTORS) {
        expect(
          editor.styles[selector]?.length,
          `${selector}: ocorrências`,
        ).toBeGreaterThan(0);
        expect
          .soft(render.styles[selector], selector)
          .toEqual(editor.styles[selector]);
      }

      // Estilos reaplicados pela H8, com os valores do HTML (R5).
      for (const selector of Object.keys(RENDER_EXTRA_SELECTORS)) {
        expect
          .soft(render.extra[selector], selector)
          .toEqual(editor.extra[selector]);
      }
      const values = (selector: string, prop: string) =>
        (render.extra[selector] ?? []).map((s) => s[prop]);
      expect(values('h2', 'text-align')).toEqual(['left', 'justify']);
      expect(values('h3', 'text-align')).toContain('center');
      expect(values('h4', 'text-align')).toEqual(['right']);
      expect(values('p', 'text-align')).toContain('justify');
      // O WebKit devolve `0px` no `width` computado de `col` (sem caixa): lá a largura vem da
      // geometria; nos outros, do estilo computado e da geometria.
      if (testInfo.project.name !== 'webkit')
        expect(values('col', 'width')[0]).toBe('200px');
      expect(Math.abs(render.firstColumn - 200)).toBeLessThanOrEqual(1);
      expect(Math.abs(editor.firstColumn - 200)).toBeLessThanOrEqual(1);
      expect(values('iframe', 'aspect-ratio').slice(0, 3)).toEqual([
        '16 / 9',
        '9 / 16',
        '16 / 9',
      ]);

      // Geometria de cada bloco (±1 px): largura, altura e distância ao topo do contêiner; a
      // altura de tabela larga fica fora (H20).
      expect(render.blocks.map((b) => b.tag)).toEqual(
        editor.blocks.map((b) => b.tag),
      );
      render.blocks.forEach((r, i) => {
        const e = editor.blocks[i];
        if (!e) return;
        const where = `bloco ${i} (${e.tag}${e.empty ? ', vazio' : ''})`;
        const near = (prop: 'width' | 'height' | 'top', label: string) =>
          expect
            .soft(
              Math.abs(r[prop] - e[prop]),
              `${where}: ${label} ${e[prop]} × ${r[prop]}`,
            )
            .toBeLessThanOrEqual(1);
        near('width', 'largura');
        near('top', 'topo');
        if (!e.wide && !r.wide) near('height', 'altura');
      });
      expect(render.blocks.some((b) => b.tag === 'table' && !b.wide)).toBe(
        true,
      );
      // O fixture tem um título vazio, e ele está na geometria.
      expect(render.blocks.filter((b) => b.empty).map((b) => b.tag)).toEqual([
        'h3',
      ]);
    });
  }

  test(`L3 (${build}): tabela de colunas largas com a dimensão da edição (H20, R6)`, async ({
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    await blockThirdParty(context);
    await gotoApp(page, '/content', { zone });
    await waitForEditor(page, 'content');
    await page.evaluate(
      (html) => window.rteE2e.setValue('content', html),
      WIDE_COLS,
    );
    await expect(editorHost(page, 'content').locator('table')).toHaveCount(1);
    await equalizeContainer(page, EDITOR_ROOT);
    const editor = await measureTable(page, EDITOR_ROOT);

    await gotoRender(page, '/render', { zone });
    await page.evaluate(
      (html) => window.rteE2e.setRenderInput(html),
      WIDE_COLS,
    );
    const input = '[data-testid="render-input"]';
    // A H20 já dimensionou a tabela (CSSOM; o computado tem a meia borda a mais).
    await expect
      .poll(() => page.locator(`${input} table`).evaluate((t) => t.style.width))
      .toBe('960px');
    await equalizeContainer(page, input);
    const render = await measureTable(page, input);

    const where = JSON.stringify({ editor, render });
    expect(Math.abs(editor.table - 960), where).toBeLessThanOrEqual(1);
    expect(Math.abs(render.table - editor.table), where).toBeLessThanOrEqual(1);
    expect(Math.abs(render.cell - editor.cell), where).toBeLessThanOrEqual(1);
    expect(Math.abs(render.cell - 480), where).toBeLessThanOrEqual(1);
    expect(editor.overflow, where).toBe(true);
    expect(render.overflow, where).toBe(true);
  });

  test(`L3 R9 (${build}): video e iframe recebem o clique na rota render`, async ({
    context,
    page,
  }) => {
    await blockThirdParty(context);
    await gotoRender(page, '/render', { zone });
    const media = renderHost(page, 'render-main').locator('video, iframe');
    expect(await media.count()).toBe(5);
    for (const el of await media.all()) {
      await el.scrollIntoViewIfNeeded();
      const hit = await el.evaluate((target) => {
        const r = target.getBoundingClientRect();
        const at = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return {
          self: at === target,
          pointerEvents: getComputedStyle(target).pointerEvents,
        };
      });
      expect(hit.self).toBe(true);
      expect(hit.pointerEvents).not.toBe('none');
    }
  });
}
