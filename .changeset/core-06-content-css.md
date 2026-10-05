---
'@cds/rte-core': minor
---

`content.css`: tarefas na exibição (`.rt-task > label` em flex, checkbox centrado na primeira linha) e legenda de tabela (`caption`). Parágrafo e títulos vazios (`p`, `h1`–`h6` com `:empty`) ganham uma linha de altura (`min-block-size: 1lh`), como na edição; o editor não muda (o ProseMirror mantém um `br` no bloco vazio).
