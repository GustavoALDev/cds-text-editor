import type { Signal } from '@angular/core';
import { validate, type PathKind } from '@angular/forms/signals';
import type { RteEditor } from '@cds/rte-angular';
import type { RtePath } from './signal-validators';

/** O editor ligado ao campo (tipicamente um `viewChild`); ausente = válido. */
export type RteEditorRef = () => RteEditor | null | undefined;

function countRule<K extends PathKind>(
  path: RtePath<K>,
  editor: RteEditorRef,
  kind: 'rteUploadsPending' | 'rteImagesMissingAlt',
  read: (e: RteEditor) => Signal<number>,
): void {
  validate(path, () => {
    const current = editor();
    const count = current ? read(current)() : 0;
    return count > 0 ? { kind, count } : undefined;
  });
}

/**
 * Inválido enquanto o editor tem envios em curso (E19): lê
 * `pendingUploads()`, então revalida quando um envio termina, falha ou é
 * cancelado, sem mudar o valor. Não publica metadado.
 */
export function rteUploadsFinished<K extends PathKind = PathKind.Root>(
  path: RtePath<K>,
  editor: RteEditorRef,
): void {
  countRule(path, editor, 'rteUploadsPending', (e) => e.pendingUploads);
}

/**
 * Inválido com imagens de `alt: null` no editor (E19): lê
 * `imagesMissingAlt()` (só a sessão: o HTML salvo traz `alt=""`, V7). Não
 * publica metadado.
 */
export function rteImagesHaveAlt<K extends PathKind = PathKind.Root>(
  path: RtePath<K>,
  editor: RteEditorRef,
): void {
  countRule(path, editor, 'rteImagesMissingAlt', (e) => e.imagesMissingAlt);
}
