---
'@cds/rte-core': minor
---

`inspectRteHtml` no entry `/html` (spec 05d1): uma passada sem DOM nem Tiptap que devolve os `href` dos links, a quantidade de títulos `h2`–`h4` vazios e `truncated` (a leitura parou por passar de 256 níveis de aninhamento; os demais campos valem só para o trecho lido). É a base dos validadores `rteSafeLinks` e `rteNoEmptyHeadings` do `@cds/rte-angular`, que tratam `truncated` como falha.
