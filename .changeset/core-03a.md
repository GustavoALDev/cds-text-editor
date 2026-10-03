---
'@cds/rte-core': minor
---

Esquema do HTML, embeds e utilitários puros do core (spec 03a): `getHtmlSchema` (contrato do HTML como dados congelados e serializáveis, com `matchesRule`, `isAllowedUrl`, `sanitizeStyle` e `serializeTokens` para interpretá-lo), paleta fixa de cores, `normalizeHref`/`getLinkAttributes`, `slugify`/`createHeadingIds`, `countWords`/`readingTime`, `computeResize`/`parseSrcset`/`formatSrcset` e `createDraftStore`; entry `/embeds` com `toEmbed` e os provedores YouTube, Vimeo e Spotify; entry `/html` com `htmlToText` e `extractToc` sem DOM (nova dependência `htmlparser2`).
