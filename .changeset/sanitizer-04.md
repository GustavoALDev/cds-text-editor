---
'@cds/rte-sanitizer': minor
'@cds/rte-core': minor
---

Sanitizador (spec 04): `@cds/rte-sanitizer` com `sanitizeRichText`, `createSanitizer`, `RteSanitizeError` e `SANITIZER_VERSION`, uma engine própria e pura sobre o `htmlparser2`, igual em Node e no navegador, que devolve só o que o esquema do core aceita, na forma canônica do editor (limites `maxInputLength` e `maxDepth`, este de 1 a 512). O core ganha os interpretadores do esquema no entry `.`: `getElementSpec`, `sanitizeClass`, `sanitizeAttributes`, `hasRequiredChild`, `escapeHtmlText` e `escapeHtmlAttribute`. Mudança que afeta a segurança (§8/spec 09): `sanitizeStyle` passa a descartar a declaração cujo valor tem `(` ou `@` (`url(`, `image-set(`, `@import`) e `serializeTokens` separa e apara tokens só por espaço ASCII, como o HTML; `getHtmlSchema` recusa `ensureTokens` cujo alvo não é uma regra de tokens.
