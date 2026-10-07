import type { Editor } from '@tiptap/core';
import {
  NodeSelection,
  TextSelection,
  type EditorState,
} from '@tiptap/pm/state';
import { CellSelection, findTable, isInTable } from '@tiptap/pm/tables';
import type { Mappable } from '@tiptap/pm/transform';
import { dialogTarget } from '../dialogs/target';
import { can } from '../toolbar/can';
import { RTE_FLOATING_KINDS, type RteFloatingMenuKind } from './types';

/** Identidade do menu flutuante visível (tipo e intervalo/posição). */
export interface RteFloatingIdentity {
  readonly kind: RteFloatingMenuKind;
  readonly from: number;
  readonly to: number;
}

/** Contexto que decide qual menu flutuante mostrar. */
export interface RteFloatingContext {
  readonly kind: RteFloatingMenuKind;
  readonly identity: RteFloatingIdentity;
}

/** Sinais de interação que ocultam o menu (M5) e a identidade dispensada (M6). */
export interface RteFloatingSignals {
  /** Editor editável, visível e com o tipo ligado. */
  readonly enabled: boolean;
  /** Onde está o foco: no editável, no próprio menu flutuante ou em outro lugar. */
  readonly focus: 'editable' | 'menu' | 'other';
  /** Arrasto do ponteiro primário iniciado no editável. */
  readonly dragging: boolean;
  /** Composição de IME em curso (`view.composing`). */
  readonly composing: boolean;
  /** Pedido de diálogo em curso ou `dialog.rte-dialog[open]` no documento. */
  readonly dialog: boolean;
  /** Identidade dispensada pelo `Escape`, mapeada pelas transações. */
  readonly dismissed: RteFloatingIdentity | null;
}

const TEXT_MARK_COMMANDS = [
  'toggleBold',
  'toggleItalic',
  'toggleUnderline',
  'toggleStrike',
  'toggleCode',
] as const;

function context(
  kind: RteFloatingMenuKind,
  from: number,
  to: number,
): RteFloatingContext {
  return { kind, identity: { kind, from, to } };
}

function inCodeBlock(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  return (
    $from.parent.type.name === 'codeBlock' ||
    $to.parent.type.name === 'codeBlock'
  );
}

/**
 * `NodeSelection` de um nó de mídia (`typeName`) → o tipo `kind` com a
 * identidade `{pos, pos + nodeSize}`; vale também dentro de tabela, porque a
 * mídia vem antes de `table` na prioridade (V10, pré-voo 18).
 */
function mediaContext(
  kind: RteFloatingMenuKind,
  typeName: string,
): (editor: Editor) => RteFloatingContext | null {
  return (editor) => {
    const { selection } = editor.state;
    return selection instanceof NodeSelection &&
      selection.node.type.name === typeName
      ? context(kind, selection.from, selection.to)
      : null;
  };
}

/** Cursor dentro de um link, pela mesma regra do diálogo (borda conta, ruling 19). */
function linkContext(editor: Editor): RteFloatingContext | null {
  if (!editor.state.selection.empty) return null;
  const target = dialogTarget(editor, 'link');
  return target?.mode === 'edit'
    ? context('link', target.range.from, target.range.to)
    : null;
}

/**
 * `TextSelection` (não `AllSelection`) não vazia com algum texto (pré-voo 5),
 * fora de bloco de código e com o link ou alguma marca do menu aplicável.
 */
function textContext(editor: Editor): RteFloatingContext | null {
  const state = editor.state;
  const { selection, doc } = state;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const { from, to } = selection;
  if (!/\S/.test(doc.textBetween(from, to, '\n', '\n'))) return null;
  if (inCodeBlock(state)) return null;
  const applicable =
    dialogTarget(editor, 'link') !== null ||
    TEXT_MARK_COMMANDS.some((command) => can(editor, command));
  return applicable ? context('text', from, to) : null;
}

/**
 * Cursor dentro de tabela, `CellSelection` ou `NodeSelection` de outro nó
 * dentro de tabela (M4); seleção de texto não vazia numa célula não conta.
 * Identidade: a tabela.
 */
function tableContext(editor: Editor): RteFloatingContext | null {
  const state = editor.state;
  const { selection } = state;
  const applies =
    selection instanceof CellSelection ||
    ((selection.empty || selection instanceof NodeSelection) &&
      isInTable(state));
  if (!applies) return null;
  const table = findTable(selection.$from);
  return table
    ? context('table', table.pos, table.pos + table.node.nodeSize)
    : null;
}

const READERS: Readonly<
  Record<RteFloatingMenuKind, (editor: Editor) => RteFloatingContext | null>
> = {
  image: mediaContext('image', 'rtImage'),
  video: mediaContext('video', 'rtVideo'),
  embed: mediaContext('embed', 'rtEmbed'),
  link: linkContext,
  text: textContext,
  table: tableContext,
};

/**
 * Contexto do menu flutuante para a seleção atual (M4): o primeiro tipo
 * aplicável de `RTE_FLOATING_KINDS` (`image > video > embed > link > text >
 * table`) entre os habilitados em `kinds` (pré-voo 4); `null` se nenhum se
 * aplica.
 */
export function readFloatingContext(
  editor: Editor,
  kinds: readonly RteFloatingMenuKind[],
): RteFloatingContext | null {
  for (const kind of RTE_FLOATING_KINDS) {
    if (!kinds.includes(kind)) continue;
    const ctx = READERS[kind](editor);
    if (ctx) return ctx;
  }
  return null;
}

/** Mesmo tipo e mesmo intervalo; `null` só é igual a `null`. */
export function sameFloatingIdentity(
  a: RteFloatingIdentity | null,
  b: RteFloatingIdentity | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.from === b.from && a.to === b.to;
}

/** Tipo visível dado o contexto e os sinais (M5, M6); `null` = oculto. */
export function readFloatingKind(
  ctx: RteFloatingContext | null,
  s: RteFloatingSignals,
): RteFloatingMenuKind | null {
  if (
    !ctx ||
    !s.enabled ||
    s.focus === 'other' ||
    s.dragging ||
    s.composing ||
    s.dialog ||
    sameFloatingIdentity(ctx.identity, s.dismissed)
  ) {
    return null;
  }
  return ctx.kind;
}

/**
 * Identidade mapeada por uma transação (pré-voo 15): `from` com `assoc` 1 e
 * `to` com −1; ponta apagada → `null` (o que libera o menu).
 */
export function mapFloatingIdentity(
  id: RteFloatingIdentity,
  mapping: Mappable,
): RteFloatingIdentity | null {
  const from = mapping.mapResult(id.from, 1);
  const to = mapping.mapResult(id.to, -1);
  if (from.deleted || to.deleted) return null;
  return { kind: id.kind, from: from.pos, to: to.pos };
}
