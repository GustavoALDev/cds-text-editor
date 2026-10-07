import { computed, type Signal } from '@angular/core';
import {
  getSearchState,
  type RteSearchState,
} from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';

/** Maior seleção que vira consulta inicial (K7). */
export const SEARCH_INITIAL_MAX = 200;

/** Estado de uma busca sem consulta (editor ausente ou barra recém-aberta). */
export const RTE_SEARCH_IDLE: RteSearchState = Object.freeze({
  query: '',
  caseSensitive: false,
  wholeWord: false,
  matches: Object.freeze([]),
  total: 0,
  capped: false,
  activeIndex: -1,
  lastReplaced: null,
});

/**
 * `getSearchState` sobre a versão da ponte (K3). `null` sem editor ou sem a
 * extensão (`features.search: false`). O core devolve o mesmo objeto enquanto
 * a busca não muda, então a igualdade padrão basta.
 */
export function createSearchState(o: {
  editor: Signal<Editor | null>;
  version: Signal<number>;
}): Signal<RteSearchState | null> {
  return computed(() => {
    o.version();
    const editor = o.editor();
    return editor && !editor.isDestroyed ? getSearchState(editor) : null;
  });
}

/**
 * Consulta inicial pela seleção (K7): de 1 a 200 caracteres dentro de um
 * mesmo bloco de texto; senão, vazia.
 */
export function initialSearchQuery(editor: Editor): string {
  const { selection, doc } = editor.state;
  if (selection.empty) return '';
  const { $from, $to } = selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return '';
  const text = doc.textBetween(selection.from, selection.to);
  return text.length >= 1 && text.length <= SEARCH_INITIAL_MAX ? text : '';
}
