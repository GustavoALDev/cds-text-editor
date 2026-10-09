/**
 * Auxiliares para testar aplicações que usam o `RteEditor`, com acesso à instância do Tiptap.
 *
 * @packageDocumentation
 */

import type { Editor } from '@tiptap/core';

/** Mesma chave do componente (D23): `Symbol.for` vale entre bundles. */
const HOOK = Symbol.for('@cds/rte-angular/editor');

function isEditorLike(value: unknown): value is Editor {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Partial<Editor>).getJSON === 'function' &&
    typeof (value as Partial<Editor>).on === 'function' &&
    'view' in value
  );
}

/**
 * `Editor` do Tiptap de um `rte-editor` (o elemento host), lido do gancho de
 * teste; `null` antes da criação, depois de destruir ou em outro elemento.
 */
export function getRteEditor(host: Element): Editor | null {
  const value: unknown = (host as unknown as Record<symbol, unknown>)[HOOK];
  return isEditorLike(value) ? value : null;
}
