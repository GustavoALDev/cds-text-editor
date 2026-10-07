# ADR 0014: Rascunho, salvamento e colagem externa

- Status: aceita (2026-10-07)
- Spec de origem: `docs/specs/05c2b-rascunho-e-salvamento.md` (parte 7 de 8 da spec 05)

## Contexto

A 05c2b fecha a 05c2 com: rascunho automático opt-in (`draftKey`), `isDirty`/`markSaved()` com `onMediaRemoved`, aviso ao sair (`warnOnUnsaved`), URL colada em parágrafo vazio virando _embed_ (`pasteEmbeds`) e re-hospedagem opt-in de imagens externas coladas (`rehostExternal`/`registerExternal`). O core ganhou só `clearLocalDrafts`. Verificada em jsdom (zoneless e zone.js) e no Chromium com CSP estrita; os 3 motores ficam para o CI do PR.

## Decisão

### (a) Decisões da spec

S1–S15 valem como escritas na spec (fonte única; não são repetidas aqui). Resumo: rascunho num _chunk_ próprio `rte-draft` (S2), gravação 1000 ms depois da última emissão e descarga em `pagehide` (S4), restauração só por ação da pessoa (S5), aviso embutido e acessível (S6), várias abas por `storage` (S7), `isDirty`/`markSaved` (S8), entrega de `onMediaRemoved` só depois de salvo e sem envios pendentes (S9), re-hospedagem (S10), URL → _embed_ (S11), `beforeunload` só enquanto sujo (S12), `clearLocalDrafts` (S13).

### (b) Desvios da execução

- **Salvamento (T1):** o estado vive no campo privado `dirtyState`; `isDirty` compara um `current` canônico com a `base`. Um `value` externo igual à última emissão **não** reinicia a base. `savedHtml` é canonicalizado por `createDocument` + `serializeRteHtml`. Um segundo `markSaved` com envios pendentes **funde** as remoções ainda não entregues.
- **Rascunho (T2):** o aviso é o componente `<rte-draft-prompt>`; ele é o primeiro `@defer` do `rte-editor` (agora 5 blocos). `draftError` com `'unavailable'` vem de uma sonda no `localStorage` (a chave `__rte_draft_probe__` é guardada por `forbiddenContent` fora do principal). `restoreDraft` não grava enquanto há decisão pendente. Sem teste unitário para `restoreDraft() === false` com envios pendentes (coberto pela regra, não pelo teste). O teste do temporizador de gravação é sensível à carga da máquina (intermitente).
- **Sair (T3):** `beforeunload` é registrado fora da zona só enquanto sujo/pendente e habilitado. O N40 roda **só no Chromium** (`test.skip` nos outros): diálogos de `beforeunload` não são automatizáveis de forma confiável no Firefox/WebKit.
- **_Embed_ (T4):** `pasteEmbeds` não puxa `@cds/rte-core/embeds` para o principal (o comando do core valida o provedor; o `rte-editor` já importava `DEFAULT_EMBED_PROVIDERS` desde a 05c1). Um _embed_ colado emite `value`, **não** `mediaChange` (_embeds_ não são mídia rastreada, V13). A verificação de saúde do Playwright passou a usar a porta 4317.
- **Re-hospedagem (T5):** roda no _chunk_ `rte-upload` como um tipo de trabalho "externo" (fila e bandeja, sem marcador). `rehostExternal` e `ownHosts` entram em `RteUploadConfig`. Colagens **antes** do _chunk_ carregar não são re-hospedadas. Falha mantém a URL externa **sem** `uploadError` (só aviso em desenvolvimento). Com `mediaHosts` restrito a re-hospedagem não faz nada (a imagem externa já é removida pelo esquema).

### (c) Números (2026-10-07)

`min+gzip`, código commitado de `00f102a`; orçamento = `ceil(medido × 1,15 / 64) × 64`.

| Cenário          | Antes (05c2a) | Agora | Orçamento antes | Orçamento agora |
| ---------------- | ------------- | ----- | --------------- | --------------- |
| `editor`         | 31331         | 34053 | 36032           | 39168           |
| `whole`          | 31454         | 34204 | 36224           | 39360           |
| `draft` (novo)   | -             | 1645  | -               | 1920            |
| `upload-runtime` | 6525          | 7354  | 7552            | 8512            |
| `i18n`           | 4422          | 4553  | 5120            | 5248            |

Leitura: o `editor` cresceu +2722 B (R10 esperava +1,0–1,5 kB: fachadas de rascunho, `isDirty`/`markSaved`, fila do `onMediaRemoved`, `beforeunload`, `pasteEmbedUrl` e configuração); o `upload-runtime` +829 B (esperado ~0,6 kB; a re-hospedagem); o `i18n` +131 B (esperado ~0,3 kB); o `draft` ficou abaixo do esperado (1,8–2,3 kB). Core: `draft` 671 B, `whole` 8469 B, dentro dos orçamentos existentes (sem mudança). `grep` no `dist`: `beforeunload` e re-hospedagem fora do `cds-rte-angular.mjs`; `__rte_draft_probe__` ausente do principal; `rte-core/embeds` só no _chunk_ compartilhado do `.` (já era assim na 05c1).

### (d) Evolução

Armazenamento assíncrono (IndexedDB) e aviso entre abas fora do `localStorage`; conflito "o servidor mudou desde o rascunho" (exigiria envelope `v: 2`); vários rascunhos/versões; retomar envios na restauração; re-hospedar antes da leitura pelo esquema com `mediaHosts` restrito; mensagem ao usuário em falha de re-hospedagem.

## Consequências

- **05d:** `api-extractor` cobre `clearLocalDrafts` e a API nova; o menu `/` não abre com o aviso de restauração focado; o orçamento de desempenho mede o custo do rascunho em documento grande.
- **Spec 07:** a demo mostra rascunho, `markSaved(savedHtml)` e um servidor com exclusão com carência para o `onMediaRemoved`.
- **Spec 08:** leitores de tela no aviso; `beforeunload`/`pagehide` em celular; N40 nos outros motores.
