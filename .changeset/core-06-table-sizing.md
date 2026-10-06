---
'@cds/rte-core': minor
---

`getTableSizing(larguras, cellMinWidth?)`, `parseColWidth` e `RTE_TABLE_CELL_MIN_WIDTH` (25, o padrão do Tiptap, agora explícito na extensão de tabela): a dimensão que a edição dá a uma tabela com larguras de coluna (`width` = soma com todas definidas; `min-width` = soma + mínimo × colunas sem largura), para a exibição reproduzir (spec 06, H20). `content.css`: `table.rte-table--sized` com `table-layout: fixed` (classe só da exibição).
