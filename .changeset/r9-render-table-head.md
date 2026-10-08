---
'@cds/rte-render': patch
---

Segurança (R9): `prepareRteHtml` deixa de ter custo quadrático com milhares de tabelas com `caption` e sem `colgroup`, e a classe `rte-table--sized` não vai mais para a tabela errada (a busca do `colgroup` não atravessa mais o `</caption>`).
