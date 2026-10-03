import { Extension } from '@tiptap/core';
import type { RteHtmlSchema } from '../../src/schema/types';
import type { RteExtensionContext } from './context';
import type { RteContentLabels } from './types';

/** Armazenamento `editor.storage.rtContent`, lido por `getRteHtml`. */
export interface RteContentStorage {
  schema: RteHtmlSchema;
  idPrefix: string;
  /** Rótulos resolvidos a cada chamada (lição 4). */
  labels(): RteContentLabels;
}

declare module '@tiptap/core' {
  interface Storage {
    rtContent: RteContentStorage;
  }
}

/** Extensão interna `rtContent`: guarda esquema, prefixo e rótulos. */
export function createContentExtension(ctx: RteExtensionContext) {
  return Extension.create<Record<string, never>, RteContentStorage>({
    name: 'rtContent',
    addStorage() {
      return {
        schema: ctx.schema,
        idPrefix: ctx.idPrefix,
        labels: ctx.labels,
      };
    },
  });
}
