import { expect, test, type Page } from '@playwright/test';
import { editableOf, gotoApp, modelValue, waitForEditor } from './helpers/app';
import { dialogField, openDialogFrom, submitDialog } from './helpers/dialogs';
import { expectFloating, floatingItem, floatingMenu } from './helpers/floating';
import { mediaDialog, routeMedia } from './helpers/media';
import { loadDoc, rteHtml, selectIn } from './helpers/toolbar';

// N30 (spec 05c1, R9 pela interface): a sessão de mídia vista pela ponte e
// pela página `/media` — inserir, trocar o endereço, remover, desfazer e
// refazer; digitar não emite; a carga externa só troca a base. `/media`
// direto (CSP própria).

const ID = 'media' as const;
const PNG = '/e2e.png';
const B = '/e2e.png?b';
const C = '/e2e.png?c';
/** Janela do ProseMirror para agrupar passos de desfazer (newGroupDelay 500 ms). */
const UNDO_GROUP_MS = 600;

const figure = (src: string, alt: string) =>
  `<figure class="rt-figure rt-figure--center"><img src="${src}" alt="${alt}" loading="lazy" decoding="async"></figure>`;
const BASE = `<p>Início</p>${figure(PNG, 'Logo')}<p>Fim</p>`;

interface Delta {
  added: string[];
  removed: string[];
}
interface Session extends Delta {
  current: string[];
}

const changes = (page: Page) =>
  page.evaluate((id) => window.rteE2e.mediaChanges(id), ID);
const last = (page: Page) =>
  page.evaluate((id) => window.rteE2e.lastMediaChange(id), ID);
const session = (page: Page) =>
  page.evaluate((id) => window.rteE2e.mediaSession(id), ID);

/**
 * Espera o `mediaChange` de número `count` e confere o delta e o líquido da
 * sessão (ponte e texto da página).
 */
async function expectChange(
  page: Page,
  count: number,
  delta: Delta,
  net: Session,
): Promise<void> {
  await expect.poll(() => changes(page)).toBe(count);
  expect(await last(page)).toEqual(delta);
  expect(await session(page)).toEqual(net);
  await expect(page.getByTestId('media-change-count')).toHaveText(`${count}`);
  expect(
    JSON.parse(await page.getByTestId('media-last-change').innerText()),
  ).toEqual(delta);
  expect(
    JSON.parse(await page.getByTestId('media-session').innerText()),
  ).toEqual(net);
}

for (const zone of [false, true]) {
  test.describe(`N30${zone ? ' (zone.js)' : ''}`, () => {
    test.beforeEach(async ({ page }) => {
      await routeMedia(page.context());
      await gotoApp(page, '/media', { zone });
      await waitForEditor(page, ID);
    });

    /**
     * O ProseMirror agrupa passos a menos de 500 ms no mesmo passo de
     * desfazer: espera a janela passar antes de cada ação que o teste
     * desfaz separadamente.
     */
    const separate = (page: Page) => page.waitForTimeout(UNDO_GROUP_MS);

    /** Insere `B` pela barra, com o cursor no fim de "Início". */
    async function insertB(page: Page): Promise<void> {
      await selectIn(page, ID, 'Início', 6);
      const dialog = await openDialogFrom(page, ID, 'toolbar', 'image');
      await dialogField(dialog, 'Image address (URL)').fill(B);
      await dialogField(dialog, 'Alternative text').fill('B');
      await submitDialog(dialog);
    }

    test('documento inicial: sessão com a base e nenhum mediaChange', async ({
      page,
    }) => {
      expect(await changes(page)).toBe(0);
      expect(await last(page)).toBeNull();
      expect(await session(page)).toEqual({
        current: [PNG, '/e2e.vtt', '/e2e.webm'],
        added: [],
        removed: [],
      });
      // O fixture escrito à mão é o ponto fixo de `getRteHtml` (ida e volta).
      const model = await modelValue(page, ID);
      expect(model).toContain('youtube-nocookie.com/embed');
      // O core acrescenta `style="aspect-ratio: 16 / 9"` ao `iframe` do embed na
      // saída; carregado de volta, esse atributo violaria a CSP estrita.
      expect(
        (await rteHtml(page, ID)).replace(' style="aspect-ratio: 16 / 9"', ''),
      ).toBe(model);
    });

    test('inserir, trocar o endereço, remover, desfazer e refazer', async ({
      page,
    }) => {
      await loadDoc(page, ID, BASE);
      expect(await changes(page)).toBe(0);
      expect(await last(page)).toBeNull();
      expect(await session(page)).toEqual({
        current: [PNG],
        added: [],
        removed: [],
      });

      // inserir
      await insertB(page);
      await expectChange(
        page,
        1,
        { added: [B], removed: [] },
        { current: [PNG, B], added: [B], removed: [] },
      );

      // trocar o endereço pelo "Image details…"
      await separate(page);
      await expectFloating(page, ID, 'image');
      await floatingItem(
        floatingMenu(page, ID, 'image'),
        'Image details…',
      ).click();
      const edit = mediaDialog(page, ID);
      await expect(edit).toBeVisible();
      await dialogField(edit, 'Image address (URL)').fill(C);
      await submitDialog(edit);
      await expectChange(
        page,
        2,
        { added: [C], removed: [B] },
        { current: [PNG, C], added: [C], removed: [B] },
      );

      // remover pelo menu flutuante
      await separate(page);
      await expectFloating(page, ID, 'image');
      await floatingItem(
        floatingMenu(page, ID, 'image'),
        'Remove image',
      ).click();
      await expect(editableOf(page, ID).locator('img')).toHaveCount(1);
      await expectChange(
        page,
        3,
        { added: [], removed: [C] },
        { current: [PNG], added: [], removed: [B, C] },
      );

      // desfazer (2x) e refazer
      await expect(editableOf(page, ID)).toBeFocused();
      await page.keyboard.press('ControlOrMeta+z');
      await expectChange(
        page,
        4,
        { added: [C], removed: [] },
        { current: [PNG, C], added: [C], removed: [B] },
      );
      await page.keyboard.press('ControlOrMeta+z');
      await expectChange(
        page,
        5,
        { added: [B], removed: [C] },
        { current: [PNG, B], added: [B], removed: [C] },
      );
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expectChange(
        page,
        6,
        { added: [C], removed: [B] },
        { current: [PNG, C], added: [C], removed: [B] },
      );
    });

    test('digitar 20 letras não emite mediaChange nem muda a sessão', async ({
      page,
    }) => {
      await loadDoc(page, ID, BASE);
      await selectIn(page, ID, 'Fim', 3);
      const before = await session(page);
      await page.keyboard.type('abcdefghijklmnopqrst');
      await expect
        .poll(() => rteHtml(page, ID))
        .toContain('Fimabcdefghijklmnopqrst');
      expect(await changes(page)).toBe(0);
      expect(await last(page)).toBeNull();
      expect(await session(page)).toEqual(before);
    });

    test('carga externa: sem mediaChange e com a base nova', async ({
      page,
    }) => {
      await loadDoc(page, ID, BASE);
      await insertB(page);
      await expectChange(
        page,
        1,
        { added: [B], removed: [] },
        { current: [PNG, B], added: [B], removed: [] },
      );

      await page.getByTestId('media-external-load').click();
      const img = editableOf(page, ID).locator('img');
      await expect(img).toHaveCount(1);
      await expect(img).toHaveAttribute('src', '/e2e.png?external');
      await expect
        .poll(() => session(page))
        .toEqual({ current: ['/e2e.png?external'], added: [], removed: [] });
      expect(await changes(page)).toBe(1);
      expect(await last(page)).toEqual({ added: [B], removed: [] });
      await expect(page.getByTestId('media-change-count')).toHaveText('1');
    });
  });
}
