import type { AnyExtension } from '@tiptap/core';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { createBaseExtensions } from './base';
import { createContentExtension } from './content';
import { createExtensionContext } from './context';
import { createLinkExtension } from './link';
import type { RteEditorOptions } from './types';

/**
 * Fonte única da lista de extensões (spec 03b, §6 e B18): instâncias novas a
 * cada chamada; extensões do consumidor no fim; nome repetido lança
 * `TypeError`. Opções inválidas lançam como `getHtmlSchema`.
 */
export function createEditorExtensions(
  options: RteEditorOptions = {},
): AnyExtension[] {
  const ctx = createExtensionContext(options);
  const list: AnyExtension[] = [
    createContentExtension(ctx),
    ...createBaseExtensions(ctx),
    createLinkExtension(ctx),
    UndoRedo.configure(),
    Dropcursor.configure(),
    Gapcursor.configure(),
    ...(options.extensions ?? []),
  ];
  assertUniqueNames(list);
  return list;
}

function assertUniqueNames(list: readonly AnyExtension[]): void {
  const seen = new Set<string>();
  for (const extension of list) {
    if (seen.has(extension.name)) {
      throw new TypeError(
        `Extensão com nome repetido: "${extension.name}" (cada nome só pode aparecer uma vez).`,
      );
    }
    seen.add(extension.name);
  }
}
