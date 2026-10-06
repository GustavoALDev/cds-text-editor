import type { Command } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { Selection, Transaction } from '@tiptap/pm/state';

/** O que as regras de inserção leem da seleção (ou de uma posição `at`). */
export type InsertionTarget = Pick<Selection, '$from' | '$to' | 'empty'>;

/** Faixa a substituir: o parágrafo vazio do cursor, se o pai aceitar o nó. */
export function emptyParagraph(
  selection: InsertionTarget,
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
export function insertionPoint(
  selection: InsertionTarget,
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

/** Alvo das regras: a seleção, ou `at` (inteiro, dentro do documento). */
function targetOf(
  tr: Transaction,
  at: number | undefined,
): InsertionTarget | null {
  if (at === undefined) return tr.selection;
  if (!Number.isInteger(at) || at < 0 || at > tr.doc.content.size) return null;
  const $at = tr.doc.resolve(at);
  return { $from: $at, $to: $at, empty: true };
}

/**
 * Insere um bloco atômico (lição 14): o parágrafo vazio do cursor é
 * substituído; senão o nó entra depois do bloco. O nó inserido fica
 * selecionado (`NodeSelection`).
 *
 * Com `at` (05c2a E9), as mesmas regras usam essa posição em vez da seleção,
 * e a inserção é de fundo: a seleção só é mapeada e nada rola (quem chama
 * decide). `at` não inteiro ou fora de `[0, doc.content.size]` → `false`.
 */
export function replaceEmptyParagraphWith(
  node: ProseMirrorNode,
  at?: number,
): Command {
  return ({ tr, dispatch }) => {
    const target = targetOf(tr, at);
    if (!target) return false;
    const range = emptyParagraph(target, node);
    const from = range ? range[0] : insertionPoint(target, node);
    if (from === null) return false;
    if (!dispatch) return true;
    tr.replaceWith(from, range ? range[1] : from, node);
    if (at !== undefined) return true;
    const pos = findInserted(tr.doc, node, from);
    if (pos !== null) tr.setSelection(NodeSelection.create(tr.doc, pos));
    tr.scrollIntoView();
    return true;
  };
}
