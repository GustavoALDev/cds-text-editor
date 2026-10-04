---
'@cds/rte-core': minor
---

`RTE_LABELS_META` (`'rtLabels'`) no entry `/extensions`: uma transação com `setMeta(RTE_LABELS_META, true)` avisa a troca de rótulos, e a vista de tarefa relê o `aria-label` do checkbox (antes só mudava ao editar a tarefa). Usado pelo `@cds/rte-angular` para trocar o idioma em tempo de execução (spec 05a, D15).
