import type { Editor } from '@tiptap/core';
// Tipos dos comandos de tabela (`insertTable`, `toggleHeaderColumn`) no `ChainedCommands`.
import type {} from '@tiptap/extension-table';
import type { Transaction } from '@tiptap/pm/state';
import { findTable } from '@tiptap/pm/tables';
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

/**
 * Tabela nova (G16): uma cadeia (um passo de desfazer, uma emissão) com
 * `insertTable`, a coluna de cabeçalho quando pedida e o `scope` dos `th`
 * (pré-voo 1).
 */
export function applyTable(
  editor: Editor,
  req: RteDialogRequest,
  v: { rows: number; cols: number; headerRow: boolean; headerColumn: boolean },
): boolean {
  let chain = editor
    .chain()
    .focus()
    .setTextSelection(req.range)
    .insertTable({ rows: v.rows, cols: v.cols, withHeaderRow: v.headerRow });
  if (v.headerColumn) chain = chain.toggleHeaderColumn();
  return chain.command(({ tr }) => setHeaderScopes(tr, v.headerRow)).run();
}

/**
 * Na tabela da seleção (a recém-inserida, sem células mescladas): com linha
 * de cabeçalho, os `th` da 1ª linha → `scope="col"`; os demais `th` da 1ª
 * coluna → `scope="row"`.
 */
function setHeaderScopes(tr: Transaction, headerRow: boolean): boolean {
  const table = findTable(tr.selection.$from);
  if (!table) return false;
  const updates: { pos: number; scope: 'col' | 'row' }[] = [];
  table.node.forEach((row, rowOffset, rowIndex) => {
    row.forEach((cell, cellOffset, colIndex) => {
      if (cell.type.name !== 'tableHeader') return;
      if (rowIndex > 0 && colIndex > 0) return;
      updates.push({
        pos: table.start + rowOffset + 1 + cellOffset,
        scope: rowIndex === 0 && headerRow ? 'col' : 'row',
      });
    });
  });
  for (const { pos, scope } of updates) {
    const cell = tr.doc.nodeAt(pos);
    if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, scope });
  }
  return true;
}
