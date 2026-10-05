import type { Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  findTable,
  isInTable,
  mergeCells,
} from '@tiptap/pm/tables';

/** Maior `colspan`/`rowspan` aceito pelo esquema (U14). */
export const RTE_SPAN_LIMIT = 100;

/** Operações do menu de tabela (§4). */
export type RteTableOp =
  | 'insertTable'
  | 'addRowBefore'
  | 'addRowAfter'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteRow'
  | 'deleteColumn'
  | 'mergeCells'
  | 'splitCell'
  | 'toggleHeaderRow'
  | 'toggleHeaderColumn'
  | 'deleteTable';

/** Operações que podem aumentar um `colspan`/`rowspan`. */
export type RteGrowingTableOp =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'mergeCells';

export const RTE_TABLE_OPS: readonly RteTableOp[] = Object.freeze([
  'insertTable',
  'addRowBefore',
  'addRowAfter',
  'addColumnBefore',
  'addColumnAfter',
  'deleteRow',
  'deleteColumn',
  'mergeCells',
  'splitCell',
  'toggleHeaderRow',
  'toggleHeaderColumn',
  'deleteTable',
]);

/** Argumentos fixos do `insertTable` da barra. */
export const RTE_INSERT_TABLE = Object.freeze({
  rows: 3,
  cols: 3,
  withHeaderRow: true,
});

const GROWING: Readonly<
  Record<
    RteGrowingTableOp,
    (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean
  >
> = Object.freeze({
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  mergeCells,
});

function isGrowing(op: RteTableOp): op is RteGrowingTableOp {
  return Object.hasOwn(GROWING, op);
}

/**
 * Sonda de teste (M16, pré-voo 16): quantos ensaios rodaram. Só conta em
 * desenvolvimento (`ngDevMode` some no build de produção).
 */
export const tableGuardProbe = { rehearsals: 0 };

/**
 * Ensaio (pré-voo 13): roda o comando do `prosemirror-tables` contra o estado
 * com um `dispatch` que só guarda a transação; nada é aplicado.
 */
function rehearse(
  state: EditorState,
  op: RteGrowingTableOp,
): Transaction | null {
  if (typeof ngDevMode !== 'undefined' && ngDevMode) {
    tableGuardProbe.rehearsals += 1;
  }
  let captured: Transaction | null = null;
  GROWING[op](state, (tr) => {
    captured = tr;
  });
  return captured;
}

function tableHasSpanOverLimit(tr: Transaction): boolean {
  const table = findTable(tr.selection.$from);
  if (!table) return false;
  let over = false;
  table.node.forEach((row) => {
    row.forEach((cell) => {
      const colspan = cell.attrs['colspan'] as unknown;
      const rowspan = cell.attrs['rowspan'] as unknown;
      if (
        (typeof colspan === 'number' && colspan > RTE_SPAN_LIMIT) ||
        (typeof rowspan === 'number' && rowspan > RTE_SPAN_LIMIT)
      ) {
        over = true;
      }
    });
  });
  return over;
}

/**
 * `true` se a operação, aplicada ao estado, deixaria alguma célula da tabela
 * da seleção com `colspan`/`rowspan` > 100 (U14); sem transação, `false`.
 */
export function exceedsSpanLimit(
  state: EditorState,
  op: RteGrowingTableOp,
): boolean {
  const tr = rehearse(state, op);
  return tr !== null && tableHasSpanOverLimit(tr);
}

export interface RteTableOpState {
  readonly enabled: boolean;
  /** Bloqueada pela guarda de `colspan`/`rowspan` (motivo `spanLimit`). */
  readonly spanLimited: boolean;
}

type CanCommands = Record<
  string,
  ((...args: unknown[]) => boolean) | undefined
>;

function can(editor: Editor, op: RteTableOp): boolean {
  const commands = editor.can() as unknown as CanCommands;
  const command = commands[op];
  if (typeof command !== 'function') return false;
  return op === 'insertTable' ? command(RTE_INSERT_TABLE) : command();
}

const OFF: RteTableOpState = Object.freeze({
  enabled: false,
  spanLimited: false,
});
const ON: RteTableOpState = Object.freeze({
  enabled: true,
  spanLimited: false,
});
const LIMITED: RteTableOpState = Object.freeze({
  enabled: false,
  spanLimited: true,
});

/**
 * Estado de uma operação de tabela: `insertTable` só fora de tabela; as
 * demais só dentro, com `can()` e, nas que crescem, a guarda (U14). Ensaia
 * só a operação pedida.
 */
export function readTableOpState(
  editor: Editor,
  op: RteTableOp,
): RteTableOpState {
  const { state } = editor;
  const inTable = isInTable(state);
  if (op === 'insertTable') return !inTable && can(editor, op) ? ON : OFF;
  if (!inTable) return OFF;
  if (isGrowing(op)) {
    const tr = rehearse(state, op);
    return tr === null ? OFF : tableHasSpanOverLimit(tr) ? LIMITED : ON;
  }
  return can(editor, op) ? ON : OFF;
}

/**
 * Estado de todas as operações do menu de tabela ({@link readTableOpState}).
 * Ensaia as operações que crescem: chame só com o menu aberto.
 */
export function readTableMenuState(
  editor: Editor,
): Readonly<Record<RteTableOp, RteTableOpState>> {
  const out = {} as Record<RteTableOp, RteTableOpState>;
  for (const op of RTE_TABLE_OPS) out[op] = readTableOpState(editor, op);
  return Object.freeze(out);
}
