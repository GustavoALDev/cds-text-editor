---
'@cds/rte-core': minor
---

Extensões de conteúdo do editor (spec 03b): entry `/extensions` com as extensões Tiptap que produzem o HTML do esquema, a fábrica `createEditorExtensions`, o serializador canônico sem DOM (`getRteHtml`, `serializeRteHtml`, `getRteHeadings`) e os rótulos `RTE_CONTENT_LABELS`; entry `/code-languages` com 24 linguagens de código carregadas sob demanda (`RTE_CODE_LANGUAGES`, `defineCodeLanguage`); `isAllowedClass` no entry `.` e `validateHtml` no entry `/html`. Os pacotes `@tiptap/*` (3.31.4), `lowlight` e `highlight.js` são `peerDependencies` opcionais. Correções: `srcPattern` de provedor sem quantificador logo depois da barra do host e altura derivada do embed limitada a 1–10000.
