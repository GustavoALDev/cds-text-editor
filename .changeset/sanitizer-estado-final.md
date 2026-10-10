---
'@comodeviaser/rte-sanitizer': minor
---

Primeira versão do `@comodeviaser/rte-sanitizer`: `sanitizeRichText`, `createSanitizer` e `RteSanitizeError`, uma engine própria e pura sobre o `htmlparser2`, igual em Node e no navegador, sem Angular e sem DOM. Devolve só o que o esquema do `@comodeviaser/rte-core` aceita, na forma canônica do editor. `createSanitizer(opçõesDoEditor)` aplica as mesmas opções do editor (inclusive `linkPolicy.protocols` e `linkPolicy.allowRelative`, que chegam ao sanitizador pelo esquema do core). Limites: `maxInputLength` e `maxDepth` (de 1 a 512).

**Requisitos.** `@comodeviaser/rte-core` é dependência exata (versão igual à do pacote, versionados juntos); `htmlparser2` é dependência. Não há constante de versão exportada: leia a versão do `package.json`.

**Segurança.** É a barreira para HTML que não passou pelo editor (colado, importado, vindo do servidor): tags, atributos, classes, URLs e `style` fora do esquema são descartados. `maxInputLength` vale para a entrada; a saída pode ser maior, então o servidor deve recusar saída acima do que guarda. Coberto por propriedades de fuzz (custo linear, comprimento, URL e atributos).
