/**
 * Largura mínima de uma coluna sem largura própria, em px: a padrão do Tiptap
 * (`cellMinWidth` da extensão de tabela), usada também pelo editor.
 */
export const RTE_TABLE_CELL_MIN_WIDTH = 25;

/** Dimensão da tabela equivalente à da edição (o `TableView` do Tiptap). */
export type RteTableSizing = { width: number } | { minWidth: number };

/**
 * Dimensão de uma tabela a partir das larguras das colunas (`col` do
 * `colgroup`, uma entrada por coluna, `null` = sem largura), como o
 * `TableView` do Tiptap faz na edição (spec 06, H20/R6): todas com largura →
 * `width` = soma; algumas → `minWidth` = soma + `cellMinWidth` × colunas sem
 * largura; nenhuma (ou sem colunas) → `null` (a tabela segue o layout
 * automático).
 */
export function getTableSizing(
  widths: readonly (number | null)[],
  cellMinWidth: number = RTE_TABLE_CELL_MIN_WIDTH,
): RteTableSizing | null {
  let total = 0;
  let unset = 0;
  for (const w of widths) {
    if (w === null) unset++;
    else total += w;
  }
  if (unset === widths.length) return null;
  return unset === 0
    ? { width: total }
    : { minWidth: total + cellMinWidth * unset };
}

/** Largura de um `col` (`"200px"`): inteiro positivo em px; qualquer outra coisa → `null`. */
export function parseColWidth(value: string | null | undefined): number | null {
  const m = /^\s*([1-9]\d*)px\s*$/.exec(value ?? '');
  return m ? Number(m[1]) : null;
}
