import { expect, test, type Locator, type Page } from '@playwright/test';
import { editableOf, gotoApp, waitForEditor } from './helpers/app';
import {
  dialogField,
  openDialogFrom,
  openDialogOf,
  submitDialog,
} from './helpers/dialogs';
import { expectFloating, floatingItem, floatingMenu } from './helpers/floating';
import { routeMedia, selectMediaByClick } from './helpers/media';
import { loadDoc, rteHtml, selectIn } from './helpers/toolbar';

// N28 (spec 05c1, R4/R5): o diálogo de vídeo (poster e faixas, acrescentadas e
// removidas pelo teclado com o foco conferido em cada passo) e o de *embed*
// (YouTube, Vimeo e Spotify; recusa de outro endereço; legenda editada pelo
// "Details…" com a URL somente leitura), nos 3 motores. `e2e.webm` é VP8 (o
// WebKit não o decodifica), mas os 3 motores criam `textTracks` e carregam a
// *cue* do `.vtt` com `mode = 'hidden'` (Ruling 6 do ADR 0011).

const ID = 'media';
/** Janela do ProseMirror para agrupar passos de desfazer (newGroupDelay 500 ms). */
const UNDO_GROUP_MS = 600;
const BASE = '<p>Início</p><p>Fim</p>';

const TRACK_ERROR_URL =
  'Address not accepted. Use https:// or a path starting with /, on an allowed host.';
const LANG_ERROR = 'Invalid code. Use a BCP 47 tag such as pt-BR.';
const REQUIRED = 'Fill in this field.';

const YOUTUBE =
  '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" width="560" height="315" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe></figure>';

const EMBEDS = [
  {
    name: 'YouTube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  },
  {
    name: 'Vimeo',
    url: 'https://vimeo.com/76979871',
    src: 'https://player.vimeo.com/video/76979871',
  },
  {
    name: 'Spotify',
    url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
  },
] as const;

/**
 * `Tab` real depois de assentar dois quadros: no WebKit o `Tab` enviado logo
 * depois de o foco chegar a um `<select>` (movido por `afterNextRender`) às
 * vezes não sai dele.
 */
async function tab(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.keyboard.press('Tab');
}

for (const zone of [false, true]) {
  test.describe(`N28${zone ? ' (zone.js)' : ''}`, () => {
    test.beforeEach(async ({ page }) => {
      await routeMedia(page.context());
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, ID);
      await loadDoc(page, ID, BASE);
    });

    /** O campo `label` (exato) da faixa `n` (1 = primeira). */
    const trackField = (dialog: Locator, n: number, label: string) =>
      dialog
        .locator('fieldset.rte-dialog__fieldset')
        .nth(n - 1)
        .getByLabel(label, { exact: true });

    async function openVideoDialog(page: Page): Promise<Locator> {
      await selectIn(page, ID, 'Início', 6);
      const dialog = await openDialogFrom(page, ID, 'toolbar', 'video');
      await expect(dialogField(dialog, 'Video address (URL)')).toBeFocused();
      return dialog;
    }

    test('vídeo com pôster e faixas: acrescentar e remover pelo teclado, foco conferido', async ({
      page,
    }) => {
      const dialog = await openVideoDialog(page);
      await dialogField(dialog, 'Video address (URL)').fill('/e2e.webm');
      await dialogField(dialog, 'Cover image address (optional)').fill(
        '/e2e.png',
      );
      await expect(dialog.locator('.rte-dialog__hint').last()).toContainText(
        'No captions track',
      );

      // "Add track" por Tab + Enter a partir do campo de legenda
      const caption = dialogField(dialog, 'Caption');
      await caption.focus();
      await tab(page);
      const add = dialog.getByRole('button', { name: 'Add track' });
      await expect(add).toBeFocused();

      // faixa 1: legenda em pt-BR, escrita pelo teclado
      await page.keyboard.press('Enter');
      await expect(trackField(dialog, 1, 'Type')).toBeFocused();
      await tab(page);
      await expect(trackField(dialog, 1, 'Track address (.vtt)')).toBeFocused();
      await page.keyboard.type('/e2e.vtt');
      await tab(page);
      await expect(
        trackField(dialog, 1, 'Language code (BCP 47)'),
      ).toBeFocused();
      await page.keyboard.type('pt-BR');
      await tab(page);
      await expect(trackField(dialog, 1, 'Label')).toBeFocused();
      await page.keyboard.type('Português');
      await tab(page);
      await expect(trackField(dialog, 1, 'Default')).toBeFocused();
      await page.keyboard.press('Space');
      await expect(trackField(dialog, 1, 'Default')).toBeChecked();
      await tab(page);
      await expect(
        dialog.getByRole('button', { name: 'Remove track 1' }),
      ).toBeFocused();
      await tab(page);
      await expect(add).toBeFocused();
      // com uma faixa de legendas a dica de WCAG 1.2.2 some
      await expect(dialog.locator('.rte-dialog__hint')).not.toContainText(
        'No captions track',
      );

      // faixa 2: legendas de tradução em inglês
      await page.keyboard.press('Enter');
      await expect(trackField(dialog, 2, 'Type')).toBeFocused();
      await trackField(dialog, 2, 'Type').selectOption('subtitles');
      await tab(page);
      await page.keyboard.type('/e2e.vtt');
      await tab(page);
      await page.keyboard.type('en');
      await tab(page);
      await page.keyboard.type('English');

      // faixa 3: acrescentada e removida pelo teclado (foco: a anterior)
      await add.focus();
      await page.keyboard.press('Enter');
      await expect(trackField(dialog, 3, 'Type')).toBeFocused();
      await tab(page);
      await page.keyboard.type('/e2e.vtt');
      await tab(page);
      await page.keyboard.type('es');
      await tab(page);
      await page.keyboard.type('Español');
      await tab(page);
      await tab(page);
      await expect(
        dialog.getByRole('button', { name: 'Remove track 3' }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(dialog.locator('fieldset.rte-dialog__fieldset')).toHaveCount(
        2,
      );
      await expect(trackField(dialog, 2, 'Type')).toBeFocused();

      // remover a faixa 2 devolve o foco à "seguinte"; como não há, à anterior
      await trackField(dialog, 2, 'Label').focus();
      await tab(page);
      await expect(trackField(dialog, 2, 'Default')).toBeFocused();
      await tab(page);
      await expect(
        dialog.getByRole('button', { name: 'Remove track 2' }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(trackField(dialog, 1, 'Type')).toBeFocused();
      await expect(dialog.locator('fieldset.rte-dialog__fieldset')).toHaveCount(
        1,
      );

      // acrescenta de novo a faixa de inglês (a lista fica com duas)
      await add.focus();
      await page.keyboard.press('Enter');
      await expect(trackField(dialog, 2, 'Type')).toBeFocused();
      await trackField(dialog, 2, 'Type').selectOption('subtitles');
      await trackField(dialog, 2, 'Track address (.vtt)').fill('/e2e.vtt');
      await trackField(dialog, 2, 'Language code (BCP 47)').fill('en');
      await trackField(dialog, 2, 'Label').fill('English');

      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect(editableOf(page, ID)).toBeFocused();

      const video = editableOf(page, ID).locator(
        'figure.rt-figure--video video',
      );
      await expect(video).toHaveCount(1);
      await expect(video).toHaveAttribute('src', '/e2e.webm');
      await expect(video).toHaveAttribute('poster', '/e2e.png');
      const html = await rteHtml(page, ID);
      expect(html).toContain('<track kind="captions" src="/e2e.vtt"');
      expect(html).toContain('srclang="pt-BR" label="Português" default');
      expect(html).toContain('<track kind="subtitles" src="/e2e.vtt"');
      expect(html).toContain('srclang="en" label="English"');
      expect(html).not.toContain('Español');

      // o navegador criou as faixas
      const tracks = () =>
        video.evaluate((v: HTMLVideoElement) =>
          [...v.textTracks].map((t) => ({
            kind: t.kind,
            language: t.language,
            label: t.label,
          })),
        );
      await expect.poll(tracks).toEqual([
        { kind: 'captions', language: 'pt-BR', label: 'Português' },
        { kind: 'subtitles', language: 'en', label: 'English' },
      ]);

      // e, onde o motor carrega, a cue do .vtt (WebM/VP8 sem decodificação no WebKit)
      await video.evaluate((v: HTMLVideoElement) => {
        for (const t of v.textTracks) t.mode = 'hidden';
      });
      const cues = () =>
        video.evaluate((v: HTMLVideoElement) =>
          [...v.textTracks].map((t) => t.cues?.length ?? 0),
        );
      await expect.poll(cues, { timeout: 10_000 }).toEqual([1, 1]);
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });

    test('erros por campo de faixa: anunciados, e corrigir aplica', async ({
      page,
    }) => {
      const dialog = await openVideoDialog(page);
      await dialogField(dialog, 'Video address (URL)').fill('/e2e.webm');
      await dialog.getByRole('button', { name: 'Add track' }).click();
      await trackField(dialog, 1, 'Track address (.vtt)').fill(
        'http://media.example.test/a.vtt',
      );
      await trackField(dialog, 1, 'Language code (BCP 47)').fill('xx yy');
      // clique direto em "Apply" logo depois de digitar no idioma: o `mousedown`
      // não tira o foco do campo (o Firefox perdia o clique quando o erro em
      // linha deslocava o botão entre o `mousedown` e o `mouseup`)
      await dialog.locator('.rte-dialog__apply').click();
      await expect(dialog).toBeVisible();

      const expectError = async (field: Locator, text: string) => {
        await expect(field).toHaveAttribute('aria-invalid', 'true');
        const id = await field.getAttribute('aria-describedby');
        expect(id).toBeTruthy();
        await expect(dialog.locator(`[id="${id}"]`)).toHaveText(text);
        await expect(dialog.locator(`[id="${id}"]`)).toHaveClass(
          /rte-dialog__error/,
        );
      };
      await expectError(
        trackField(dialog, 1, 'Track address (.vtt)'),
        TRACK_ERROR_URL,
      );
      await expectError(
        trackField(dialog, 1, 'Language code (BCP 47)'),
        LANG_ERROR,
      );
      await expectError(trackField(dialog, 1, 'Label'), REQUIRED);
      // o primeiro campo inválido recebe o foco
      await expect(trackField(dialog, 1, 'Track address (.vtt)')).toBeFocused();
      expect(await rteHtml(page, ID)).toBe(BASE);

      await trackField(dialog, 1, 'Track address (.vtt)').fill('/e2e.vtt');
      await trackField(dialog, 1, 'Language code (BCP 47)').fill('pt-BR');
      await trackField(dialog, 1, 'Label').fill('Português');
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect
        .poll(() => rteHtml(page, ID))
        .toContain(
          '<track kind="captions" src="/e2e.vtt" srclang="pt-BR" label="Português">',
        );
    });

    for (const embed of EMBEDS) {
      test(`embed ${embed.name}: iframe do core, pedido interceptado, Mod+Z`, async ({
        page,
      }) => {
        await selectIn(page, ID, 'Início', 6);
        const dialog = await openDialogFrom(page, ID, 'toolbar', 'embed');
        const url = dialogField(dialog, 'Page address (URL)');
        await expect(url).toBeFocused();
        await url.fill(embed.url);
        const requested = page.waitForRequest(
          (r) => r.url().startsWith(embed.src),
          { timeout: 15_000 },
        );
        await submitDialog(dialog);
        await expect(dialog).toBeHidden();
        await expect(editableOf(page, ID)).toBeFocused();
        await expect
          .poll(() => rteHtml(page, ID))
          .toContain(`<iframe src="${embed.src}`);
        await requested;
        await expect(
          editableOf(page, ID).locator('.rt-embed iframe'),
        ).toHaveAttribute(
          'src',
          new RegExp(`^${embed.src.replace(/[.?]/g, '\\$&')}`),
        );
        await expectFloating(page, ID, 'embed');
        expect(await page.evaluate(() => window.__violations)).toEqual([]);
        await page.keyboard.press('ControlOrMeta+z');
        await expect.poll(() => rteHtml(page, ID)).toBe(BASE);
      });
    }

    test('embed: https://example.com/x é recusado com o erro anunciado', async ({
      page,
    }) => {
      await selectIn(page, ID, 'Início', 6);
      const dialog = await openDialogFrom(page, ID, 'toolbar', 'embed');
      const url = dialogField(dialog, 'Page address (URL)');
      await url.fill('https://example.com/x');
      await submitDialog(dialog);
      await expect(dialog).toBeVisible();
      await expect(url).toHaveAttribute('aria-invalid', 'true');
      const id = (await url.getAttribute('aria-describedby')) ?? '';
      const errorId = id.split(' ').find((p) => p.endsWith('-error'));
      expect(errorId).toBeTruthy();
      await expect(dialog.locator(`[id="${errorId}"]`)).toHaveText(
        'No enabled provider recognizes this address.',
      );
      expect(await rteHtml(page, ID)).toBe(BASE);
    });

    test('legenda do embed pelo Details…, com a URL somente leitura', async ({
      page,
    }) => {
      await page.evaluate(
        (html) => window.rteE2e.setValue('media', html),
        '<p>Início</p>' + YOUTUBE + '<p>Fim</p>',
      );
      await expect(
        editableOf(page, ID).locator('.rt-embed iframe'),
      ).toHaveCount(1);
      await selectMediaByClick(page, ID, 'embed');
      await expectFloating(page, ID, 'embed');
      await floatingItem(
        floatingMenu(page, ID, 'embed'),
        'Embedded content details…',
      ).click();
      const dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.rte-dialog__readonly')).toHaveText(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      );
      await expect(
        dialog.locator('input[type="text"]').first(),
      ).toHaveAttribute('id', /caption/);
      const before = await rteHtml(page, ID);
      await dialogField(dialog, 'Caption').fill('Clipe de abertura');
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect.poll(() => rteHtml(page, ID)).toContain('Clipe de abertura');
      const html = await rteHtml(page, ID);
      expect(html).toContain(
        'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"',
      );
      await expect(editableOf(page, ID)).toBeFocused();
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(() => rteHtml(page, ID)).toBe(before);
    });

    // --- edição de vídeo e embed pelo "Details…" ---
    const VIDEO = (tracks: string) =>
      `<figure class="rt-figure rt-figure--video"><video src="/e2e.webm" controls preload="metadata" playsinline>${tracks}</video></figure>`;
    const TRACK = (n: number) =>
      `<track kind="captions" src="/e2e.vtt" srclang="pt-BR" label="Faixa ${n}">`;

    async function loadMedia(
      page: Page,
      html: string,
      kind: 'video' | 'embed',
    ) {
      await page.evaluate(
        (html) => window.rteE2e.setValue('media', html),
        `<p>Início</p>${html}<p>Fim</p>`,
      );
      await expect(
        editableOf(page, ID).locator(
          kind === 'video'
            ? 'figure.rt-figure--video video'
            : '.rt-embed iframe',
        ),
      ).toHaveCount(1);
      await selectMediaByClick(page, ID, kind);
      await expectFloating(page, ID, kind);
    }

    async function openDetails(page: Page, kind: 'video' | 'embed') {
      await floatingItem(
        floatingMenu(page, ID, kind),
        kind === 'video' ? 'Video details…' : 'Embedded content details…',
      ).click();
      const dialog = openDialogOf(page, ID);
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test('vídeo com 11 faixas: todas carregadas, "Add track" desabilitado, Apply mantém as 11', async ({
      page,
    }) => {
      const tracks = Array.from({ length: 11 }, (_, i) => TRACK(i + 1)).join(
        '',
      );
      await loadMedia(page, VIDEO(tracks), 'video');
      const dialog = await openDetails(page, 'video');
      await expect(dialog.locator('fieldset.rte-dialog__fieldset')).toHaveCount(
        11,
      );
      await expect(
        dialog.getByRole('button', { name: 'Add track' }),
      ).toBeDisabled();
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect
        .poll(
          async () =>
            ((await rteHtml(page, ID)).match(/<track /g) ?? []).length,
        )
        .toBe(11);
    });

    for (const kind of ['video', 'embed'] as const) {
      test(`${kind}: Details… e Remove tiram o nó; um Mod+Z o traz de volta`, async ({
        page,
      }) => {
        await loadMedia(
          page,
          kind === 'video' ? VIDEO(TRACK(1)) : YOUTUBE,
          kind,
        );
        const target = editableOf(page, ID).locator(
          kind === 'video' ? 'figure.rt-figure--video' : '.rt-embed',
        );
        const before = await rteHtml(page, ID);
        await page.waitForTimeout(UNDO_GROUP_MS);
        const dialog = await openDetails(page, kind);
        await dialog.locator('.rte-dialog__remove').click();
        await expect(dialog).toBeHidden();
        await expect(target).toHaveCount(0);
        await expect(editableOf(page, ID)).toBeFocused();
        await page.keyboard.press('ControlOrMeta+z');
        await expect(target).toHaveCount(1);
        await expect.poll(() => rteHtml(page, ID)).toBe(before);
      });
    }

    test('vídeo: legenda e faixa pelo Details… e um Mod+Z restaura o estado anterior', async ({
      page,
    }) => {
      await loadMedia(page, VIDEO(TRACK(1)), 'video');
      const before = await rteHtml(page, ID);
      await page.waitForTimeout(UNDO_GROUP_MS);
      const dialog = await openDetails(page, 'video');
      await dialogField(dialog, 'Caption').fill('Abertura');
      await trackField(dialog, 1, 'Label').fill('Outro nome');
      await submitDialog(dialog);
      await expect(dialog).toBeHidden();
      await expect.poll(() => rteHtml(page, ID)).toContain('Abertura');
      expect(await rteHtml(page, ID)).toContain('label="Outro nome"');
      await expect(editableOf(page, ID)).toBeFocused();
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(() => rteHtml(page, ID)).toBe(before);
    });

    test('vídeo: endereço e pôster recusados anunciam o erro e nada muda', async ({
      page,
    }) => {
      const dialog = await openVideoDialog(page);
      const src = dialogField(dialog, 'Video address (URL)');
      const poster = dialogField(dialog, 'Cover image address (optional)');
      await src.fill('http://media.example.test/a.webm');
      await poster.fill('data:image/png;base64,AAAA');
      await dialog.locator('.rte-dialog__apply').click();
      await expect(dialog).toBeVisible();
      for (const field of [src, poster]) {
        await expect(field).toHaveAttribute('aria-invalid', 'true');
        const ids = (
          (await field.getAttribute('aria-describedby')) ?? ''
        ).split(' ');
        const errorId = ids.find((i) => i.endsWith('-error'));
        expect(errorId).toBeTruthy();
        await expect(dialog.locator(`[id="${errorId}"]`)).toHaveText(
          TRACK_ERROR_URL,
        );
      }
      await expect(src).toBeFocused();
      expect(await rteHtml(page, ID)).toBe(BASE);
    });
  });
}
