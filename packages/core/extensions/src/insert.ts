import type { Command } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { Selection } from '@tiptap/pm/state';

/** Faixa a substituir: o parágrafo vazio do cursor, se o pai aceitar o nó. */
function emptyParagraph(
  selection: Selection,
  node: ProseMirrorNode,
): [number, number] | null {
  const { $from, empty } = selection;
  const parent = $from.parent;
  if (!empty || $from.depth < 1) return null;
  if (parent.type.name !== 'paragraph' || parent.content.size > 0) return null;
  const index = $from.index($from.depth - 1);
  if (!$from.node(-1).canReplaceWith(index, index + 1, node.type)) return null;
  return [$from.before(), $from.after()];
}

/**
 * Ponto de inserção: na posição da seleção, se ela estiver entre blocos
 * (seleção de nó, cursor de lacuna); senão depois do bloco do fim da seleção,
 * subindo até um pai que aceite o nó.
 */
function insertionPoint(
  selection: Selection,
  node: ProseMirrorNode,
): number | null {
  const $to = selection.$to;
  if (!$to.parent.isTextblock) {
    const index = $to.index();
    if ($to.parent.canReplaceWith(index, index, node.type)) return $to.pos;
  }
  for (let depth = $to.depth; depth > 0; depth -= 1) {
    const $after = $to.doc.resolve($to.after(depth));
    const index = $after.index();
    if ($after.parent.canReplaceWith(index, index, node.type)) {
      return $after.pos;
    }
  }
  return null;
}

/**
 * Posição do nó recém-inserido (lição 14): o primeiro do mesmo tipo e `src`
 * mais perto de `near`, em vez de confiar na posição de inserção.
 */
function findInserted(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  near: number,
): number | null {
  const src: unknown = node.attrs['src'];
  let best: number | null = null;
  doc.descendants((child, pos) => {
    if (child.type !== node.type || child.attrs['src'] !== src) return true;
    if (best === null || Math.abs(pos - near) < Math.abs(best - near)) {
      best = pos;
    }
    return false;
  });
  return best;
}

/**
 * Insere um bloco atômico (lição 14): o parágrafo vazio do cursor é
 * substituído; senão o nó entra depois do bloco. O nó inserido fica
 * selecionado (`NodeSelection`).
 */
export function replaceEmptyParagraphWith(node: ProseMirrorNode): Command {
  return ({ tr, dispatch }) => {
    const range = emptyParagraph(tr.selection, node);
    const at = range ? range[0] : insertionPoint(tr.selection, node);
    if (at === null) return false;
    if (!dispatch) return true;
    tr.replaceWith(at, range ? range[1] : at, node);
    const pos = findInserted(tr.doc, node, at);
    if (pos !== null) tr.setSelection(NodeSelection.create(tr.doc, pos));
    tr.scrollIntoView();
    return true;
  };
}
