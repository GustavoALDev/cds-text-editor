# Modelo de ameaças (resumo)

Escopo: XSS e abuso a partir de conteúdo não confiável. Reporte falhas conforme o [SECURITY.md](../SECURITY.md).

| Ameaça                | Vetor                                             | Defesa                                                                                                                                                                   |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| XSS via HTML          | Conteúdo salvo, importado ou exibido no site      | `@cds/rte-sanitizer` (lista de permissões do esquema, ADR 0003); `validateHtml` em `@cds/rte-core/html` e nos validadores do Angular; exibição por `@cds/rte-render`     |
| XSS via colagem       | HTML/Markdown colado no editor                    | Esquema do Tiptap descarta o que não é do esquema; classes e estilos filtrados por `isAllowedClass`; links e URLs validados                                              |
| Respostas de servidor | Adaptador de upload devolvendo URL ou HTML hostil | `mapResponse` do consumidor + `readUploadedMedia` validam a mídia (ADR 0011); nada da resposta vira HTML sem passar pelo esquema                                         |
| Upload                | Tipo, tamanho e origem do arquivo                 | Limites e tipos permitidos no adaptador; verificação de tamanho/MIME no cliente é conveniência, o servidor precisa revalidar                                             |
| CSP                   | Estilos e scripts inline                          | A lib não usa `eval`, scripts inline nem `style` inline injetado; o app de teste roda com CSP estrita (`e2e/angular/serve.mjs`); embeds exigem `frame-src` do consumidor |
| SSR                   | Execução no servidor                              | Sem globais de DOM no código da lib (lint, D25); HTML renderizado sem `<script>`                                                                                         |

Pendente (spec 09, parte seguinte): fuzzing do sanitizador, revisão do `httpUploadAdapter` e do exemplo de servidor. Dependências: `npm audit --omit=dev --audit-level=high` roda no CI (informativo).
