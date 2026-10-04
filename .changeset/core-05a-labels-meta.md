---
'@cds/rte-core': minor
---

`RTE_LABELS_META` (`'rtLabels'`) no entry `/extensions`: uma transação com `setMeta(RTE_LABELS_META, true)` pede às vistas que se re-renderizem, e a vista de tarefa relê o `aria-label` do checkbox (antes só mudava ao editar a tarefa) e o seu `disabled` (útil depois de `setEditable(…, false)`, que não emite `update`). Usado pelo `@cds/rte-angular` para trocar o idioma em tempo de execução (spec 05a, D15).
