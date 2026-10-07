---
'@cds/rte-render': minor
---

Segurança (H8): a reaplicação dos estilos do conteúdo por CSSOM passa a usar só as propriedades de `RTE_STYLE_PROPERTIES` do core para cada _tag_, nos modos `sanitize` e `trusted`; declarações com `!important` são descartadas, e o `style` inteiro se tiver `\` ou comentário. Assim a escrita por CSSOM não reabilita, sob CSP sem `'unsafe-inline'`, CSS que o navegador barrou (`position: fixed`, `background-image`…). Em `trusted`, o CSS fora da lista é retirado no navegador também sem CSP. A base dos links de fragmento sai com uma só barra inicial (um `pathname` `//outro.host/x` não vira link protocolo-relativo).
