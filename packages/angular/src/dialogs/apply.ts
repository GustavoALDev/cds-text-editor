import type { Editor } from '@tiptap/core';
import type { RteDialogRequest } from './controller';

/** Autor e cargo da citação (G15): uma cadeia, foco de volta ao editável. */
export function applyQuote(
  editor: Editor,
  req: RteDialogRequest,
  v: { author: string; role: string },
): boolean {
  return editor
    .chain()
    .focus()
    .setTextSelection(req.range)
    .updatePullquote(v)
    .run();
}
