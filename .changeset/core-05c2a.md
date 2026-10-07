---
'@cds/rte-core': minor
---

`setImage` e `setVideo` aceitam um segundo argumento opcional `{ at?: number }` (spec 05c2a, E9): com `at`, as regras de inserção (parágrafo vazio substituído; senão depois do bloco, subindo até um pai que aceite) usam essa posição em vez da seleção, e o comando não mexe na seleção (só a mapeia) nem rola. `at` não inteiro ou fora de `[0, doc.content.size]` devolve `false`. Sem `at`, nada muda; o HTML canônico é o mesmo.
