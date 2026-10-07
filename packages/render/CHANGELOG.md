# @cds/rte-render

## 0.1.0

### Minor Changes

- 1518a21: Segurança (H8): a reaplicação dos estilos do conteúdo por CSSOM passa a usar só as propriedades de `RTE_STYLE_PROPERTIES` do core para cada _tag_, nos modos `sanitize` e `trusted`; declarações com `!important` são descartadas, e o `style` inteiro se tiver `\` ou comentário. Assim a escrita por CSSOM não reabilita, sob CSP sem `'unsafe-inline'`, CSS que o navegador barrou (`position: fixed`, `background-image`…). Em `trusted`, o CSS fora da lista é retirado no navegador também sem CSP. A base dos links de fragmento sai com uma só barra inicial (um `pathname` `//outro.host/x` não vira link protocolo-relativo).
- c65521c: Primeira versão do `@cds/rte-render`: diretiva `[rteContent]` (modos `sanitize`, com o sanitizador injetado por `provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) })`, e `trusted`, só para HTML já sanitizado pelo servidor), rolador de tabela focável quando transborda, estilos do conteúdo reaplicados por CSSOM sob CSP estrita, âncoras de fragmento que funcionam com `<base href>`, sumário `rte-toc` no entry `@cds/rte-render/toc`, `@cds/rte-render/i18n` e `styles/render.css`. Mudança que afeta a segurança: o caminho do HTML até o DOM (H6, H8, H9) está descrito em `docs/security.md`.

### Patch Changes

- Updated dependencies [90766c0]
- Updated dependencies [38158c8]
- Updated dependencies [ba05d4a]
- Updated dependencies [aa23843]
- Updated dependencies [6c3e310]
- Updated dependencies [c8dc3d6]
- Updated dependencies [9de234d]
- Updated dependencies [8725337]
- Updated dependencies [6ba6c8d]
- Updated dependencies [bec7c04]
- Updated dependencies [5f35ef7]
- Updated dependencies [84dcf69]
- Updated dependencies [bac3f07]
  - @cds/rte-core@0.1.0
  - @cds/rte-sanitizer@0.1.0
