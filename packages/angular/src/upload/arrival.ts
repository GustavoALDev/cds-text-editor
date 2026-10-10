import { untracked } from '@angular/core';
import type { RteImageAttrs, RteVideoAttrs } from '@comodeviaser/rte-core/extensions';
import type { RteUploadHost } from './host';
import {
  insertUploaded,
  selectOnArrival,
  type RteUploadArrival,
} from './insert';
import type { RteUploadedAttrs } from './response';
import type { RteUploadText, RteUploadType } from './types';

/** Resultado de uma tentativa de inserção (E9, E10). */
export type RteInsertOutcome =
  | { readonly kind: 'inserted' }
  | { readonly kind: 'wait' }
  | {
      readonly kind: 'failed';
      readonly reason: 'unavailable' | 'response';
      readonly cause?: unknown;
    };

/** O que a chegada precisa do envio. */
export interface RteArrivingUpload {
  readonly id: string;
  readonly type: RteUploadType;
  readonly attrs: RteUploadedAttrs;
  readonly text: RteUploadText | undefined;
}

/**
 * Chegada (E9): resposta + textos do diálogo; colado, solto ou por
 * `uploadFiles`, a imagem entra com `alt: null` (E19). No vídeo, o pôster do
 * diálogo vence o da resposta.
 */
export function arrivalOf(
  u: RteArrivingUpload,
  select: boolean,
): RteUploadArrival {
  const { id, type, attrs: r, text } = u;
  if (type === 'image') {
    const attrs: RteImageAttrs = { ...r, alt: text?.alt ?? null };
    if (text) attrs.caption = text.caption;
    if (text?.credit !== undefined) attrs.credit = text.credit;
    return { id, type, attrs, select };
  }
  const { poster: served, ...rest } = r;
  const attrs: RteVideoAttrs = { ...rest };
  const poster = text?.poster ?? served;
  if (poster !== undefined) attrs.poster = poster;
  if (text) attrs.caption = text.caption;
  if (text?.tracks) attrs.tracks = text.tracks;
  return { id, type, attrs, select };
}

/**
 * Tenta inserir (E9, E10): não editável ou oculto → `'unavailable'`; diálogo
 * aberto ou composição → espera; comando recusado ou que lança →
 * `'response'` (a exceção vai como causa). A seleção da E9 é decidida logo
 * antes da transação, fora da zona.
 */
export function insertArrival(
  host: Pick<RteUploadHost, 'editor' | 'canInsert' | 'mustWait' | 'zone'>,
  u: RteArrivingUpload,
): RteInsertOutcome {
  const editor = untracked(host.editor);
  if (!editor || editor.isDestroyed || !host.canInsert()) {
    return { kind: 'failed', reason: 'unavailable' };
  }
  if (host.mustWait()) return { kind: 'wait' };
  try {
    const ok = host.zone.runOutsideAngular(() =>
      insertUploaded(editor, arrivalOf(u, selectOnArrival(editor, u.id))),
    );
    return ok ? { kind: 'inserted' } : { kind: 'failed', reason: 'response' };
  } catch (cause) {
    return { kind: 'failed', reason: 'response', cause };
  }
}
