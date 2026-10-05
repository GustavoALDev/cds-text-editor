import { expect, type Locator, type Page } from '@playwright/test';
import type { RteE2eId } from '../window';
import { editableOf, editorHost } from './app';
import { menuItem, openMenu, toolbarButton } from './toolbar';

// Ajudantes dos diálogos (spec 05b2a, N16–N20) na página `/dialogs`.

export type DialogKind = 'link' | 'lang' | 'quoteAuthor' | 'table';

/** Rótulos (en) do item da barra de cada diálogo, fora e dentro do trecho. */
const TOOLBAR_LABELS: Record<Exclude<DialogKind, 'table'>, string[]> = {
  link: ['Link', 'Edit link'],
  lang: ['Language', 'Edit language'],
  quoteAuthor: ['Quote author'],
};

/** O `<dialog>` aberto (`showModal`) dentro do host do editor `id`. */
export function openDialogOf(page: Page, id: RteE2eId): Locator {
  return editorHost(page, id).locator('dialog.rte-dialog[open]');
}

/**
 * Abre o diálogo `kind` do editor `id` e devolve o `dialog.rte-dialog[open]`
 * do host (já visível, com o *chunk* carregado):
 * - `toolbar`: clique no item da barra (a tabela pelo menu `Table`, entrada
 *   `Insert table…`);
 * - `shortcut`: `ControlOrMeta+K` real com o foco no editável (só `link`);
 * - `api`: no `dialogs-api`, clique no botão `open-<kind>` (que grava o
 *   retorno de `openDialog` em `data-result`); nos outros, `openDialog` pela
 *   ponte.
 * A seleção do editor é a do chamador (`selectIn`).
 */
export async function openDialogFrom(
  page: Page,
  id: RteE2eId,
  how: 'toolbar' | 'shortcut' | 'api',
  kind: DialogKind,
): Promise<Locator> {
  if (how === 'toolbar') {
    if (kind === 'table') {
      const menu = await openMenu(page, id, 'Table');
      await menuItem(menu, 'Insert table…').click();
    } else {
      const button = TOOLBAR_LABELS[kind]
        .map((label) => toolbarButton(page, id, label))
        .reduce((a, b) => a.or(b));
      await button.click();
    }
  } else if (how === 'shortcut') {
    if (kind !== 'link') throw new Error('só o link tem atalho (Mod-K)');
    await expect(editableOf(page, id)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+k');
  } else if (id === 'dialogs-api') {
    const button = page.locator(`button[data-testid="open-${kind}"]`);
    await button.click();
    await expect(button).toHaveAttribute('data-result', 'true');
  } else {
    const accepted = await page.evaluate(
      ({ id, kind }) => window.rteE2e.openDialog(id, kind),
      { id, kind },
    );
    expect(accepted).toBe(true);
  }
  const dialog = openDialogOf(page, id);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Campo do diálogo pelo rótulo (`<label for>`). */
export function dialogField(dialog: Locator, label: string): Locator {
  return dialog.getByLabel(label, { exact: true });
}

/** Envia o formulário pelo botão "Aplicar" (`.rte-dialog__apply`). */
export async function submitDialog(dialog: Locator): Promise<void> {
  await dialog.locator('.rte-dialog__apply').click();
}

/** Fecha pelo botão "Cancelar" (o `type="button"` entre remover e aplicar). */
export async function cancelDialog(dialog: Locator): Promise<void> {
  await dialog
    .locator('.rte-dialog__actions button[type="button"]')
    .last()
    .click();
}
