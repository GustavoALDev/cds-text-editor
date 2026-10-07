import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  appUrl,
  collectConsole,
  editableOf,
  gotoApp,
  settlePage,
  waitForEditor,
} from './helpers/app';
import { contrastRatio, effectiveBackground, toRgb } from './helpers/contrast';
import {
  cancelDialog,
  dialogField,
  dialogsChunk,
  openDialogFrom,
  openDialogOf,
  submitDialog,
  type DialogKind,
} from './helpers/dialogs';
import { expectFloating, floatingItem, floatingMenu } from './helpers/floating';
import { routeMedia, selectMediaByClick } from './helpers/media';
import { selectIn } from './helpers/toolbar';

// N31 (spec 05c1, R10-R13): acessibilidade, tema, CSP, SSR e *chunk* dos
// diálogos e menus de mídia — axe por diálogo (sem erro, com erro, vídeo com 3
// faixas) e por menu de vídeo e *embed*, em claro, escuro e `forced-colors`
// (emulação antes da carga, como no N14); nomes acessíveis do diálogo e de cada
// `<fieldset>`; contraste de rótulos, dicas e erros; alvos >= 24 x 24; idioma
// ao vivo com o diálogo de vídeo aberto; 0 violações de CSP em todas as fases;
// HTML do servidor sem `<dialog>`/`.rte-floating`; console sem `NG05xx`; os
// formulários de mídia no mesmo *chunk* `rte-dialogs`; e, no build zone, o
// custo em turnos da zona de 20 teclas (Ruling 3). Rota `media` com CSP
// própria: abrir `/media` direto.

const ID = 'media';
const BASE_TEXT = ['Mídia', 5] as const;

async function severe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
}

/**
 * Contraste de rótulos, legendas, dicas, erros e URL somente leitura sobre o
 * fundo efetivo (`effectiveBackground`; cada texto marcado com um atributo
 * temporário para o seletor).
 */
async function textContrasts(page: Page, dialog: Locator) {
  const MARK = 'data-n31-contrast';
  const texts = await dialog.evaluate(
    (d, mark) =>
      [
        ...d.querySelectorAll(
          '.rte-dialog__title, .rte-dialog__label, .rte-dialog__legend, .rte-dialog__hint, .rte-dialog__error, .rte-dialog__readonly',
        ),
      ].map((el, i) => {
        el.setAttribute(mark, String(i));
        return {
          text: (el.textContent ?? '').trim().slice(0, 30),
          fg: getComputedStyle(el).color,
        };
      }),
    MARK,
  );
  const out: { text: string; ratio: number }[] = [];
  try {
    for (const [i, { text, fg }] of texts.entries()) {
      const bg = await effectiveBackground(page, `[${MARK}="${i}"]`);
      const ratio = contrastRatio(await toRgb(page, fg), bg);
      out.push({ text, ratio: Math.round(ratio * 100) / 100 });
    }
  } finally {
    await dialog.evaluate(
      (d, mark) =>
        d
          .querySelectorAll(`[${mark}]`)
          .forEach((el) => el.removeAttribute(mark)),
      MARK,
    );
  }
  return out;
}

/** Controles do diálogo menores que 24 x 24 (caixas de marcar pelo rótulo). */
function smallTargets(dialog: Locator) {
  return dialog.locator('input, select, button').evaluateAll((els) =>
    els
      .map((el) => {
        const input = el as HTMLInputElement;
        // A caixa de marcar é alvo junto do rótulo (WCAG 2.5.8 aceita o
        // rótulo clicável): mede o maior entre ela e o rótulo.
        const label = input.labels?.[0]?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const width = Math.max(r.width, label?.width ?? 0);
        const height = Math.max(r.height, label?.height ?? 0);
        return { name: `${el.tagName}.${el.className}`, width, height };
      })
      .filter((s) => s.width < 24 || s.height < 24),
  );
}

/** Axe, alvos e (fora do forced-colors) contraste do diálogo aberto. */
async function checkDialog(
  page: Page,
  dialog: Locator,
  title: string,
  what: string,
  scheme: string,
): Promise<void> {
  await expect(dialog).toHaveAccessibleName(title);
  expect(await severe(page), `${what}: axe`).toEqual([]);
  expect(await smallTargets(dialog), `${what}: alvos`).toEqual([]);
  if (scheme !== 'forced') {
    const low = (await textContrasts(page, dialog)).filter(
      (r) => r.ratio < 4.5,
    );
    expect(low, `${what}: contraste < 4,5`).toEqual([]);
  }
}

/** Abre o diálogo de inserção `kind` com o cursor no fim do primeiro parágrafo. */
async function openInsert(page: Page, kind: DialogKind): Promise<Locator> {
  await selectIn(page, ID, ...BASE_TEXT);
  return openDialogFrom(page, ID, 'toolbar', kind);
}

/** Um clique num parágrafo separa dois cliques de mídia seguidos. */
async function pick(page: Page, kind: 'image' | 'video' | 'embed') {
  await editableOf(page, ID).locator('p').first().click();
  await selectMediaByClick(page, ID, kind);
  await expectFloating(page, ID, kind);
}

async function submitInvalid(dialog: Locator): Promise<void> {
  await submitDialog(dialog);
  await expect(dialog.locator('.rte-dialog__error').first()).toBeVisible();
}

async function addTracks(dialog: Locator, total: number): Promise<void> {
  const add = dialog.getByRole('button', { name: 'Add track' });
  const fieldsets = dialog.locator('fieldset.rte-dialog__fieldset');
  while ((await fieldsets.count()) < total) {
    const before = await fieldsets.count();
    await add.click();
    await expect(fieldsets).toHaveCount(before + 1);
  }
  for (let n = 1; n <= total; n++) {
    await expect(fieldsets.nth(n - 1)).toHaveAccessibleName(`Track ${n}`);
  }
}

for (const scheme of ['light', 'dark', 'forced'] as const) {
  test(`N31 (${scheme}): diálogos de mídia (sem erro, com erro, vídeo com 3 faixas) e menus de vídeo e embed: axe, nomes, contraste e alvos`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(300_000);
    await routeMedia(page.context());
    if (scheme === 'forced') {
      await page.emulateMedia({ forcedColors: 'active' });
    } else {
      await page.emulateMedia({ colorScheme: scheme });
    }
    // Firefox não reavalia @media de folhas já carregadas ao mudar a
    // emulação: a emulação vem antes da carga (como no N14).
    await gotoApp(page, '/media');
    await waitForEditor(page, ID);
    await expect(editableOf(page, ID).locator('video')).toHaveCount(1);
    if (scheme === 'forced') {
      const active = await page.evaluate(
        () => matchMedia('(forced-colors: active)').matches,
      );
      if (browserName === 'chromium') expect(active).toBe(true);
      test.skip(
        !active,
        `${browserName}: emulateMedia({forcedColors}) não ativa (forced-colors: active) neste motor`,
      );
    }

    // Imagem: sem erro e com erro.
    let dialog = await openInsert(page, 'image');
    await checkDialog(page, dialog, 'Insert image', 'imagem', scheme);
    await submitInvalid(dialog);
    await checkDialog(page, dialog, 'Insert image', 'imagem com erro', scheme);
    const errorId = await dialog
      .locator('.rte-dialog__error')
      .first()
      .getAttribute('id');
    await expect(
      dialog.locator('[aria-invalid="true"]').first(),
    ).toHaveAttribute('aria-describedby', new RegExp(`\\b${errorId}\\b`));
    await cancelDialog(dialog);
    await expect(openDialogOf(page, ID)).toHaveCount(0);

    // Vídeo: sem erro, com erro, com 3 faixas (e com erro nas faixas).
    dialog = await openInsert(page, 'video');
    await checkDialog(page, dialog, 'Insert video', 'vídeo', scheme);
    await submitInvalid(dialog);
    await checkDialog(page, dialog, 'Insert video', 'vídeo com erro', scheme);
    await addTracks(dialog, 3);
    await checkDialog(
      page,
      dialog,
      'Insert video',
      'vídeo com 3 faixas',
      scheme,
    );
    await submitInvalid(dialog);
    await checkDialog(
      page,
      dialog,
      'Insert video',
      'vídeo com 3 faixas e erros',
      scheme,
    );
    await cancelDialog(dialog);
    await expect(openDialogOf(page, ID)).toHaveCount(0);

    // Embed: sem erro e com erro (recusa de outro endereço).
    dialog = await openInsert(page, 'embed');
    await checkDialog(page, dialog, 'Insert embedded content', 'embed', scheme);
    await dialogField(dialog, 'Page address (URL)').fill(
      'https://example.com/x',
    );
    await submitInvalid(dialog);
    await checkDialog(
      page,
      dialog,
      'Insert embedded content',
      'embed com erro',
      scheme,
    );
    await cancelDialog(dialog);
    await expect(openDialogOf(page, ID)).toHaveCount(0);

    // Menus de vídeo e embed visíveis, e os diálogos de edição pelo "Detalhes".
    await pick(page, 'video');
    expect(await severe(page), 'menu de vídeo').toEqual([]);
    const videoMenu = floatingMenu(page, ID, 'video');
    await expect(videoMenu).toHaveAccessibleName('Video');
    await floatingItem(videoMenu, 'Video details…').click();
    dialog = openDialogOf(page, ID);
    await expect(dialog).toBeVisible();
    await addTracks(dialog, 3);
    await checkDialog(
      page,
      dialog,
      'Video details',
      'editar vídeo, 3 faixas',
      scheme,
    );
    await cancelDialog(dialog);
    await expect(openDialogOf(page, ID)).toHaveCount(0);

    await pick(page, 'embed');
    expect(await severe(page), 'menu de embed').toEqual([]);
    const embedMenu = floatingMenu(page, ID, 'embed');
    await expect(embedMenu).toHaveAccessibleName('Embedded content');
    await floatingItem(embedMenu, 'Embedded content details…').click();
    dialog = openDialogOf(page, ID);
    await expect(dialog).toBeVisible();
    await checkDialog(
      page,
      dialog,
      'Embedded content details',
      'editar embed',
      scheme,
    );
    await cancelDialog(dialog);

    await pick(page, 'image');
    await floatingItem(
      floatingMenu(page, ID, 'image'),
      'Image details…',
    ).click();
    dialog = openDialogOf(page, ID);
    await expect(dialog).toBeVisible();
    await checkDialog(page, dialog, 'Image details', 'editar imagem', scheme);
    await cancelDialog(dialog);
  });
}

test('N31 (R12): contraste dos menus de vídeo e embed sobre o fundo efetivo (claro e escuro)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await routeMedia(page.context());
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await gotoApp(page, '/media');
    await waitForEditor(page, ID);
    await expect(editableOf(page, ID).locator('video')).toHaveCount(1);
    for (const kind of ['video', 'embed'] as const) {
      await pick(page, kind);
      const selector = `rte-editor[data-testid="${ID}"] .rte-floating--${kind}`;
      const bg = await effectiveBackground(page, selector);
      const items = await floatingMenu(page, ID, kind)
        .locator('button, a')
        .evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
      expect(items.length).toBeGreaterThan(0);
      for (const fg of items) {
        expect(
          contrastRatio(await toRgb(page, fg), bg),
          `${kind} (${scheme})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

test('N31 (R16): idioma ao vivo com o diálogo de vídeo aberto, com faixas e erro visível', async ({
  page,
}) => {
  await routeMedia(page.context());
  await gotoApp(page, '/media');
  await waitForEditor(page, ID);
  const dialog = await openInsert(page, 'video');
  await dialogField(dialog, 'Video address (URL)').fill('/e2e.webm');
  await addTracks(dialog, 2);
  await submitInvalid(dialog);
  await expect(dialog).toHaveAccessibleName('Insert video');

  await page.evaluate(() => window.rteE2e.setLang('pt-BR'));
  await expect(dialog).toHaveAccessibleName('Inserir vídeo');
  await expect(dialog.locator('.rte-dialog__title')).toHaveText(
    'Inserir vídeo',
  );
  const fieldsets = dialog.locator('fieldset.rte-dialog__fieldset');
  await expect(fieldsets.nth(0)).toHaveAccessibleName('Faixa 1');
  await expect(fieldsets.nth(1)).toHaveAccessibleName('Faixa 2');
  await expect(dialogField(dialog, 'Endereço do vídeo (URL)')).toHaveValue(
    '/e2e.webm',
  );
  await expect(
    dialog.getByRole('button', { name: 'Remover faixa 2' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Acrescentar faixa' }),
  ).toBeVisible();
  await expect(dialog.locator('.rte-dialog__error').first()).toHaveText(
    'Preencha este campo.',
  );
  await expect(dialog).toBeVisible();

  await page.evaluate(() => window.rteE2e.setLang('en'));
  await expect(dialog).toHaveAccessibleName('Insert video');
  await expect(fieldsets.nth(1)).toHaveAccessibleName('Track 2');
  await expect(dialogField(dialog, 'Video address (URL)')).toHaveValue(
    '/e2e.webm',
  );
});

for (const zone of [false, true]) {
  test.describe(`N31 (${zone ? 'zone' : 'zoneless'})`, () => {
    test('SSR sem <dialog> nem .rte-floating; formulários de mídia no mesmo chunk do rte-dialogs, menus em outro; console sem NG05', async ({
      page,
      request,
    }) => {
      test.setTimeout(90_000);
      const raw = await (await request.get(appUrl('/media', { zone }))).text();
      expect(raw).toContain('data-testid="media"');
      expect(raw).not.toContain('<dialog');
      expect(raw).not.toContain('rte-floating');
      expect(raw).not.toContain('rte-dialog');

      await routeMedia(page.context());
      const messages = collectConsole(page);
      const scripts: string[] = [];
      page.on('requestfinished', (r) => {
        if (/\.js$/.test(new URL(r.url()).pathname)) scripts.push(r.url());
      });
      const chunk = await dialogsChunk(page);
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, ID);
      await chunk.requested;
      await expect.poll(() => scripts.length).toBeGreaterThan(0);
      // O chunk dos menus só chega com a primeira mídia selecionada.
      await expect(editableOf(page, ID).locator('video')).toHaveCount(1);
      await pick(page, 'video');
      await settlePage(page);

      const holders: Record<string, string[]> = {
        'rte-image-form': [],
        'rte-video-form': [],
        'rte-embed-form': [],
        'rte-dialog__form': [],
        'rte-floating__address': [],
      };
      for (const url of new Set(scripts)) {
        const body = await (await request.get(url)).text();
        for (const [marker, files] of Object.entries(holders)) {
          if (body.includes(marker)) files.push(url);
        }
      }
      // Os três formulários de mídia e o dos outros diálogos: um só arquivo.
      const dialogsFile = holders['rte-dialog__form'] ?? [];
      expect(dialogsFile).toHaveLength(1);
      expect(chunk.url).toBe(dialogsFile[0]);
      for (const marker of [
        'rte-image-form',
        'rte-video-form',
        'rte-embed-form',
      ]) {
        expect(holders[marker], marker).toEqual(dialogsFile);
      }
      // Os menus de vídeo e embed ficam em outro arquivo (o dos menus).
      const menusFile = holders['rte-floating__address'] ?? [];
      expect(menusFile).toHaveLength(1);
      expect(menusFile).not.toEqual(dialogsFile);
      expect(messages.filter((m) => m.includes('NG05'))).toEqual([]);
    });

    test('CSP: 0 violações ao carregar o chunk, abrir, validar, aplicar, cancelar e remover cada diálogo e menu', async ({
      page,
      browserName,
    }) => {
      test.setTimeout(180_000);
      await routeMedia(page.context());
      const chunk = await dialogsChunk(page);
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, ID);
      await chunk.requested;
      await expect(editableOf(page, ID).locator('video')).toHaveCount(1);
      await settlePage(page);
      // Ruling 28 do ADR 0007: só na fase de carga, só `style-src-attr` no Chromium.
      const load = await page.evaluate(() => window.__violations.splice(0));
      expect(
        load.filter(
          (v) =>
            !(browserName === 'chromium' && v.directive === 'style-src-attr'),
        ),
      ).toEqual([]);
      const none = async (phase: string) => {
        await settlePage(page);
        expect(await page.evaluate(() => window.__violations), phase).toEqual(
          [],
        );
      };

      // Imagem: cancelar (Escape), validar, aplicar, editar e remover.
      let dialog = await openInsert(page, 'image');
      await page.keyboard.press('Escape');
      await expect(openDialogOf(page, ID)).toHaveCount(0);
      await none('imagem: cancelar');
      dialog = await openInsert(page, 'image');
      await submitInvalid(dialog);
      await dialogField(dialog, 'Image address (URL)').fill('/e2e.png');
      await dialogField(dialog, 'Alternative text').fill('Outra imagem');
      await submitDialog(dialog);
      await expect(openDialogOf(page, ID)).toHaveCount(0);
      await none('imagem: aplicar');
      await expectFloating(page, ID, 'image');
      await floatingItem(
        floatingMenu(page, ID, 'image'),
        'Image details…',
      ).click();
      dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      await dialog.locator('.rte-dialog__remove').click();
      await expect(openDialogOf(page, ID)).toHaveCount(0);
      await none('imagem: remover');

      // Vídeo: validar, aplicar, menu, detalhes (cancelar) e remover pelo menu.
      dialog = await openInsert(page, 'video');
      await submitInvalid(dialog);
      await addTracks(dialog, 1);
      await cancelDialog(dialog);
      await none('vídeo: validar e cancelar');
      dialog = await openInsert(page, 'video');
      await dialogField(dialog, 'Video address (URL)').fill('/e2e.webm');
      await submitDialog(dialog);
      await expect(openDialogOf(page, ID)).toHaveCount(0);
      await none('vídeo: aplicar');
      await expectFloating(page, ID, 'video');
      await floatingItem(
        floatingMenu(page, ID, 'video'),
        'Video details…',
      ).click();
      dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      await cancelDialog(dialog);
      await expectFloating(page, ID, 'video');
      await floatingItem(
        floatingMenu(page, ID, 'video'),
        'Remove video',
      ).click();
      await none('vídeo: remover');

      // Embed: validar, aplicar, menu, detalhes (cancelar) e remover.
      dialog = await openInsert(page, 'embed');
      await dialogField(dialog, 'Page address (URL)').fill(
        'https://example.com/x',
      );
      await submitInvalid(dialog);
      await dialogField(dialog, 'Page address (URL)').fill(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
      await submitDialog(dialog);
      await expect(openDialogOf(page, ID)).toHaveCount(0);
      await none('embed: aplicar');
      await expectFloating(page, ID, 'embed');
      await floatingItem(
        floatingMenu(page, ID, 'embed'),
        'Embedded content details…',
      ).click();
      dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      await cancelDialog(dialog);
      await expectFloating(page, ID, 'embed');
      await floatingItem(
        floatingMenu(page, ID, 'embed'),
        'Remove embedded content',
      ).click();
      await none('embed: remover');
    });
  });
}

test('N31 (R13, zone): cada uma de 20 teclas num parágrafo com mídia custa um turno da zona (mediana), como sem mídia, e sem mediaChange', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await routeMedia(page.context());
  await gotoApp(page, '/media', { zone: true });
  await waitForEditor(page, ID);
  await expect(editableOf(page, ID).locator('video')).toHaveCount(1);

  /**
   * Turnos da zona de cada uma de 20 teclas, uma por vez (com a página
   * assentada entre elas): cada tecla vira uma transação e um `value` (D8),
   * um turno. Teclas em rajada se juntam no observador de DOM do ProseMirror
   * (11 a 14 transações por 20 teclas, variando entre lotes iguais), e o
   * total não serve de guarda; por tecla, a mediana é estável.
   */
  const perKey = async (text: string): Promise<number[]> => {
    await selectIn(page, ID, text, text.length);
    // O vídeo e as imagens ainda podem estar entregando eventos: assenta.
    await settlePage(page);
    const changes = await page.evaluate(() =>
      window.rteE2e.mediaChanges('media'),
    );
    const turns: number[] = [];
    for (let i = 0; i < 20; i++) {
      const before = await page.evaluate(() => window.rteE2e.zoneTurns());
      await page.keyboard.press('x');
      await settlePage(page);
      const after = await page.evaluate(() => window.rteE2e.zoneTurns());
      turns.push(after - before);
    }
    expect(
      await page.evaluate(() => window.rteE2e.mediaChanges('media')),
      'sem mediaChange ao digitar',
    ).toBe(changes);
    return turns;
  };
  const median = (values: readonly number[]) => {
    const sorted = [...values].sort((x, y) => x - y);
    const mid = sorted.length >> 1;
    const at = (i: number) => sorted[i] ?? Number.NaN;
    return sorted.length % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2;
  };

  // Um `zone.run` do rastreador por tecla somaria um turno a cada tecla: a
  // mediana iria de 1 para 2.
  const withMedia = await perKey('Mídia');
  test.info().annotations.push({
    type: 'N31 zone',
    description: `turnos por tecla com mídia: ${withMedia.join(',')}`,
  });
  expect(median(withMedia)).toBe(1);

  // O mesmo editor, depois de uma carga sem mídia.
  await page.evaluate(() =>
    window.rteE2e.setValue('media', '<p>Mídia</p><p>Fim</p>'),
  );
  await expect(editableOf(page, ID).locator('img, video, iframe')).toHaveCount(
    0,
  );
  const without = await perKey('Mídia');
  test.info().annotations.push({
    type: 'N31 zone',
    description: `turnos por tecla sem mídia: ${without.join(',')}`,
  });
  expect(median(without)).toBe(1);
});
