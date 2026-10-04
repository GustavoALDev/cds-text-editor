---
'@cds/rte-core': patch
---

O alinhamento (`text-align` de `p` e títulos) passa a ser lido do atributo `style`, não do CSSOM: com CSP `style-src` sem `'unsafe-inline'`, o Chromium mantém o atributo no documento do `DOMParser` mas deixa `element.style` vazio, e o alinhamento se perdia ao carregar conteúdo no editor (spec 05a, N5).
