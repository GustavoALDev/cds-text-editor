import type { Editor, KeyboardShortcutCommand } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { canSplit } from '@tiptap/pm/transform';

/** Opções de `itemsToParagraphs` e `createItemKeymap`. */
export interface ItemsToParagraphsOptions {
  /**
   * Quando o contêiner da lista (o "Leia também") some, o que fica de cada
   * filho dele além da lista (o título): um bloco ou `null` (descartado,
   * o padrão).
   */
  orphan?: (node: ProseMirrorNode) => ProseMirrorNode | null;
  /**
   * Liga a divisão do contêiner quando o pai da lista não aceita parágrafos
   * (só o "Leia também"); desligada, o resultado é `null`.
   */
  splitContainer?: boolean;
}

/**
 * Troca os itens `first`–`last` da lista de profundidade `depth` (em `$pos`)
 * por parágrafos com o mesmo conteúdo, dividindo a lista ao redor deles;
 * partes vazias da lista somem. Se o pai da lista não aceita parágrafos e
 * `splitContainer` está ligado (o "Leia também"), divide o contêiner: a parte de antes fica com os outros
 * filhos (o título), a de depois recebe os que a expressão de conteúdo exige
 * (título vazio); sem itens antes, os outros filhos vão com a parte de
 * depois; sem nenhuma parte, passam por `orphan`. Devolve o deslocamento
 * das posições dentro dos itens trocados (cada parágrafo tem o tamanho do
 * item) ou `null` se o resultado não cabe.
 */
export function itemsToParagraphs(
  tr: Transaction,
  $pos: ResolvedPos,
  depth: number,
  first: number,
  last: number,
  options: ItemsToParagraphsOptions = {},
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
  const head = first > 0 ? list.copy(list.content.cut(0, before)) : null;
  const tail =
    last < list.childCount - 1 ? list.copy(list.content.cut(end)) : null;
  // Conteúdo do primeiro item trocado, antes da troca.
  const itemStart = $pos.start(depth) + before + 1;
  const replace = (level: number, parts: ProseMirrorNode[]): number | null => {
    const fragment = Fragment.from(parts);
    const at = $pos.index(level - 1);
    if (!$pos.node(level - 1).canReplace(at, at + 1, fragment)) return null;
    const from = $pos.before(level);
    tr.replaceWith(from, $pos.after(level), fragment);
    let offset = 0;
    for (const part of parts) {
      if (part === blocks[0]) break;
      offset += part.nodeSize;
    }
    return from + offset + 1 - itemStart;
  };
  const direct = replace(depth, [
    ...(head ? [head] : []),
    ...blocks,
    ...(tail ? [tail] : []),
  ]);
  if (direct !== null || depth < 2 || !options.splitContainer) return direct;
  // Contêiner que só aceita a lista: divide o contêiner.
  const box = $pos.node(depth - 1);
  const listIndex = $pos.index(depth - 1);
  const withList = (part: ProseMirrorNode) =>
    box.copy(box.content.replaceChild(listIndex, part));
  const parts: ProseMirrorNode[] = [];
  if (head) parts.push(withList(head));
  else if (!tail) {
    box.forEach((child, _offset, index) => {
      if (index === listIndex) return;
      const kept = options.orphan?.(child) ?? null;
      if (kept) parts.push(kept);
    });
  }
  parts.push(...blocks);
  if (tail) {
    const rest = head
      ? box.type.createAndFill(box.attrs, Fragment.from(tail))
      : withList(tail);
    if (!rest) return null;
    parts.push(rest);
  }
  return replace(depth - 1, parts);
}

/**
 * Teclado de item de lista de bloco de texto (spec 03b, §6), usado pelas
 * tarefas e pelo "Leia também": `Enter` divide (o item novo sai com os
 * atributos padrão), `Enter` em item vazio sai da lista para um parágrafo e
 * `Backspace` no início transforma o item em parágrafo, dividindo a lista
 * (ou o contêiner dela, ver `itemsToParagraphs`).
 */
export function createItemKeymap(
  itemType: string,
  options: ItemsToParagraphsOptions = {},
): Record<string, KeyboardShortcutCommand> {
  const toParagraph = (editor: Editor): boolean => {
    const { $from } = editor.state.selection;
    const depth = $from.depth - 1;
    const index = $from.index(depth);
    const tr = editor.state.tr;
    const shift = itemsToParagraphs(tr, $from, depth, index, index, options);
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
