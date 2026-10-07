# Spec 05c2b — Rascunho, salvamento e colagem externa (`@cds/rte-angular`)

> Parte 7 de 8 da spec 05 (05a, 05b1, 05b2a, 05b2b, 05c1, 05c2a, **05c2b**, 05d) (ver `05-editor-angular.md`). Depende da 05c2a (concluída: `RteUploadAdapter`, *chunk* `rte-upload` carregado só com configuração de envio, manipulador de colar/soltar no principal com prioridade 1100, `pendingUploads()`, sessão de mídia V13 com endereços canônicos). Transforma em decisões numeradas as diretrizes **H1–H10** do Apêndice A da 05c2a (que refinam P11, P12 e P14 da 05c1). Consumida pela 05d (`api-extractor` sobre os tipos novos; o menu `/` não abre durante a decisão de restauração nem a disputa).
> Decisões tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro". Spec enxuta por pedido do autor: só decisões que mudam comportamento ou API; o resto vai para a Evolução. Fatos conferidos em 2026-10-07: `createDraftStore`/`createLocalDraftStorage`/`createMemoryDraftStorage` existem no core (`draft.ts`; interface `DraftStorage` **síncrona** `get`/`set`/`remove`, envelope `{ v: 1, savedAt, html }`, 7 dias, `save` devolve `false` em falha, `createLocalDraftStorage` cai para memória **em silêncio** sem `localStorage`); não existe `clearDrafts`; `RteMediaTracker` tem `reset(doc)` e `session().removed = (base ∪ vistos) − atual`; `mediaHosts` vazio = qualquer host `https:` (então imagens externas só sobrevivem à colagem com `mediaHosts` vazio ou contendo o host de origem); o core tem o comando `setEmbed(url)` (valida pelo `toEmbed`) e nenhum `linkOnPaste` próprio; orçamentos atuais `editor` 36032 B (medido 31331), `upload-runtime` 7552 B (6525), `i18n` 5120 B (4422).

## 1. Objetivo

Dar ao `rte-editor`: **rascunho automático** opt-in (`draftKey`) com restauração só por ação da pessoa e aviso acessível; **`isDirty`/`markSaved()`** com a limpeza de mídia órfã pelo adaptador (`onMediaRemoved`) só depois de salvo; **re-hospedagem** opt-in de imagens externas coladas (`registerExternal`); **URL colada num parágrafo vazio virando *embed*** (opt-in); e o **aviso ao sair** (`beforeunload`) opt-in. Tudo mantendo D8/D9 (exceto a exceção documentada de `restoreDraft`), a CSP estrita, o SSR e os dois modos de detecção de mudanças, com o mínimo no *chunk* principal.

## 2. Fora de escopo

**Evolução (registrada no ADR 0014):** armazenamento assíncrono (IndexedDB) e `DraftStorage` com aviso entre abas fora do `localStorage`; detecção de conflito "o servidor mudou desde o rascunho" (o envelope `v: 1` não guarda a base; exigiria `v: 2`); vários rascunhos/histórico de versões; retomar envios na restauração; re-hospedar **antes** da leitura pelo esquema (com `mediaHosts` restrito a imagem externa é removida pela colagem, como hoje) e re-hospedar vídeo; evento de erro da re-hospedagem; guarda de rota pronta (`CanDeactivate`) — o README mostra uma de 5 linhas com `isDirty()`; criptografia do rascunho; colar URL fora de parágrafo vazio virando *embed*; `httpUploadAdapter` com `registerExternal`/`onMediaRemoved` prontos (o consumidor os acrescenta ao objeto devolvido). **05d:** menu `/`, busca, contadores, `api-extractor`, orçamentos de desempenho (inclui o custo do rascunho em documento grande).

## 3. Decisões

Divergências na execução viram o **ADR 0014** (rascunho e salvamento; numeração reservada para esta parte). Numeração própria (S1…) para não colidir com D, U, G, F, M, V, P, E e H.

| # | Decisão | Motivo |
|---|---|---|
| S1 | **Tamanho da parte:** H1–H10 cabem em ~9 tarefas (abaixo do gatilho de ~11 da P16); sem nova divisão. O que não muda comportamento nem API essencial foi para a Evolução (§2). | Mesmo critério da V1/P16. |
| S2 | **Onde vive o código:** no **principal**, só `isDirty`/`markSaved()`, a fila do `onMediaRemoved` (S9), o `beforeunload` (S12), o colar URL → *embed* (no manipulador de entrada da 05c2a, S11) e a **fachada** do rascunho (*signals* `draftAvailable`, métodos `restoreDraft`/`discardDraft`, que repassam ao *chunk*). O **rascunho** (agendamento, `storage` entre abas, aviso de restauração) é o *chunk* `rte-draft` por `import()`, carregado **logo depois de `editorReady`** só quando há `draftKey` válido (sem ocioso: a restauração precisa da verificação inicial). A **re-hospedagem** (S10) vive no *chunk* `rte-upload`. Guarda `forbiddenContent` do `check-size` impede que o *chunk* `rte-draft` volte ao principal. Falha de carga do `rte-draft`: sem rascunho nesta página, aviso em `isDevMode()`, sem nova tentativa (como o ruling 27 do ADR 0013). | Quem não liga rascunho não paga por ele; o padrão da 05c2a (fachada mínima, maquinaria preguiçosa). |
| S3 | **Configuração:** entrada `draftKey: string \| null` (1–200 caracteres; fora disso é ignorada com aviso em `isDevMode()`); *provider* `draft: { storage?: DraftStorage; maxAgeMs?: number; prompt?: boolean }` (padrões: `createLocalDraftStorage()`, 7 dias do core, `prompt: true`); chave de armazenamento `rte-draft:<draftKey>` sobre `createDraftStore` do core. Entradas `warnOnUnsaved` (S12) e `pasteEmbeds` (S11), booleanas, também no *provider* (entrada > *provider*). Membros novos **opcionais** do `RteUploadAdapter`: `registerExternal?` e `onMediaRemoved?` (adaptadores da 05c2a continuam válidos); `RteUploadConfig` ganha `rehostExternal?: boolean` (padrão `false`) e `ownHosts?: readonly string[]`. | H1, H7–H9; tudo opt-in. |
| S4 | **Quando salvar o rascunho** (H2 refinada): adiamento de **1000 ms** depois da última emissão de `value`, com o temporizador **fora da zona**; descarga imediata em `pagehide` e `visibilitychange` oculto **se `isDirty()`** (independe do adiamento pendente). Não salva com o editor `readonly`/`disabled`, nem durante a **decisão de restauração pendente** (S5: o rascunho antigo não pode ser sobrescrito pela primeira tecla). Valor igual à base salva (S8) → **apaga** o rascunho em vez de salvar. Trocar `draftKey` descarrega o pendente na chave antiga e verifica a nova; `draftKey = null` para de salvar sem apagar. `save` que devolve `false` emite `draftError({ reason: 'write' })` uma vez e só volta a emitir depois de um `save` bem-sucedido; armazenamento padrão indisponível (o recuo para memória do core) emite `draftError({ reason: 'unavailable' })` uma vez por instância. | Custo e ruído; cota real (~5 MB por origem); a pessoa precisa saber que o rascunho não está protegido. |
| S5 | **Restauração nunca automática** (H3): na carga do *chunk* e a cada carga externa (D9), lê o rascunho; se o HTML dele é igual ao valor atual, apaga em silêncio; senão `draftAvailable` = `{ savedAt }`. `restoreDraft(): boolean` aplica o HTML pelo **mesmo caminho do `value`** (leitura tolerante do esquema: o que o esquema recusa some), **emite `value` uma vez** (exceção documentada ao D9), reinicia o histórico como toda carga, **não** muda a base salva (S8) nem a base da sessão de mídia (as remoções feitas no rascunho continuam contando para S9) e apaga a decisão pendente (o rascunho fica até a próxima gravação ou `markSaved`). Devolve `false` sem efeito se não há rascunho, o editor não é editável ou `pendingUploads() > 0`. `discardDraft()` apaga o rascunho e zera `draftAvailable`. | Restaurar em silêncio trocaria o formulário por texto velho; restaurar durante envio abortaria o envio (E17). |
| S6 | **Aviso de restauração embutido** (desligável por `draft.prompt: false`, para quem constrói a própria UI com os *signals*): com `draftAvailable()` não nulo, editor editável e sem envios, o *host* mostra **antes** do editável, dentro de `.rte-editor__frame`, `section.rte-draft` (`role="region"`, nome `labels.draft.region`) com o texto `labels.draft.available(savedAt)` (data e hora por `Intl.DateTimeFormat` do idioma dos rótulos), e os botões "Restaurar" e "Descartar". **Nunca mostra o conteúdo do rascunho.** Não rouba o foco; o texto é anunciado uma vez numa região `aria-live="polite"` (sempre presente e vazia, também no SSR); depois de restaurar ou descartar, o foco que estava no aviso vai para o editável (WCAG 2.4.3). Renderizado só no navegador. | WCAG 4.1.3 e 2.4.3; o conteúdo pode ser sensível (outra pessoa no mesmo computador). |
| S7 | **Várias abas** (H4): só com o armazenamento padrão, o *chunk* ouve o evento `storage` da chave: `newValue` nulo → `draftAvailable = null`; gravação de outra aba com esta aba **sem** mudanças (`!isDirty()`) → `draftAvailable` atualizado (o aviso aparece); com mudanças, ignorado (a última gravação vence). Sem bloqueio entre abas. `DraftStorage` customizado não tem aviso entre abas (Evolução). | Raro e um bloqueio entre abas é frágil; avisar basta. |
| S8 | **`isDirty`/`markSaved()`** (H5): `isDirty: Signal<boolean>` = valor atual ≠ **base salva**, comparando as *strings* de HTML canônico já produzidas pela emissão de `value` (sem serializar de novo). A base é o valor da criação e de cada carga externa (D9). `markSaved(savedHtml?: string): boolean` fixa a base em `savedHtml` (o HTML que o servidor confirmou; se omitido, o valor atual), apaga o rascunho, refaz a base da sessão de mídia (base = endereços de `savedHtml`; vistos = atuais fora dela) e agenda o `onMediaRemoved` (S9). Devolve `false` antes de `editorReady`. `savedHtml` passa pela mesma leitura do esquema para virar canônico antes da comparação. | Durante a requisição de salvar a pessoa pode continuar digitando: fixar o valor atual marcaria como salvo o que não foi. |
| S9 | **`onMediaRemoved(urls)`** (H6, P12): a lista é `session().removed` no momento do `markSaved` menos os endereços de `savedHtml`; é entregue quando `pendingUploads() === 0` (imediatamente se já for), **filtrada de novo** contra os endereços do documento nesse momento; lista vazia não chama. Chamado fora da zona; exceção ou rejeição é engolida com aviso em `isDevMode()`. `destroy` antes da entrega descarta a lista (órfãos ficam para a limpeza do servidor). Nunca chamado por `mediaChange`, carga externa ou `restoreDraft`. O desfazer depois do `markSaved` pode trazer de volta um endereço já entregue: o README pede **exclusão com carência** no servidor (marcar e apagar depois de N dias, não na hora). | Não apagar o que um envio prestes a chegar ou um servidor com deduplicação por conteúdo devolveria; o editor não apaga histórico. |
| S10 | **Re-hospedagem** (H7): com `upload.rehostExternal: true` **e** `adapter.registerExternal`, depois de uma colagem de HTML, cada imagem **inserida pela colagem** cujo `src` é `https:` absoluto de host fora de `ownHosts` e da origem da página vira um trabalho no *chunk* `rte-upload` (mesma fila de 2 da E11, item na bandeja com o último segmento do endereço como nome e "Cancelar", conta em `uploads()`/`pendingUploads()`, sem marcador: a imagem original fica visível). Resposta revalidada como a E6; sucesso troca o `src` (e `srcset`/`sizes` da resposta) de **todas** as imagens com aquele endereço numa transação **fora do histórico** (`addToHistory: false`), uma emissão de `value` e o `mediaChange`; falha, cancelamento, editor não editável na chegada ou imagem já removida → **mantém o original**, sem `uploadError` (aviso em `isDevMode()`). Adiamento com diálogo aberto/IME como a E10. Só imagens que o esquema aceitou (com `mediaHosts` restrito, a externa já some na colagem: README). | Privacidade e custo são do consumidor; desfazer não deve voltar ao endereço externo. |
| S11 | **URL colada → *embed*** (H8): com `pasteEmbeds: true`, o manipulador de entrada (depois do caso de arquivos da E12) toma a colagem **se e somente se** não há arquivos, o `text/plain` aparado é **um único** endereço absoluto sem espaços, a seleção está vazia num **parágrafo vazio** e `editor.can().setEmbed(url)`; aí `preventDefault` e `setEmbed(url)` numa transação (um passo de desfazer, uma emissão, `mediaChange`). Em qualquer outro caso, o caminho de hoje. O principal não importa `@cds/rte-core/embeds` (a validação é do comando). | Um `iframe` de terceiro requisita o provedor ao entrar: opt-in; parágrafo vazio evita transformar um link no meio do texto. |
| S12 | **Aviso ao sair** (H9, P14): com `warnOnUnsaved` ligado, no navegador, o editor registra **fora da zona** um ouvinte de `beforeunload` **só enquanto** `isDirty() \|\| pendingUploads() > 0` (removido quando os dois zeram, para não prejudicar o *bfcache*); o ouvinte chama `preventDefault()` e define `returnValue = ''`. Mensagem genérica do navegador (não personalizável). Navegação interna do Angular não é coberta (README: guarda com `isDirty()`). | Sequestrar a saída por padrão é hostil; ouvinte permanente custa o *bfcache*. |
| S13 | **Privacidade e segurança** (H10): core ganha `clearLocalDrafts(prefix = 'rte-draft:'): number` (percorre o `localStorage`, apaga as chaves com o prefixo, devolve quantas; seguro sem `localStorage` e no SSR), reexportado pelo `.` do Angular; README: chamar no *logout*, usar `draftKey` que inclua o usuário e o documento, rascunho fica em texto puro no dispositivo. O rascunho restaurado nunca passa por `innerHTML` fora do ProseMirror (S5); nada de rascunho, `storage` ou `beforeunload` no servidor (`draftAvailable` = `null`, `isDirty` = `false` no SSR). | Dado local sem dono explícito; mesma barreira de qualquer carga. |
| S14 | **Rótulos e CSS:** seção nova `draft` em `RteLabels` (`region`, `available(savedAt: number)`, `restore`, `discard`) em pt-BR, en e es; CSS no `editor.css` (camada `rte.components`, só `--rte-*`, sem atributo `style`, alvos ≥ 24 px): `.rte-draft`, `.rte-draft__text`, `.rte-draft__actions`, `.rte-draft__status` (visualmente oculto). | D15, D16. |
| S15 | **Testes e tamanho:** unitários nos alvos `test` e `test-zone` com relógio falso e `DraftStorage` em memória; navegador real em **uma** rota nova `draft` (CSP estrita) com N39–N41, localmente no Chromium e nos 3 motores no CI do PR; orçamentos remedidos pela regra do D26 (`ceil(medido × 1,15 / 64) × 64`), cenário novo `draft`. | Regra principal do repositório, no menor conjunto que prova os fluxos. |

## 4. API

```ts
// @cds/rte-angular (entry `.`) — acréscimos à 05c2a
interface RteUploadAdapter {                      // + membros opcionais (S3)
  /** Só imagens nesta parte (S10). */
  registerExternal?(url: string, ctx: RteUploadContext): Promise<RteUploadedImage>;
  onMediaRemoved?(urls: readonly string[]): void | Promise<void>;
}
interface RteUploadConfig { rehostExternal?: boolean; ownHosts?: readonly string[] }

interface RteDraftConfig {
  storage?: DraftStorage;                         // padrão createLocalDraftStorage()
  maxAgeMs?: number;                              // padrão do core (7 dias)
  prompt?: boolean;                               // padrão true (S6)
}
interface RteConfig { draft?: RteDraftConfig; warnOnUnsaved?: boolean; pasteEmbeds?: boolean }

interface RteDraftErrorEvent { readonly reason: 'write' | 'unavailable' }

class RteEditor {
  readonly draftKey: InputSignal<string | null | undefined>;          // S3
  readonly warnOnUnsaved: InputSignal<boolean | undefined>;           // S12
  readonly pasteEmbeds: InputSignal<boolean | undefined>;             // S11
  readonly draftError: OutputRef<RteDraftErrorEvent>;                 // S4
  readonly draftAvailable: Signal<{ readonly savedAt: number } | null>; // S5
  readonly isDirty: Signal<boolean>;                                  // S8
  restoreDraft(): boolean;
  discardDraft(): void;
  markSaved(savedHtml?: string): boolean;
}
interface RteDraftLabels { region: string; available(savedAt: number): string; restore: string; discard: string }
interface RteLabels { draft: RteDraftLabels }
export { clearLocalDrafts } from '@cds/rte-core';

// @cds/rte-core (entry `/`) — acréscimo
function clearLocalDrafts(prefix?: string): number;   // padrão 'rte-draft:'
```

**Interno:** fachada do rascunho e fila do `onMediaRemoved` no principal; *chunk* `rte-draft` (agendador, ouvinte `storage`, componente do aviso); re-hospedagem no `rte-upload`. **Classes públicas novas:** `.rte-draft`, `.rte-draft__text|__actions|__status`.

## 5. Requisitos

- **R1. Pacote e *chunks* (S2).** *Chunk* `rte-draft-<hash>` no `fesm2022`, pedido só com `draftKey` (lista de requisições); `grep` no `dist`: o agendador e o aviso ausentes do principal; re-hospedagem só no `rte-upload`; principal sem `@cds/rte-core/embeds`; nenhuma dependência nova; `verify-package` verde.
- **R2. Salvar (S4).** Relógio falso: uma gravação 1000 ms depois da última emissão; `pagehide`/`visibilitychange` gravam se sujo; nada em `readonly`/`disabled`, durante a decisão pendente, nem por transação sem mudança de valor; igual à base → apaga; troca de `draftKey`; `draftError` `'write'` uma vez até o próximo sucesso e `'unavailable'` uma vez; o HTML gravado nunca contém `.rte-upload-marker`, `blob:` nem `data:`.
- **R3. Restaurar (S5, S6).** Rascunho igual ao valor apagado em silêncio (na criação e após carga externa); `restoreDraft` emite `value` uma vez, reinicia o histórico, mantém `isDirty() === true` e a base da sessão; recusa (`false`) sem rascunho, não editável ou com envio; HTML hostil no armazenamento (`<script>`, `onerror`, `javascript:`) sai canônico (0 violações em `validateHtml` canônico); aviso com nome acessível, data no idioma, anúncio único, foco ao editável depois da ação, nunca o conteúdo; `prompt: false` não renderiza.
- **R4. Abas (S7).** Evento `storage` simulado: remoção zera; gravação externa com a aba limpa mostra o aviso; com a aba suja, ignorada.
- **R5. `isDirty`/`markSaved` (S8, S9).** Sujo ao editar, limpo ao desfazer até a base, limpo após carga externa; `markSaved()` e `markSaved(html)` com digitação no meio (continua sujo); `onMediaRemoved` com a lista certa, só com `pendingUploads() === 0`, refiltrada, nunca vazia, nunca por `mediaChange`/carga/restauração, descartada no `destroy`, rejeição engolida; adiado fora da zona.
- **R6. Re-hospedagem (S10).** Desligada por padrão e sem `registerExternal`; só imagens da colagem, `https:` e fora de `ownHosts`/origem; sucesso troca todas as ocorrências numa transação fora do histórico (desfazer a colagem remove a imagem, não volta ao externo); resposta recusada pela E6, falha, cancelamento pela bandeja e não editável mantêm o original sem `uploadError`; conta em `pendingUploads()`.
- **R7. URL → *embed* (S11).** Desligado por padrão; liga só em parágrafo vazio com URL única aceita pelo `setEmbed`; texto com espaços, URL não suportada, parágrafo com texto, bloco de código e seleção não vazia seguem o caminho de hoje; arquivos continuam com a E12.
- **R8. `beforeunload` (S12).** Ouvinte presente só com `warnOnUnsaved` e (sujo ou envio); removido ao zerar; ausente no SSR.
- **R9. Privacidade, rótulos, CSS, SSR e modos (S13, S14).** `clearLocalDrafts` (prefixo, contagem, sem `localStorage`); chaves novas completas nos 3 idiomas; regras novas só com `--rte-*` e ausentes do `content.css`; SSR com a região `aria-live` vazia, sem aviso e sem acesso a `localStorage`; mesma suíte zoneless e zone.js sem `NG0100`/`NG0101`.
- **R10. Tamanho e documentação.** Expectativa: `editor` +1,0–1,5 kB, `draft` (novo) ~1,8–2,3 kB, `upload-runtime` +~0,6 kB, `i18n` +~0,3 kB, core sem cenário novo; README (rascunho e privacidade, `markSaved(savedHtml)`, exclusão com carência, re-hospedagem e `mediaHosts`, `pasteEmbeds`, `warnOnUnsaved` e guarda de rota); `CLAUDE.md`; changesets do `@cds/rte-angular` e do `@cds/rte-core`.

## 6. Testes

### 6.1 Unitários (`test` e `test-zone` do `@cds/rte-angular`; `test` do `@cds/rte-core`)
- Core `draft.spec.ts` (ampliado): `clearLocalDrafts`.
- `draft-save.spec.ts`: R2. `draft-restore.spec.ts`: R3 e R4. `dirty-saved.spec.ts`: R5. `upload-rehost.spec.ts`: R6 (adaptador falso da 05c2a com `registerExternal`). `paste-embed.spec.ts`: R7. `before-unload.spec.ts`: R8.
- `draft-lazy.spec.ts`: R1 (pedido do *chunk* só com `draftKey`, falha de carga).
- `labels.spec.ts`, `css.spec.ts`, `ssr.spec.ts`, `index.spec.ts`, `api.spec.ts` (ampliados): R9.

### 6.2 Navegador real (Playwright; local no Chromium, 3 motores no CI do PR; app `e2e/angular/app` com CSP estrita, *builds* zoneless e zone)
Rota nova `draft`: editor com `draftKey`, `warnOnUnsaved`, `pasteEmbeds` e um adaptador de teste (envio pelo `/__upload` da 05c2a; `registerExternal` que devolve `/__uploads/<id>` de um arquivo enviado antes; `onMediaRemoved` que registra na página); botões "salvar" (`markSaved(html)`) e carga externa; `mediaHosts` vazio. Em `e2e/angular/`:
- **N39 rascunho** (`editor-draft.spec.ts`): digitar, recarregar, aviso com data, axe sem `serious`/`critical` no aviso, "Restaurar" (conteúdo de volta, foco no editável) e "Descartar" numa segunda recarga; duas páginas no mesmo contexto (aviso por `storage`); `clearLocalDrafts` limpa.
- **N40 salvamento e saída** (`editor-draft-save.spec.ts`): `isDirty` na página, remover uma imagem e salvar → `onMediaRemoved` com o endereço; com envio lento em curso, a entrega espera o fim; `beforeunload` (diálogo do navegador por `page.on('dialog')`, depois de um clique para a ativação) só sujo.
- **N41 colagem externa** (`editor-paste-external.spec.ts`): `ClipboardEvent('paste')` com HTML de imagem externa → item na bandeja → `src` trocado; com URL do YouTube num parágrafo vazio → *embed*; no meio do texto → link/texto como hoje; 0 violações de CSP além do carregamento bloqueado da imagem externa (esperado).
- N1–N38 continuam verdes.

## 7. Critérios de aceite

- [ ] `npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size` verde; `npm run check:rules` e `typecheck:e2e` verdes (`check:licenses`, `notices`, `test:tools` no CI do PR).
- [ ] Unitários 6.1 verdes em `test` e `test-zone` (e `test` do core).
- [ ] N39–N41 verdes no Chromium local; N1–N41 nos 3 motores no CI do PR.
- [ ] ADR 0014 (`docs/decisions/0014-rascunho-e-salvamento.md`) registra S1–S15, os *rulings*, os desvios e os tamanhos (R10); README, `CLAUDE.md`, `docs/specs/README.md`, `05-editor-angular.md` e changesets atualizados.

## 8. Consequências

- **05d:** `api-extractor` cobre a §4 (inclusive `clearLocalDrafts` no core); o menu `/` não abre com o aviso de restauração focado; o orçamento de desempenho mede o custo do rascunho (comparação de *strings* por emissão e gravação adiada) em documento grande.
- **Spec 07:** a demo mostra o rascunho, `markSaved(savedHtml)` e um servidor com exclusão com carência para o `onMediaRemoved`.
- **Spec 08:** leitores de tela no aviso de restauração; `beforeunload`/`pagehide` em celular.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Primeira tecla sobrescrever o rascunho antigo | Gravação suspensa com decisão pendente (S4), testada (R2) |
| `onMediaRemoved` apagar mídia que o desfazer traz de volta | Entrega só após `markSaved`, refiltrada (S9); README pede exclusão com carência |
| Rascunho hostil ou de esquema antigo no armazenamento | Mesmo caminho do `value` (leitura tolerante), R3 com HTML hostil |
| Cota do `localStorage` | `draftError` (S4); o README sugere `DraftStorage` próprio |
| `beforeunload` derrubar o *bfcache* | Ouvinte só enquanto sujo (S12) |
| Re-hospedagem inútil com `mediaHosts` restrito | Documentado; pré-leitura na Evolução |
