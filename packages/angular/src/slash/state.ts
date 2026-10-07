import { computed, type Signal } from '@angular/core';
import {
  getSlashMenuState,
  type RteSlashMenuState,
} from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';

/** Estado fechado (editor ausente, destruído ou sem a extensão). */
export const RTE_SLASH_CLOSED: RteSlashMenuState = Object.freeze({
  open: false,
  query: '',
  range: null,
  items: Object.freeze([]),
  activeIndex: -1,
});

let counter = 0;

/** Identificador da instância, para os ids estáveis da lista e das opções (K4). */
export function nextSlashInstanceId(): string {
  counter += 1;
  return `rte-${counter}`;
}

export function slashListId(instance: string): string {
  return `${instance}-slash-list`;
}

export function slashOptionId(instance: string, itemId: string): string {
  return `${instance}-slash-${itemId}`;
}

/** Igualdade por valor: só notifica quando o menu muda de fato. */
export function sameSlashState(
  a: RteSlashMenuState,
  b: RteSlashMenuState,
): boolean {
  if (a === b) return true;
  return (
    a.open === b.open &&
    a.query === b.query &&
    a.activeIndex === b.activeIndex &&
    a.range?.from === b.range?.from &&
    a.range?.to === b.range?.to &&
    a.items.length === b.items.length &&
    a.items.every(
      (item, i) =>
        item.id === b.items[i]?.id &&
        item.title === b.items[i]?.title &&
        item.group === b.items[i]?.group,
    )
  );
}

/** `getSlashMenuState` sobre a versão da ponte (K3), igual por valor. */
export function createSlashState(o: {
  editor: Signal<Editor | null>;
  version: Signal<number>;
}): Signal<RteSlashMenuState> {
  return computed(
    () => {
      o.version();
      const editor = o.editor();
      return editor && !editor.isDestroyed
        ? getSlashMenuState(editor)
        : RTE_SLASH_CLOSED;
    },
    { equal: sameSlashState },
  );
}
