---
'@cds/rte-render': minor
---

Primeira versão do `@cds/rte-render`: diretiva `[rteContent]` (modos `sanitize`, com o sanitizador injetado por `provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) })`, e `trusted`, só para HTML já sanitizado pelo servidor), rolador de tabela focável quando transborda, estilos do conteúdo reaplicados por CSSOM sob CSP estrita, âncoras de fragmento que funcionam com `<base href>`, sumário `rte-toc` no entry `@cds/rte-render/toc`, `@cds/rte-render/i18n` e `styles/render.css`. Mudança que afeta a segurança: o caminho do HTML até o DOM (H6, H8, H9) está descrito em `docs/security.md`.
