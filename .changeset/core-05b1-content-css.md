---
'@cds/rte-core': minor
'@cds/rte-angular': minor
---

CSS de conteúdo compartilhado (spec 05b1, U16 e U17): `@cds/rte-core/styles/content.css` (camada `rte.content`, seletores sob `.rte-content`) com a aparência dos blocos `rt-*`, tabelas, `pre` e as cores da paleta no claro e no escuro (`--rte-content-color`/`--rte-content-highlight`; `!important` só nessas duas declarações). O `editor.css` do `@cds/rte-angular` passa a ter só o funcional da edição: incluir `theme.css`, `content.css` e `editor.css`, nessa ordem. O core passa a publicar a pasta `styles` e `sideEffects` inclui `**/*.css`.
