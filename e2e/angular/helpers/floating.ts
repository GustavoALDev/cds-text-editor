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

/** Retângulo (viewport) de `word` dentro do primeiro `block` do editável que a contém. */
export async function wordRect(
  page: Page,
  id: RteE2eId,
  block: string,
  word: string,
): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}> {
  const target = editorHost(page, id)
    .locator('.ProseMirror')
    .locator(block, { hasText: word })
    .first();
  return target.evaluate((el, word) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(word);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + word.length);
      const b = r.getBoundingClientRect();
      return {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        top: b.top,
        bottom: b.bottom,
        left: b.left,
        right: b.right,
      };
    }
    throw new Error('palavra ausente');
  }, word);
}

/** Rola o contêiner da página `floating` (e a página) para o editor ficar na viewport. */
export async function centerScroller(page: Page): Promise<void> {
  await page
    .locator('.e2e-floating-scroller')
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
}

/** O foco está dentro de um `.rte-floating` do editor `id`. */
export function focusInMenu(page: Page, id: RteE2eId): Promise<boolean> {
  return editorHost(page, id).evaluate(
    (host) =>
      !!document.activeElement?.closest('.rte-floating') &&
      host.contains(document.activeElement),
  );
}
