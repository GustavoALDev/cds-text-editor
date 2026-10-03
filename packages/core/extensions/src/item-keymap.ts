import type { Editor, KeyboardShortcutCommand } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { canSplit } from '@tiptap/pm/transform';

/**
 * Troca os itens `first`–`last` da lista de profundidade `depth` (em `$pos`)
 * por parágrafos com o mesmo conteúdo, dividindo a lista ao redor deles;
 * partes vazias da lista somem. Devolve o deslocamento das posições dentro
 * dos itens trocados (cada parágrafo tem o tamanho do item) ou `null` se o
 * resultado não cabe no pai da lista.
 */
export function itemsToParagraphs(
  tr: Transaction,
  $pos: ResolvedPos,
  depth: number,
  first: number,
  last: number,
): number | null {
  const paragraph = tr.doc.type.schema.nodes['paragraph'];
  if (!paragraph || depth < 1) return null;
  const list = $pos.node(depth);
  const blocks: ProseMirrorNode[] = [];
  let before = 0;
  let end = 0;
  list.forEach((item, offset, index) => {
    if (index === first) before = offset;
    if (index === last) end = offset + item.nodeSize;
    if (index >= first && index <= last) {
      const block = paragraph.createAndFill(null, item.content);
      if (block) blocks.push(block);
    }
  });
  if (blocks.length !== last - first + 1) return null;
  const parts: ProseMirrorNode[] = [];
  if (first > 0) parts.push(list.copy(list.content.cut(0, before)));
  parts.push(...blocks);
  if (last < list.childCount - 1) parts.push(list.copy(list.content.cut(end)));
  const fragment = Fragment.from(parts);
  const at = $pos.index(depth - 1);
  if (!$pos.node(depth - 1).canReplace(at, at + 1, fragment)) return null;
  tr.replaceWith($pos.before(depth), $pos.after(depth), fragment);
  // O 1º parágrafo começa 1 depois do item (fecha a lista anterior) ou 1
  // antes (some a abertura da lista).
  return first > 0 ? 1 : -1;
}

/**
 * Teclado de item de lista de bloco de texto (spec 03b, §6), usado pelas
 * tarefas e pelo "Leia também": `Enter` divide (o item novo sai com os
 * atributos padrão), `Enter` em item vazio sai da lista para um parágrafo e
 * `Backspace` no início transforma o item em parágrafo, dividindo a lista.
 */
export function createItemKeymap(
  itemType: string,
): Record<string, KeyboardShortcutCommand> {
  const toParagraph = (editor: Editor): boolean => {
    const { $from } = editor.state.selection;
    const depth = $from.depth - 1;
    const index = $from.index(depth);
    const tr = editor.state.tr;
    const shift = itemsToParagraphs(tr, $from, depth, index, index);
    if (shift === null) return false;
    tr.setSelection(TextSelection.create(tr.doc, $from.start() + shift));
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  };
  return {
    Enter: ({ editor }) => {
      const { selection } = editor.state;
      const { $from, $to } = selection;
      if ($from.parent.type.name !== itemType || !$from.sameParent($to)) {
        return false;
      }
      if (selection.empty && $from.parent.content.size === 0) {
        return toParagraph(editor);
      }
      const tr = editor.state.tr.deleteSelection();
      const $pos = tr.selection.$from;
      if ($pos.parentOffset === 0 && $pos.parent.content.size > 0) {
        // No início: item novo com os atributos padrão antes; o item atual
        // (e os seus atributos) continua com o cursor.
        const empty = $pos.parent.type.createAndFill();
        if (!empty) return false;
        tr.insert($pos.before(), empty);
        editor.view.dispatch(tr.scrollIntoView());
        return true;
      }
      const pos = $pos.pos;
      const types = [{ type: $from.parent.type, attrs: null }];
      if (!canSplit(tr.doc, pos, 1, types)) return false;
      const marks = editor.state.storedMarks ?? tr.selection.$from.marks();
      tr.split(pos, 1, types).ensureMarks(marks);
      editor.view.dispatch(tr.scrollIntoView());
      return true;
    },
    Backspace: ({ editor }) => {
      const { selection } = editor.state;
      const { $from } = selection;
      if (
        !selection.empty ||
        $from.parent.type.name !== itemType ||
        $from.parentOffset !== 0
      ) {
        return false;
      }
      return toParagraph(editor);
    },
  };
}
