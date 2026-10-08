---
'@cds/rte-angular': minor
---

Fechamento da API e do desempenho (spec 05d2). Relatórios do `api-extractor` por entry (`packages/angular/api/`); tipos antes não exportados que a API pública usa passam a ser exportados, e o que o consumidor não deve nomear (membros de template, ajudantes dos diálogos, contadores, upload e barra) fica `@internal`. `RteDialogController` e `RteCountValidator` seguem exportados como valor, marcados `@internal`. Sem mudança de comportamento em tempo de execução. Orçamentos de desempenho (N45/N46) e de tamanho refeitos (ADR 0016).
