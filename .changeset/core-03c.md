---
'@cds/rte-core': minor
---

Extensões de produtividade do editor (spec 03c): busca e substituição literais (`rtSearch`, `getSearchState`), comandos `/` sem UI (`rtSlashCommand`, `getSlashMenuState`, `RTE_SLASH_LABELS`, `RTE_SLASH_ITEMS`), limite de caracteres só na entrada direta (`rtCharLimit`, `getCharLimitState`, opção `charLimit`), placeholder do documento e dos títulos de caixa vazios (`rtPlaceholder`, opção `placeholder`), estatísticas incrementais (`getRteTextStats`) e `countCharacters` no entry `.`. `features.search` e `features.slashCommands` passam a registrar as extensões. Nada disso chega ao HTML.
