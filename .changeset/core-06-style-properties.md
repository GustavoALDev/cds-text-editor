---
'@cds/rte-core': minor
---

Nova constante `RTE_STYLE_PROPERTIES` (entry `/`): as propriedades CSS que o esquema emite em `style`, por _tag_ (`text-align` em `p`/`h2`–`h4`, `width` em `col`, `aspect-ratio` em `iframe`, `color` em `span`, `background-color` em `mark`), congelada e conferida por teste contra `getHtmlSchema` com todos os recursos. Usada pelo `@cds/rte-render` para reaplicar por CSSOM só o que o esquema permite.
