# @cds/rte-sanitizer

## 0.1.0

### Minor Changes

- bac3f07: Sanitizador (spec 04): `@cds/rte-sanitizer` com `sanitizeRichText`, `createSanitizer`, `RteSanitizeError` e `SANITIZER_VERSION`, uma engine própria e pura sobre o `htmlparser2`, igual em Node e no navegador, que devolve só o que o esquema do core aceita, na forma canônica do editor (limites `maxInputLength` e `maxDepth`, este de 1 a 512). O core ganha os interpretadores do esquema no entry `.`: `getElementSpec`, `sanitizeClass`, `sanitizeAttributes`, `hasRequiredChild`, `escapeHtmlText` e `escapeHtmlAttribute`. Mudança que afeta a segurança (§8/spec 09): `sanitizeStyle` passa a descartar a declaração cujo valor tem `(` ou `@` (`url(`, `image-set(`, `@import`) e `serializeTokens` separa e apara tokens só por espaço ASCII, como o HTML; `getHtmlSchema` recusa `ensureTokens` cujo alvo não é uma regra de tokens.

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
