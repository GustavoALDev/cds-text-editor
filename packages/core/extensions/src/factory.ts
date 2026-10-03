import type { AnyExtension } from '@tiptap/core';
import { Link } from '@tiptap/extension-link';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { createBaseExtensions } from './base';
import { createContentExtension } from './content';
import { createExtensionContext } from './context';
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
    // Provisório: a Tarefa 5 troca pelo Link estendido com a política (B14).
    Link.configure({
      openOnClick: false,
      defaultProtocol: 'https',
      HTMLAttributes: { target: null, rel: null, class: null },
    }),
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
