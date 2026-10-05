import { expect, type Locator, type Page } from '@playwright/test';
import type { RteE2eId } from '../window';
import { editorHost } from './app';

// Ajudantes dos menus flutuantes (spec 05b2b, N21–N24) na página `/floating`.

export type FloatingKind = 'text' | 'link' | 'table' | 'image';

const KINDS: readonly FloatingKind[] = ['image', 'link', 'text', 'table'];

/** O `.rte-floating--<kind>` do editor `id` (visível ou não). */
export function floatingMenu(
  page: Page,
  id: RteE2eId,
  kind: FloatingKind,
): Locator {
  return editorHost(page, id).locator(`.rte-floating--${kind}`);
}

/**
 * Espera o *chunk* dos menus (`@defer`) chegar: os `.rte-floating` entram no
 * DOM. Chamar antes de toda afirmação negativa ("nenhum menu"), para ela não
 * passar só porque os menus ainda não carregaram.
 */
export async function waitFloatingReady(
  page: Page,
  id: RteE2eId,
): Promise<void> {
  await editorHost(page, id)
    .locator('.rte-floating')
    .first()
    .waitFor({ state: 'attached' });
}

/** Tipos abertos (`:popover-open`) no editor `id`. */
function openKinds(page: Page, id: RteE2eId): Promise<string[]> {
  return editorHost(page, id).evaluate((host) =>
    [...host.querySelectorAll<HTMLElement>('.rte-floating')]
      .filter((el) => el.matches(':popover-open'))
      .map((el) => el.getAttribute('data-rte-kind') ?? '?'),
  );
}

/**
 * Exatamente o tipo `kind` aberto por `:popover-open` (e visível), ou nenhum
 * (`null`, depois de esperar o *chunk*).
 */
export async function expectFloating(
  page: Page,
  id: RteE2eId,
  kind: FloatingKind | null,
): Promise<void> {
  await waitFloatingReady(page, id);
  await expect.poll(() => openKinds(page, id)).toEqual(kind ? [kind] : []);
  if (kind) await expect(floatingMenu(page, id, kind)).toBeVisible();
  else
    for (const k of KINDS) {
      await expect(floatingMenu(page, id, k)).toBeHidden();
    }
}

/** Item (botão, ou o `<a>` do endereço) do menu pelo `aria-label`/`title`. */
export function floatingItem(menu: Locator, label: string): Locator {
  const quoted = JSON.stringify(label);
  return menu.locator(
    `:is(button, a)[aria-label=${quoted}], .rte-menu__item:has(.rte-menu__label:text-is(${quoted}))`,
  );
}

/** Retângulo do menu `kind` do editor `id`. */
export async function floatingRect(
  page: Page,
  id: RteE2eId,
  kind: FloatingKind,
): Promise<DOMRect> {
  return (await floatingMenu(page, id, kind).evaluate((el) =>
    el.getBoundingClientRect().toJSON(),
  )) as DOMRect;
}
