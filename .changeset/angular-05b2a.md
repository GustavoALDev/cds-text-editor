---
'@cds/rte-angular': minor
---

Diálogos de link, idioma, autor da citação e tabela nova (spec 05b2a): `<dialog>` nativo modal dentro do host, carregado por `@defer` num _chunk_ separado (`fesm2022/cds-rte-angular-rte-dialogs-<hash>.mjs`, `prefetch on idle`), com formulários em Signal Forms. Novos itens da barra `link`, `lang` e `quoteAuthor`, entrada "Inserir tabela…" (`insertTableCustom`) no menu `table`, atalho `Mod-K`, seleção pendente (`.rte-pending-selection`) e `RteEditor.openDialog(kind)`, com `RteDialogKind` e `RTE_DIALOG_LANGUAGES`. O link usa a mesma `linkPolicy` do editor. Presets: `link` em `minimal`, `article` e `full`; `lang` e `quoteAuthor` no `full`. Nova seção `dialogs` em `RteLabels` (pt-BR/en/es) e chaves novas em `toolbar`; o rótulo `insertTable` passa a "Insert table 3 × 3". Classes `.rte-dialog*` no `editor.css`. A lib não trava a rolagem da página: use `:root:has(.rte-dialog[open]) { overflow: hidden }` no CSS do consumidor.
