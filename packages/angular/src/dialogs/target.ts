import { getMarkRange, type Editor } from '@tiptap/core';
import type { MarkType } from '@tiptap/pm/model';
import {
  AllSelection,
  NodeSelection,
  TextSelection,
  type EditorState,
  type Selection,
} from '@tiptap/pm/state';
import { isInTable } from '@tiptap/pm/tables';
import { can } from '../toolbar/can';
import { RTE_INSERT_TABLE } from '../toolbar/table-guard';
import {
  RTE_MEDIA_NODES,
  type RteDialogKind,
  type RteMediaDialogKind,
} from './types';

/**
 * Modo de um diálogo: criar algo novo, aplicar à seleção ou editar o existente.
 *
 * @internal
 */
export type RteDialogMode = 'insert' | 'apply' | 'edit';

/**
 * Alvo de um diálogo aplicável: o modo e o intervalo do documento (§4).
 *
 * @internal
 */
export interface RteDialogTarget {
  readonly mode: RteDialogMode;
  readonly range: { readonly from: number; readonly to: number };
}

function target(mode: RteDialogMode, from: number, to: number) {
  return { mode, range: { from, to } } satisfies RteDialogTarget;
}

/** Seleção de texto: `TextSelection` ou a de tudo (`AllSelection`, Ctrl+A). */
function isTextRange(selection: Selection): boolean {
  return (
    selection instanceof TextSelection || selection instanceof AllSelection
  );
}

function inCodeBlock(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  return (
    $from.parent.type.name === 'codeBlock' ||
    $to.parent.type.name === 'codeBlock'
  );
}

/**
 * Intervalo da marca em `$from` que contém a seleção inteira; senão `null`.
 * Um cursor exatamente na borda da marca (antes do 1º ou depois do último
 * caractere) conta como dentro: `getMarkRange` olha o nó depois e, sem a
 * marca nele, o nó antes; o modo é então `edit` (decisão da revisão da
 * Tarefa 2).
 */
function enclosingMark(
  state: EditorState,
  type: MarkType,
): { from: number; to: number } | null {
  const { $from, from, to } = state.selection;
  const range = getMarkRange($from, type);
  return range && range.from <= from && to <= range.to ? range : null;
}

function linkTarget(editor: Editor): RteDialogTarget | null {
  const state = editor.state;
  const { selection, schema, doc } = state;
  const link = schema.marks['link'];
  if (!link || !isTextRange(selection) || inCodeBlock(state)) {
    return null;
  }
  const code = schema.marks['code'];
  if (
    code &&
    (code.isInSet(selection.$from.marks()) ||
      doc.rangeHasMark(selection.from, selection.to, code))
  ) {
    return null;
  }
  const edit = enclosingMark(state, link);
  if (edit) return target('edit', edit.from, edit.to);
  if (!selection.empty) return target('apply', selection.from, selection.to);
  return can(editor, 'insertContent', { type: 'text', text: 'x' })
    ? target('insert', selection.from, selection.from)
    : null;
}

function langTarget(editor: Editor): RteDialogTarget | null {
  const state = editor.state;
  const { selection } = state;
  const lang = state.schema.marks['rtLang'];
  if (!lang || !isTextRange(selection) || inCodeBlock(state)) {
    return null;
  }
  const edit = enclosingMark(state, lang);
  if (edit) return target('edit', edit.from, edit.to);
  return selection.empty ? null : target('apply', selection.from, selection.to);
}

/** Seleção inteira dentro de um `rtPullquote` → `edit`; senão `null`. */
function quoteAuthorTarget(editor: Editor): RteDialogTarget | null {
  const { $from, from, to } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'rtPullquote') {
      return to <= $from.end(depth) ? target('edit', from, to) : null;
    }
  }
  return null;
}

/** Fora de tabela → `insert` no ponto de inserção (`{from, from}`). */
function tableTarget(editor: Editor): RteDialogTarget | null {
  const { from } = editor.state.selection;
  if (isInTable(editor.state)) return null;
  return can(editor, 'insertTable', RTE_INSERT_TABLE)
    ? target('insert', from, from)
    : null;
}

/**
 * Mídia (pré-voo 2): nó ausente no esquema do editor → `null` (`rtEmbed` só
 * existe com `embeds` e algum provedor); `NodeSelection` do próprio nó →
 * `edit` sobre ele; qualquer outra seleção → `insert` sobre a seleção.
 */
function mediaTarget(
  editor: Editor,
  kind: RteMediaDialogKind,
): RteDialogTarget | null {
  const { schema, selection } = editor.state;
  const type = schema.nodes[RTE_MEDIA_NODES[kind]];
  if (!type) return null;
  if (selection instanceof NodeSelection && selection.node.type === type) {
    return target(
      'edit',
      selection.from,
      selection.from + selection.node.nodeSize,
    );
  }
  return target('insert', selection.from, selection.to);
}

/**
 * Alvo do diálogo `kind` para a seleção atual, pela tabela de aplicabilidade
 * da §4 (vale para o item da barra, o `Mod-K` e `openDialog`); `null` =
 * inaplicável. Não confere se o editor é editável nem se há diálogo aberto.
 */
export function dialogTarget(
  editor: Editor,
  kind: RteDialogKind,
): RteDialogTarget | null {
  switch (kind) {
    case 'link':
      return linkTarget(editor);
    case 'lang':
      return langTarget(editor);
    case 'quoteAuthor':
      return quoteAuthorTarget(editor);
    case 'table':
      return tableTarget(editor);
    case 'image':
    case 'video':
    case 'embed':
      return mediaTarget(editor, kind);
  }
}
