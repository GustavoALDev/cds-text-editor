import { expect, type Locator, type Page } from '@playwright/test';
import type { RteE2eId } from '../window';
import { editableOf, editorHost } from './app';
import { menuItem, openMenu, toolbarButton } from './toolbar';

// Ajudantes dos diálogos (spec 05b2a, N16–N20) na página `/dialogs`.

export type DialogKind =
  'link' | 'lang' | 'quoteAuthor' | 'table' | 'image' | 'video' | 'embed';

/** Rótulos (en) do item da barra de cada diálogo, fora e dentro do trecho. */
const TOOLBAR_LABELS: Record<Exclude<DialogKind, 'table'>, string[]> = {
  link: ['Link', 'Edit link'],
  lang: ['Language', 'Edit language'],
  quoteAuthor: ['Quote author'],
  image: ['Insert image', 'Edit image'],
  video: ['Insert video', 'Edit video'],
  embed: ['Insert embedded content', 'Edit embedded content'],
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

/** Controle do *chunk* dos diálogos (`dialogsChunk`). */
export interface DialogsChunk {
  /** URL do *chunk* (vazia até ele ser pedido). */
  readonly url: string;
  /** Resolve com a URL quando o *chunk* é pedido (prefetch ou pedido). */
  readonly requested: Promise<string>;
  /** Segura a resposta do *chunk* até a função devolvida ser chamada. */
  hold(): () => void;
  /** Aborta o pedido do *chunk* (falha de rede). */
  abort(): void;
}

/**
 * Intercepta os `.js` da página (antes do `gotoApp`): busca a resposta e
 * marca como o *chunk* procurado o arquivo que contém `marker`; esse é
 * segurado (`hold`) ou abortado (`abort`). Os outros seguem para o próximo
 * interceptador com `route.fallback()` (Ruling 4 da 05c2a: com dois
 * interceptadores na página, um `fulfill` aqui engoliria o *chunk* do outro).
 */
export async function chunkByMarker(
  page: Page,
  marker: string,
): Promise<DialogsChunk> {
  let mode: 'pass' | 'hold' | 'abort' = 'pass';
  let gate: Promise<void> = Promise.resolve();
  let url = '';
  let seen: (url: string) => void = () => undefined;
  const requested = new Promise<string>((resolve) => (seen = resolve));
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!body.includes(marker)) {
      await route.fallback();
      return;
    }
    url = route.request().url();
    seen(url);
    if (mode === 'abort') {
      await route.abort('failed');
      return;
    }
    await gate;
    await route.fulfill({ response, body });
  });
  return {
    get url() {
      return url;
    },
    requested,
    hold() {
      mode = 'hold';
      let release: () => void = () => undefined;
      gate = new Promise<void>((resolve) => (release = resolve));
      return () => release();
    },
    abort() {
      mode = 'abort';
    },
  };
}

/**
 * *Chunk* dos diálogos de link, idioma, citação e tabela: o `.js` com
 * `rte-link-form` (o `rte-dialog__form` está também no da mídia, 05c2a E2).
 * O app compila a biblioteca do fonte: os nomes dos *chunks* não são os do
 * `dist`, daí a marca no conteúdo.
 */
export function dialogsChunk(page: Page): Promise<DialogsChunk> {
  return chunkByMarker(page, 'rte-link-form');
}

/**
 * *Chunk* dos formulários de mídia (`RteMediaForms`, 05c2a E2): o `.js` com
 * `rte-image-form`.
 */
export function mediaFormsChunk(page: Page): Promise<DialogsChunk> {
  return chunkByMarker(page, 'rte-image-form');
}
