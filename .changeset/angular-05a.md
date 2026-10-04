---
'@cds/rte-angular': minor
---

Primeira versão do `@cds/rte-angular` (spec 05a): componente `rte-editor` sem barra de ferramentas (`RteEditor`, `provideRichText`, `RTE_LABELS`, `RTE_LABELS_EN`) com ponte Tiptap → signals, `[(value)]` com HTML canônico, Signal Forms (`[formField]`) e Reactive/Template Forms pelo caminho nativo de controle customizado (sem CVA); entry `/validators` (`rteRequired`, `rteMaxChars`, `rteMaxWords`, `RteValidators`, `formatRteError`), entry `/i18n` (pt-BR, en, es), entry `/testing` (`getRteEditor`) e `@cds/rte-angular/styles/editor.css` (CSS funcional em camadas, sem injeção em tempo de execução, compatível com CSP estrita). Peer `@angular/{core,common,forms}` `>=22.2.1 <23`.
