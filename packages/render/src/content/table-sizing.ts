import { getTableSizing, parseColWidth } from '@comodeviaser/rte-core';
import { RTE_TABLE_SIZED_CLASS } from '../prepare-html';

/**
 * Dá a cada `table.rte-table--sized` de `root` a dimensão que a edição dá (o `TableView` do
 * Tiptap; spec 06, H20/R6): `width` com todas as colunas definidas, `min-width` com algumas
 * (`getTableSizing` do core). As larguras vêm do CSSOM dos `col` do próprio `colgroup`, já
 * reaplicado pela H8 a partir do HTML preparado (por isso vale também com o atributo bloqueado
 * pela CSP). Escreve por CSSOM, só no navegador, depois da reaplicação. Devolve quantas
 * tabelas dimensionou.
 */
export function applyTableSizing(root: Element): number {
  let count = 0;
  for (const table of root.querySelectorAll<HTMLTableElement>(
    `table.${RTE_TABLE_SIZED_CLASS}`,
  )) {
    const widths = [
      ...table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'),
    ].map((col) => parseColWidth(col.style.width));
    const sizing = getTableSizing(widths);
    if (!sizing) continue;
    if ('width' in sizing) {
      table.style.width = `${sizing.width}px`;
      table.style.minWidth = '';
    } else {
      table.style.width = '';
      table.style.minWidth = `${sizing.minWidth}px`;
    }
    count++;
  }
  return count;
}
