import type { AnyExtension } from '@tiptap/core';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { createBaseExtensions } from './base';
import { assertCharLimit, createCharLimitExtension } from './char-limit';
import { createCodeBlockExtension } from './code-block';
import { createColorExtensions } from './colors';
import { createContentExtension } from './content';
import { createExtensionContext } from './context';
import type { RteExtensionContext } from './context';
import { createEmbedExtension } from './embed';
import { createHighlightPlugin } from './highlight';
import { createLinkExtension } from './link';
import { createMediaExtensions } from './media';
import { createNewsBlockExtensions } from './news-blocks';
import { createPlaceholderExtension } from './placeholder';
import { createTableExtensions } from './tables';
import { createTaskExtensions } from './tasks';
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
  assertCharLimit(options.charLimit);
  const list: AnyExtension[] = [
    createContentExtension(ctx),
    ...createBaseExtensions(ctx),
    createLinkExtension(ctx),
    UndoRedo.configure(),
    Dropcursor.configure(),
    Gapcursor.configure(),
    // Recursos ligados, na ordem da spec §6, depois da base.
    ...(ctx.schema.features.includes('colors')
      ? createColorExtensions(ctx)
      : []),
    ...(ctx.schema.features.includes('code') ? [createCodeBlock(ctx)] : []),
    ...(ctx.schema.features.includes('tables')
      ? createTableExtensions(ctx)
      : []),
    ...(ctx.schema.features.includes('tasks') ? createTaskExtensions(ctx) : []),
    ...(ctx.schema.features.includes('media')
      ? createMediaExtensions(ctx)
      : []),
    // Sem provedor ativo não há iframe no esquema (R2) e o nó não existe.
    ...(ctx.schema.features.includes('embeds') && ctx.providers.length > 0
      ? [createEmbedExtension(ctx)]
      : []),
    ...(ctx.schema.features.includes('newsBlocks')
      ? createNewsBlockExtensions(ctx)
      : []),
    createPlaceholderExtension(ctx, options.placeholder),
    createCharLimitExtension(ctx, options.charLimit),
    ...(options.extensions ?? []),
  ];
  assertUniqueNames(list);
  return list;
}

/** `codeBlock` com o plugin de realce (um `lowlight` por editor, B15). */
function createCodeBlock(ctx: RteExtensionContext): AnyExtension {
  return createCodeBlockExtension(ctx).extend({
    addProseMirrorPlugins() {
      return [...(this.parent?.() ?? []), createHighlightPlugin(ctx)];
    },
  });
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
