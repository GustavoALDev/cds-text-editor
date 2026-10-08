---
'@cds/rte-sanitizer': patch
---

Segurança (R9): documentado e testado que `maxInputLength` vale para a entrada (a saída pode ser maior; o servidor deve recusar saída acima do que guarda); novas propriedades de fuzz (custo linear, comprimento, URL e atributos). `linkPolicy.protocols`/`allowRelative` agora chegam ao sanitizador (via `@cds/rte-core`).
