---
'@cds/rte-angular': patch
---

Segurança (R9): `httpUploadAdapter` ignora `Content-Type` em `headers` (o `boundary` do multipart é do navegador) e documenta que o `XMLHttpRequest` não passa pelos interceptors do Angular; README sobre o rascunho sem escopo por usuário (`draftKey` com o id do usuário, `clearLocalDrafts()` no logout). `idPrefix` sem hífen final passa a lançar (ver `@cds/rte-core`).
