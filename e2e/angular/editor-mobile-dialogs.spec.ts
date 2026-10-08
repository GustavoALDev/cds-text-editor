import { expect, test, type Page } from '@playwright/test';
import { gotoApp, waitForEditor } from './helpers/app';
import {
  cancelDialog,
  openDialogFrom,
  type DialogKind,
} from './helpers/dialogs';
import {
  isInside,
  layoutRect,
  pageScroll,
  rectOf,
  smallTargets,
  mobileViolations,
} from './helpers/mobile';

import { selectIn } from './helpers/toolbar';

// O6 (spec 08b, R2): diálogos modais em celular. A 360 x 640 cada `<dialog>` cabe inteiro na
// tela, rola por dentro quando o conteúdo é maior e as ações ficam alcançáveis (visíveis depois
// de rolar o próprio diálogo); alvos >= 24 px; reflow a 320 px; axe sem violação séria.

const ID = 'dialogs';
const KINDS: readonly DialogKind[] = [
  'link',
  'image',
  'video',
  'embed',
  'table',
  'lang',
];

async function open(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await gotoApp(page, '/dialogs');
  await waitForEditor(page, ID);
}

for (const [width, height] of [
  [360, 640],
  [320, 568],
] as const) {
  test.describe(
    `O6 diálogos a ${width} x ${height} @mobile`,
    {
      tag: '@mobile',
    },
    () => {
      for (const kind of KINDS) {
        test(`${kind}: inteiro na tela, rolagem interna, ações alcançáveis, alvos e axe`, async ({
          page,
        }) => {
          test.setTimeout(90_000);
          await open(page, width, height);
          if (kind === 'link' || kind === 'lang') {
            await selectIn(page, ID, 'Fim');
          }
          const dialog = await openDialogFrom(page, ID, 'api', kind);
          const view = await layoutRect(page);
          const rect = await rectOf(dialog);
          expect(isInside(rect, view), `${kind}: diálogo na tela`).toBe(true);

          // rolagem interna: o que passa da altura rola dentro do diálogo, não da página
          const scroll = await dialog.evaluate((el) => ({
            overflowY: getComputedStyle(el).overflowY,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          }));
          if (scroll.scrollHeight > scroll.clientHeight) {
            expect(['auto', 'scroll']).toContain(scroll.overflowY);
          }
          const page0 = await pageScroll(page);
          expect(page0.scrollWidth).toBeLessThanOrEqual(page0.innerWidth);

          // cada ação, depois de rolar o diálogo, fica visível dentro dele e na tela
          const actions = dialog.locator('.rte-dialog__actions button');
          const count = await actions.count();
          expect(count).toBeGreaterThan(0);
          for (let i = 0; i < count; i++) {
            const action = actions.nth(i);
            await action.scrollIntoViewIfNeeded();
            await expect(action).toBeVisible();
            const inner = await rectOf(action);
            expect(isInside(inner, rect), `${kind}: ação ${i} no diálogo`).toBe(
              true,
            );
            expect(isInside(inner, view), `${kind}: ação ${i} na tela`).toBe(
              true,
            );
          }

          expect(await smallTargets(dialog), `${kind}: alvos`).toEqual([]);
          expect(await mobileViolations(page), `${kind}: axe`).toEqual([]);
          await cancelDialog(dialog);
        });
      }
    },
  );
}

test.describe(
  'O6 diálogo aberto pelo toque @mobile',
  { tag: '@mobile' },
  () => {
    test('toque no item "Link" da barra abre o diálogo dentro da tela', async ({
      page,
    }) => {
      await open(page, 360, 640);
      await selectIn(page, ID, 'Fim');
      const dialog = await openDialogFrom(page, ID, 'toolbar', 'link');
      expect(isInside(await rectOf(dialog), await layoutRect(page))).toBe(true);
      await cancelDialog(dialog);
    });
  },
);
