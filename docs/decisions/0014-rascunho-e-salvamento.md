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
- **Rascunho (T2):** o aviso é o componente `<rte-draft-prompt>`; ele é o primeiro `@defer` do `rte-editor` (agora 5 blocos). `draftError` com `'unavailable'` vem de uma sonda no `localStorage` (a chave `__rte_draft_probe__` é guardada por `forbiddenContent` fora do principal). `restoreDraft` não grava enquanto há decisão pendente. Sem teste unitário para `restoreDraft() === false` com envios pendentes (coberto pela regra, não pelo teste). O teste do temporizador de gravação era intermitente sob carga (corrigido na revisão final).
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

### Revisão final (2026-10-07)

Corrigido (com teste que falhava antes):

- **Importante — destruição no adiamento:** destruir o `rte-editor` (ex.: troca de rota) menos de 1 s depois da última tecla perdia a última edição do rascunho; `dispose()` agora descarrega o pendente (sem `draftError`, a saída já foi destruída).
- **Menor — `pagehide` limpo com adiamento pendente:** ao voltar à base (desfazer) e ocultar a página antes do adiamento, o rascunho velho ficava e reaparecia como aviso na próxima carga; agora o pendente é descarregado (igual à base → apaga), como S4 já previa para o adiamento.
- **Menor — re-hospedagem com credenciais:** `https://usuário:senha@…` não vai mais ao `registerExternal` (fica a URL externa).
- **Menor — `clearLocalDrafts('')`:** prefixo vazio apagava todo o `localStorage` da origem; agora devolve `0`.
- **Menor:** JSDoc do `focusFloatingMenu` estava colado ao `markSaved`; README com o aviso de SSRF do `registerExternal`.
- **Teste intermitente:** `setupDraft` espera a promessa do carregador do _chunk_ (antes, 3 voltas de macrotarefa; sob carga o `import()` chegava depois e o teste do temporizador falhava).

Documentado, sem mudança:

- **Tamanho do `editor` (+2,7 kB):** conferido no `dist`; nada do _chunk_ `rte-draft` voltou ao principal (o aviso e o agendador só por `import()`). O crescimento é a fachada (`RteDraft`), `RteDirtyState`/`readCanonical` (o `createDocument` já era do Tiptap), `RteBeforeUnload`, `markSaved`, `pasteEmbedUrl`, os rótulos em inglês do aviso e o bloco `@defer`. Mover mais exigiria levar `isDirty`/`markSaved` para um _chunk_, contra S2.
- **SSRF:** a busca da URL externa é do servidor do consumidor (o editor só a entrega ao adaptador); README orienta a validação.
- **Mesma `draftKey` em dois editores da mesma página:** ambos gravam a mesma chave (o último vence; `storage` não dispara na própria aba). Responsabilidade de quem escolhe a chave (README: usuário + documento).
- **Foco no aviso que some por evento externo** (`storage` de outra aba apagou o rascunho com o foco num botão do aviso): o foco cai no `body`. Raro; candidato da spec 08 (leitores de tela no aviso).

### (d) Evolução

Armazenamento assíncrono (IndexedDB) e aviso entre abas fora do `localStorage`; conflito "o servidor mudou desde o rascunho" (exigiria envelope `v: 2`); vários rascunhos/versões; retomar envios na restauração; re-hospedar antes da leitura pelo esquema com `mediaHosts` restrito; mensagem ao usuário em falha de re-hospedagem.

## Consequências

- **05d:** `api-extractor` cobre `clearLocalDrafts` e a API nova; o menu `/` não abre com o aviso de restauração focado; o orçamento de desempenho mede o custo do rascunho em documento grande.
- **Spec 07:** a demo mostra rascunho, `markSaved(savedHtml)` e um servidor com exclusão com carência para o `onMediaRemoved`.
- **Spec 08:** leitores de tela no aviso; `beforeunload`/`pagehide` em celular; N40 nos outros motores.
