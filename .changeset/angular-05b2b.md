---
'@cds/rte-angular': minor
---

Menus flutuantes (spec 05b2b): `rte-editor` ganha os menus contextuais de texto, link (abrir, editar, remover), tabela (com a guarda de `colspan`/`rowspan` > 100) e imagem (alinhamento e remoção), em `popover="manual"` dentro do host, posicionados por função pura, sem tirar o foco do editável e carregados sob demanda por `@defer` (chunk `rte-floating-menus`). Configuração `floatingMenus` na entrada e em `provideRichText` (mescla por chave), `Alt+F10` com prioridade para o menu visível, `Escape` que o oculta, método `focusFloatingMenu()`, seção `floating` dos rótulos (pt-BR, en e es), tipos `RteFloatingMenuKind`, `RteFloatingMenusConfig` e `RteFloatingMenuLabels` e classes `.rte-floating*` no `editor.css`.
