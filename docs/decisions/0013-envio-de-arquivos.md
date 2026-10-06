# ADR 0013: Envio de arquivos, marcadores de envio e validadores de mídia

- Status: aceita (2026-10-06)
- Spec de origem: `docs/specs/05c2a-envio-de-arquivos.md` (parte 6 de 8 da spec 05)

## Contexto

A 05c1 (ADR 0011) deu ao `rte-editor` mídia **por endereço** e deixou as diretrizes P1–P16 para a 05c2. A 05c2 foi dividida (P16) em **05c2a** (esta: arquivos) e **05c2b** (rascunho, `isDirty`/`markSaved()`, `onMediaRemoved`, `registerExternal`, URL colada → _embed_, `beforeunload`, diretrizes H1–H10 no Apêndice A da spec). A 05c2a entrega: a separação do _chunk_ dos formulários de mídia (ruling 20 do ADR 0011), `RteUploadAdapter` e `httpUploadAdapter`, validação de arquivo, marcadores de envio, bandeja, inserção na chegada, colar, soltar, campo de arquivo nos diálogos, `uploadError`, `uploads`/`pendingUploads`/`imagesMissingAlt` e os validadores `rteUploadsFinished`/`rteImagesHaveAlt`. Verificada em jsdom (zoneless e zone.js) e no Playwright, com CSP estrita, _prerender_ e hidratação. O 0012 não existe neste repositório (numeração reservada); este é o 0013.

## Decisão

### (a) Decisões da spec (E1–E25)

| #   | Decisão                                                                                                                                                                                                                                            | Motivo                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| E1  | 05c2 dividida: 05c2a = arquivos, os dois validadores e a separação do _chunk_ de mídia; 05c2b = rascunho, `isDirty`, `onMediaRemoved`, `registerExternal`, URL → _embed_, `beforeunload`.                                                          | Juntas passam de ~19 tarefas (gatilho da P16: ~11); `rteUploadsFinished` depende dos envios.          |
| E2  | `@defer` próprio para os formulários de imagem/vídeo/_embed_ (`RteMediaForms`, _chunk_ `rte-media-forms`) dentro do `<dialog>`, com `@error` como o da G7 e bloco só de pré-carga em ocioso; `showModal()` só com o formulário do pedido presente. | Ruling 20 do ADR 0011; evita a cascata de requisições no primeiro "Inserir imagem".                   |
| E3  | `RteUploadConfig` por `provideRichText({ upload })` e pela entrada `upload` (entrada > _provider_; objeto inteiro; `null` desliga). Sem adaptador, nada de arquivo.                                                                                | Um objeto só evita misturar adaptador de um lugar com limites de outro.                               |
| E4  | Contrato: `uploadImage`/`uploadVideo?(file, { signal, onProgress })`, uma chamada por arquivo, fora da zona; `RteUploadError(reason)`; outra rejeição = `'server'`; resultado depois do cancelamento é descartado.                                 | Motivo tipado e traduzível; cancelamento à prova de adaptador que ignora o `signal`.                  |
| E5  | Tipos por lista fechada (nunca `svg`), configuráveis só como subconjunto; MIME vazio cai na extensão; 10 MiB (imagem), 200 MiB (vídeo), 20 arquivos por gesto; `validateUploadFile` pura.                                                          | Erro imediato e barato; `svg` carrega script; MIME vazio acontece com tipos novos.                    |
| E6  | Resposta revalidada pelas regras do esquema; `url`/`srcset`/`sizes`/`poster` recusados = `'response'`; `width`/`height` inválidos ignorados; entra o valor canônico.                                                                               | O servidor do consumidor não é fonte de verdade do HTML; recusar expõe CDN fora de `mediaHosts` cedo. |
| E7  | Marcador = decoração de _widget_ de um _plugin_ (`aria-hidden`, `contenteditable=false`), posição mapeada, estado só por _meta_ (`addToHistory: false`): não emite `value`, não entra no histórico nem na sessão.                                  | O valor nunca contém estado transitório; desfazer não apaga um envio em curso.                        |
| E8  | Bandeja `section.rte-uploads` depois do editável, com cancelar por item (foco no seguinte, anterior ou editável) e região `aria-live` sempre presente e vazia no SSR; um anúncio por gesto; progresso não é anunciado.                             | Botões dentro do `contenteditable` não têm `Tab` confiável; WCAG 2.1.1 e 2.4.3.                       |
| E9  | `setImage`/`setVideo(attrs, { at })` no core (aditivo); uma transação por chegada com `closeHistory`: remove o marcador e insere; uma emissão de `value`; seleção conforme o foco; `alt: null` para colado/solto.                                  | Passo de desfazer próprio e uma emissão (D8); a validação continua a do core.                         |
| E10 | Chegada adiada com diálogo aberto ou composição de IME; editor não editável na chegada = `'unavailable'`.                                                                                                                                          | Não descartar o que a pessoa digita nem quebrar a composição.                                         |
| E11 | No máximo 2 envios simultâneos (fila FIFO); a ordem no documento é a do gesto; cancelar/falhar um não afeta os outros.                                                                                                                             | Não saturar a conexão; quem solta "1, 2, 3" espera ler "1, 2, 3".                                     |
| E12 | Colar: toma a colagem só com arquivo **e** `text/plain` vazio/só espaços; prioridade acima do `charLimit` e do bloco de código; não apaga a seleção.                                                                                               | Word/Excel põem texto e uma imagem do trecho: o texto vence.                                          |
| E13 | Soltar com `Files`: sempre `preventDefault` sobre o editável; com adaptador, posição por `posAtCoords`.                                                                                                                                            | O navegador abrir o arquivo perde o que foi digitado.                                                 |
| E14 | Diálogos de imagem/vídeo (modo inserir) com "Origem" arquivo/endereço; erros `rteFileRequired`/`rteFileType`/`rteFileSize` no campo; "Aplicar" fecha o diálogo e o envio segue pelo marcador.                                                      | Diálogo não preso a um envio longo; texto alternativo continua obrigatório (V7).                      |
| E15 | `uploadError` (`type`, `size`, `count`, `network`, `server`, `response`, `unavailable`), dentro da zona, um por arquivo; cancelar e abortar por ciclo de vida não são erro.                                                                        | Motivo tipado e contável (P8).                                                                        |
| E16 | Pré-visualização opt-in (`preview`) por _object URL_ só no marcador; revogada em todos os fins; nunca em `value`, HTML, sessão ou `uploadError`.                                                                                                   | CSP estrita por padrão; sem vazamento; `blob:` nunca no documento.                                    |
| E17 | `destroy`, troca da configuração e carga externa abortam tudo (real), sem `uploadError`; `disabled`/`readonly`/`hidden` não abortam.                                                                                                               | Nada chega a um documento trocado; um formulário desabilitado ao salvar não perde envios.             |
| E18 | `uploads`, `pendingUploads`, `imagesMissingAlt` (escrito fora do portão do delta de URLs), `uploadFiles`, `cancelUpload`, `cancelAllUploads`.                                                                                                      | Validadores, 05c2b e consumidor leem o mesmo estado.                                                  |
| E19 | Validadores que leem o estado do editor: funções `rteUploadsFinished`/`rteImagesHaveAlt` (Signal Forms) e diretivas (Reactive/Template Forms) com erros tipados e `formatRteError`. Desvio na execução: ver (b), Ruling E19.                       | Mecanismo decidido uma vez (P13).                                                                     |
| E20 | Seção `upload` em `RteLabels`, chaves novas em `dialogs` e `errors` (pt-BR, en, es), troca ao vivo.                                                                                                                                                | D15.                                                                                                  |
| E21 | CSS no `editor.css` (`rte.components`, só `--rte-*`, sem `style`), `<progress>` nativo legível em claro, escuro e `forced-colors`; nada no `content.css`.                                                                                          | CSP (D16); WCAG 1.4.11 e 2.5.8.                                                                       |
| E22 | Segurança: nunca `data:`/`blob:` no valor, HTML ou sessão; nomes e mensagens só como texto; `cause` nunca exibido; nenhuma requisição sem gesto; README lista as responsabilidades do servidor.                                                    | Defesa em profundidade.                                                                               |
| E23 | Adaptador fora da zona; progresso no _signal_ no máximo uma vez por quadro e com mudança >= 1 p.p.; `value`/`mediaChange`/`uploadError` entram na zona.                                                                                            | Os eventos do `XMLHttpRequest` não devem disparar `tick`.                                             |
| E24 | `httpUploadAdapter` no entry `@cds/rte-angular/upload` (`XMLHttpRequest`, `multipart/form-data`, `fieldName`, `kind`, `headers`, `withCredentials`, `timeoutMs`, `mapResponse`), sem Angular em tempo de execução.                                 | Cancelamento real e progresso (o `fetch` não dá progresso de envio).                                  |
| E25 | Unitários em `test` e `test-zone`; navegador real nas rotas `upload` (CSP estrita) e `upload-preview` (`img-src blob:`) do app de teste, com endpoint falso no `serve.mjs`.                                                                        | Regra principal do repositório.                                                                       |

Diretrizes **H1–H10** (Apêndice A da spec, para a 05c2b; **não implementadas aqui**, vinculantes como diretrizes): H1 rascunho opt-in por `draftKey` (só HTML canônico); H2 salvar com adiamento de ~1 s e em `pagehide`; H3 restaurar nunca é automático (`draftAvailable`, `restoreDraft()`, `discardDraft()`); H4 várias abas pelo evento `storage`; H5 `isDirty`/`markSaved()`; H6 `onMediaRemoved` só com endereços canônicos e sem envios pendentes; H7 `registerExternal?` desligado por padrão; H8 URL colada → _embed_ só com o cursor num parágrafo vazio e opt-in; H9 `beforeunload` opt-in; H10 privacidade do rascunho e versões.

### (b) Rulings

**Pré-voo** (varredura do plano contra o código; valem para a execução):

1. `@error` do `@defer` de mídia chama `failMedia()` do controlador (cancelamento, aviso em `isDevMode()`) e liga uma bandeira **só de mídia**: `openDialog` recusa `image`/`video`/`embed` com ela e segue abrindo link, idioma, citação e tabela (a G7 terminal vale só para o que depende do _chunk_). Os itens de mídia da barra ficam `aria-disabled` depois da falha.
2. A contagem de blocos `@defer` do `RteEditor` passa de 2 para 3 (menus, diálogos, pré-carga); `floating-defer.spec.ts` e `dialog-defer.spec.ts` escolhem os blocos por conteúdo/ordem. **Desvio da R2** (a spec dizia "sem mudar expectativas além do nome do _chunk_"): a contagem muda por força da E2.
3. O N31 da 05c1 (`editor-media-a11y.spec.ts`) passa de "três formulários de mídia no mesmo arquivo do `rte-dialog__form`" para "formulários de mídia num arquivo próprio, diferente do de `rte-link-form`" (também desvio da R2, pela E2).
4. `dialogsChunk` e `mediaFormsChunk` (helpers de E2E) usam `route.fallback()` para os `.js` que não casam: dois `page.route('**/*.js')` com `fulfill` se anulam no Playwright.
5. `mediaReady` reflete a instância atual de `RteMediaForms` (o `@defer` de mídia fica fora do `@switch`), para o `showModal()` não preceder o formulário recriado (foco inicial, G4).
6. `insertUploaded` confere antes com `editor.can()` e trata o `at` já mapeado pela remoção do parágrafo de origem: o Tiptap despacha a cadeia mesmo com um passo `false` (padrão `preventDispatch`), então um comando recusado apagaria o parágrafo e emitiria `value` sem mídia.
7. Na propriedade dos marcadores, "nenhum parágrafo vazio de origem sobra" vale só em sequências sem edições que toquem o parágrafo nem `undo`/`redo` de chegadas; em todas vale a R6 (ordem do gesto; o parágrafo só some quando não resta marcador).
8. "21 imagens": 20 itens em `uploads()`, `uploadFiles` → 20, 1 `uploadError` `'count'`, 2 chamadas imediatas ao adaptador e 20 depois de esvaziar a fila (a fila de 2 torna "20 chamadas de uma vez" impossível).
9. `handleDOMEvents.compositionend` (`queueMicrotask(flush)`) entra em `extension.ts` já na T6 (o teste E10 depende dele); a T9 acrescenta só colar/soltar.
10. Ajudantes de teste sem uso na tarefa que os cria nasceram na que os usa: `data-transfer.ts` na T9, `object-url.ts` na T12.
11. `fileRules`/`RteFileRules` nascem na T10 (`upload/dialog-port.ts`), com os testes no `dialog-image/video.spec.ts`.
12. A guarda R1 do principal usa `grep -c "rte-angular/upload"` (com barra); o bloco de lint de `upload/src` repete também a restrição de `@cds/rte-core/html`.
13. A página `upload` do app nasce sem os validadores (só `[formField]`/`formControlName`/`ngModel`); a T11 os acrescenta.
14. A ponte de teste vira `setUpload(id, mode, query?)`; o modo `'http'` monta `httpUploadAdapter({ endpoint: '/__upload' + query })` (nova referência: aborta envios em curso), para N36/N37 provocarem 500, JSON inválido, URL `http:` e progresso lento.
15. Toda tarefa que roda `angular:size` remede e reorça o que estourar, não só o seu cenário.
16. O diálogo mantém o marcador em `req.range.to`. Com texto selecionado o marcador aparece no fim da seleção e a mídia entra **depois do bloco** (como colar); a diferença é só visual e transitória (a inserção final é a das regras do core com `at`).
17. `readUploadRules` reaproveita `readMediaRules` (acrescenta só `img[srcset|sizes]`).

**Execução** (numeração do _ledger_ `progress.md`):

18. Modelos: Opus nas tarefas de núcleo (chunk, core, marcadores, gerenciador, colar/soltar, diálogos, validadores, segurança) e revisões; Sonnet nas demais.
19. Revisões da T1, T3, T4, T5, T6, T8, T9, T10 em paralelo com a tarefa seguinte (arquivos disjuntos).
20. **Âncora sem `@angular/forms`:** o primeiro desenho do kit de diálogos puxava `@angular/forms/signals` para o principal (~26 kB gzip ansiosos, ocultos pela medida). O kit ancorado no principal só tem símbolos sem _forms_ (os validadores viram fábricas de callback; `media-validate` vai para o `rte-media-forms`); a guarda `forbiddenImports: ["@angular/forms"]` do `check-size` impede a volta. Custo medido da âncora: +820 B no `editor` (< 1,5 kB do gatilho da E2; a comparação com o plano B da E2 não foi necessária).
21. Revisões com escopo limitado nos reparos (T1, T3, T5, T8): reparo coberto por teste RED dispensa nova revisão.
22. Chaves do protótipo (`x.constructor`, `x.__proto__`) em tabelas de tipo/extensão: mapas de protótipo nulo congelados; casos de nome de arquivo hostil dão `'type'`, nunca `TypeError`. `uploadReason` com `try/catch`; `imageTypes` que não é _array_ avisa em desenvolvimento.
23. `srcset` vazio devolvido pelo servidor falha o envio (`'response'`), como qualquer `srcset` recusado.
24. **Readquirir a mídia pela identidade do nó**, não por proximidade: o marcador, ao perder o nó (desfazer/refazer), só o retoma no ponto colapsado dentro do `apply` do plugin e com o mesmo tipo e `src` (sem busca por vizinhança, que prendia a mídia seguinte a um nó alheio); nó já ocupado por outra entrada do gesto é recusado nos dois lados (propriedade com `src` repetido).
25. **Fix 3 da T5 (identidade):** `deleteRange` que cruza fins de bloco colapsa a faixa longe de onde o `undo` devolve o nó; o `history` devolve o **mesmo objeto**, então a retomada passa a comparar a identidade do nó (conferido no ProseMirror por script), com custo limitado e referências liberadas. **Caveat:** uma cópia por arrasto (Alt+arrastar) compartilha a instância do nó e pode, em teoria, substituir o original apagado; aceito.
26. Registrar os _jobs_ antes do `dispatch` (o marcador na tela é o elemento do gerenciador); recusas `type`/`size`/`count` anunciadas numa só mensagem por gesto; `manager.ts` dividido (`progress`, `arrival`, `marker-element`, `host`).
27. **Ruling 28 do ledger, _chunk_ `rte-upload`:** a maquinaria (gerenciador, marcadores, ordem, chegada, progresso, bandeja e a leitura da resposta, `response.ts`/`readUploadedMedia`) é um _chunk_ por `import()` carregado **só com configuração de upload** (em ocioso, sem gesto); config, validação (`rules.ts` entra no principal pelo _host_), rótulos, fachada e o manipulador de entrada ficam no principal. O salto de ~6 kB no principal que a primeira implementação causou (editor 27011 → 32627, `src/upload/*` ~4,7 kB) saiu do `editor`. Sub-rulings 7b-1..7: (1) o plugin é registrado ao carregar o _chunk_ (`registerPlugin` sem transação); (2) gestos antes da chegada ficam em **buffer na ordem** e são atendidos ao carregar; (3) **falha de carga → `'unavailable'`** para o buffer e para os gestos seguintes; (4) **sem nova tentativa após falha de carga** (recarregar a página): uma segunda tentativa esconderia uma configuração de _build_ errada e reabriria a corrida do buffer; (5) trocar a configuração com o _chunk_ em voo descarta o buffer da config antiga; (6) a guarda de conteúdo do `check-size` (`forbiddenContent`) impede que `manager`/`extension`/`marker-element` voltem ao principal; (7) o gatilho de carga não confere `rules()` (um esquema sem mídia carrega o _chunk_ à toa; custo aceito).
28. **Ruling 29, manipulador de entrada no principal** (`input.ts`, prioridade 1100): `handlePaste`/`handleDrop` sempre presentes; com config e arquivos, `preventDefault`, posição e `uploadRuntime.start` (buffer antes do _chunk_). Vale também depois de falha de carga (o arquivo não é aberto pelo navegador). As recusas da E5 saem **de forma síncrona** pela fachada e só os aceitos vão ao buffer. `dragenter`/`dragover` com `Files` sempre `preventDefault`; `drop` com arquivo sempre `preventDefault` (E13/R3). O `Dropcursor` vive por `addEventListener`, não pelo retorno do plugin.
29. **Ruling 33:** `pendingUploads()` conta os gestos aceitos ainda em buffer; sem isso `rteUploadsFinished` deixaria o formulário seguir durante o carregamento do _chunk_.
30. **Ruling 36/37 (T10):** a porta de diálogo é nula só quando imagem **e** vídeo estão sem tipos (`imageTypes` vazio não tira a Origem do diálogo de vídeo, E14/R9); MB nunca subestima (`floor`, mínimo 0,1); o arquivo é limpo ao alternar regras. R-T10-1..5 (detalhe no relatório da T10): marcador em `req.range.to` (ruling 16); `RteDialogUploads.start` devolve `boolean` e adapta o `> 0` do gerenciador; `check(file, type)` antes de enviar, com o `type` explícito do diálogo; `accept` com tipos e extensões da E5.
31. **Ruling E19, desvio da T11:** o caminho de controle customizado do Angular (`FormValueControl`) **não lê `NG_VALIDATORS`**. As diretivas `rteUploadsFinished`/`rteImagesHaveAlt` então **acrescentam o validador ao `NgControl`** num `effect` (em vez de só prover `NG_VALIDATORS`) e disparam a revalidação ao mudar o _signal_. **Caveat:** `setValidators()`/`clearValidators()` do código do consumidor remove o validador (README); anexar só no `effect` deixa um controle ainda não ligado, ou um `[formControl]` trocado, sem validador até a contagem mudar (reanexar na troca fica como melhoria, ver Pendências); um `registerOnValidatorChange` registrado depois do primeiro `attach` deixaria os dois caminhos ativos (registrado como risco, sem caso conhecido).
32. **Revisão da T9, limites aceitos:** (a) soltar sobre as alças de redimensionar, a barra ou a bandeja ainda deixa o navegador abrir o arquivo (o `drop` só é interceptado sobre o editável); (b) arrastar uma imagem **entre editores** sem adaptador é ignorado no Chromium (aceito; opção futura: deixar o ProseMirror tratar o `text/html` quando não há adaptador); (c) antes da chegada do _chunk_, um gesto com recusa e aceites produz **dois anúncios** (recusas síncronas + início).
33. Modo econômico (ruling 38/41 do _ledger_, pedido do usuário): Sonnet em implementação e revisão, sem re-revisões de _minors_, Chromium por tarefa, uma revisão final e a rodada nos 3 motores **uma vez**, depois da onda de correções.

**Rulings de tarefa:**

- T7 (`httpUploadAdapter`): 956 B gzip, sem dependência; erro com a marca (`name === 'RteUploadError'` + `reason`) sem importar o principal (R1); `headers()` rejeitado vira `'server'`; `total` 0 pode dar progresso `NaN` (tratado como indeterminado).
- T8: marcador e bandeja no _chunk_ `rte-upload`; bandeja montada após o primeiro envio (sem `@if` que remonte); foco do item que some (conclusão/erro) vai ao próximo, ao anterior ou ao editável; troca de idioma não re-anuncia; `alt=""` conferido no HTML; o `serve.mjs` registra o nome dos envios não concluídos.
- T11: `pendingUploads()` e `imagesMissingAlt()` leem sinais; mensagens por `formatRteError` e `RteValidationError` estendidos.
- T12: `preview.ts` e `object-url.ts` (sonda de `createObjectURL`/`revokeObjectURL`); a propriedade R11 já passava com o código das T5–T8 (provas de segurança só confirmam).
- T13: `mediaFormsChunk` (helper) e N38 com os ticks do envio; nenhuma expectativa de spec antiga mudou além das da E2.

### (c) Mudanças na spec

- **R2:** a contagem de blocos `@defer` e a estrutura "um arquivo só para os formulários" mudam por força da E2 (rulings 2 e 3).
- **E2:** além do bloco de pré-carga, o `RteEditor` consulta a falha de mídia por uma bandeira própria (ruling 1).
- **E14/§4:** posição do marcador do diálogo em `req.range.to` (ruling 16).
- **E19:** as diretivas acrescentam o validador ao `NgControl` (ruling 31).
- **E25:** ponte `setUpload(id, mode, query?)` (ruling 14).
- **Arquitetura (adição):** a maquinaria do envio é o _chunk_ `rte-upload` (ruling 27 do _ledger_, 7b) e o manipulador mínimo de colar/soltar fica no principal (ruling 29). A spec descrevia uma `RteUploadExtension` "sempre registrada".
- **R16:** o `editor` cresceu acima da expectativa de +3–4,5 kB (ver (d)); orçamento pela regra do D26.
- **§7:** critérios marcados com a evidência; o do CI do PR fica aberto.
- **`docs/specs/README.md` e `05-editor-angular.md`:** 05c2a de "a executar" para "concluída; falta o CI do PR".
- **Core:** `setImage`/`setVideo` com `{ at }` (aditivo; changeset do core).

### (d) Números (2026-10-06)

Tamanho (`min+gzip`, Angular, Tiptap, `@cds/*`, `lowlight` e `highlight.js` externos; `editor`/`whole` com `externalChunks: "dynamic"`, os demais medem o _chunk_ ou o entry; orçamento = `ceil(medido × 1,15 / 64) × 64`), medido sobre o código commitado de `d7b8adb` com o _build_ limpo:

| Cenário          | Antes (05c1) | Agora | Orçamento antes | Orçamento agora |
| ---------------- | ------------ | ----- | --------------- | --------------- |
| `editor`         | 26200        | 31331 | 30144           | 36032           |
| `whole`          | 26256        | 31454 | 30208           | 36224           |
| `dialogs`        | 10022        | 5591  | 11584           | 6464            |
| `media` (novo)   | (no dialogs) | 7479  | -               | 8640            |
| `floating`       | 7440         | 7441  | 8576            | 8576 (igual)    |
| `upload-runtime` | -            | 6525  | -               | 7552            |
| `i18n`           | 3749         | 4422  | 4352            | 5120            |
| `validators`     | 1156         | 2048  | 1344            | 2368            |
| `upload` (novo)  | -            | 956   | -               | 1152            |

Leitura: o `editor` cresceu **+5131 B** (R16 esperava +3–4,5 kB). Atribuição: âncora do kit de diálogos +820 B (ruling 20), mais config, validação, rótulos, fachada e manipulador de entrada no principal (a leitura da resposta, `response.ts`, está no _chunk_ `rte-upload`); a primeira versão, com a maquinaria toda no principal, media 32627 (+6,4 kB; `src/upload/*` ~4,7 kB), e o _chunk_ `rte-upload` (ruling 27) devolveu ~2,6 kB ao `editor`. O `dialogs` **caiu** 4431 B porque os formulários de mídia foram para o `media`; somados (`dialogs` + `media` = 13070 B) estão +3048 B sobre os 10022 B da 05c1 (a expectativa era `dialogs` ~5–5,5 kB e `media` ~6–7 kB; o `media` ficou acima por causa dos campos de arquivo da T10). O `i18n` +673 B (rótulos novos), o `validators` +892 B (as duas funções e as diretivas, ~0,7 kB esperados) e o `upload` 956 B (esperado ~1,2 kB). Os orçamentos de `editor`, `whole`, `dialogs`, `media` e `upload-runtime` foram **re-derivados** da medição final pela regra do D26 (os de trabalho, medidos com árvore alterada, estavam mais justos que a regra).

R1 (`grep -c` no `dist`): `@angular/forms` no principal e no _chunk_ compartilhado do `.` = 0 (a única ocorrência é um comentário no _chunk_ compartilhado); `rte-angular/upload` no principal = 0; `rte-upload-marker__name` e `rteUploadComposition` no principal = 0 (e presentes no `rte-upload`); `rte-core/embeds` nos _chunks_ `rte-dialogs` e `rte-media-forms` = 0; `rte-video-form`/`rte-image-form` no principal, no `rte-dialogs` e no `rte-floating-menus` = 0; `rte-link-form` no `rte-media-forms` = 0; `cds-rte-angular-upload.mjs` sem `@angular/*` em tempo de execução. `fesm2022` com um _chunk_ de cada: `rte-dialogs`, `rte-media-forms`, `rte-floating-menus`, `rte-upload`. `npm run check:rules` verde.

`editor.css`: 31546 B brutos, 6722 B gzip (05c1: 26055 / 5791).

### (e) Verificação em navegador real

Evidência por spec (`e2e/angular/`; **Chromium** nas tarefas; **os 3 motores, zoneless e zone, só na verificação final**, ruling 41):

- **N33** (`editor-media-chunk.spec.ts`): dois _chunks_, pré-carga em ocioso, falha de carga do de mídia (R1/R2).
- **N34** (`editor-upload-dialog.spec.ts`): envio pelo diálogo, erros no campo, texto alternativo, `Mod+Z` (R7/R9). 12/12 nos 3 motores na T10.
- **N35** (`editor-upload-paste-drop.spec.ts`): colar e soltar com `DataTransfer` real, texto vence, ordem com chegadas fora de ordem, soltar sem adaptador (R8). 16/16 nos 3 motores na T9.
- **N36** (`editor-upload-states.spec.ts`): progresso, fila de 2, cancelar pelo teclado, erros 500/JSON inválido/URL `http:`, propriedade de segurança e _object URLs_ (R5/R10/R11). 29/29 no Chromium na T12.
- **N37** (`editor-upload-forms.spec.ts`): os três modos de formulário, `rteImagesHaveAlt` com imagem colada (R13). 8/8 nos 3 motores na T11.
- **N38** (`editor-upload-a11y.spec.ts`): axe com bandeja e diálogo "Arquivo" em claro, escuro e `forced-colors`, CSP, SSR, hidratação, ticks do envio no _build_ zone (R11/R14/R15). 7/7 no Chromium na T13.
- N1–N32 (inclui N27–N31 após a separação do _chunk_): regressão na rodada final.
- Unitários: `test` e `test-zone` do angular em 1536/1536 na T9b (cada modo); os totais finais saem da verificação final. Propriedades (fast-check) de validação (R4), marcadores e ordem (R6, 1500 execuções em 4 sementes depois do fix 3) e segurança (R11).

**Achados reais da execução** (todos com teste antes da correção):

1. `upload-order.spec.ts` falhou com `FC_SEED=-617190640` já em `e8ae988`: ordem [1,2,0] após `insertText`, `deleteRange` e `undo` numa lista. Causa e correção no ruling 25 (identidade do nó).
2. O kit de diálogos no principal puxava `@angular/forms/signals` (ruling 20), oculto pela medida do `editor` (que mede só o entry); a guarda `forbiddenImports` o expôs.
3. Foco que caía no `body` quando um item da bandeja sumia (T8).
4. `imageTypes` vazio tirava a Origem do diálogo de vídeo (T10/T11, ruling 30).
5. Marcador na tela era um elemento substituto (transação antes do registro dos _jobs_) e recusas no gesto não eram anunciadas (T6, ruling 26).

## Revisão final

Revisões por tarefa (spec ✅) com correções aceitas (T1, T3, T5, T6, T8, T10, T11). A revisão final (Opus, `3c40c1e..76f03f2`) concluiu "pronta após correções" e a onda final (`bc20d81`) aplicou:

- **Importantes (com teste vermelho antes):** (1) `attach()` da fachada: se o editor ficou somente leitura (ou sem mídia no esquema) durante a carga do _chunk_, os gestos em buffer viram `'unavailable'` (um `uploadError` por arquivo e um anúncio) em vez de entrar no gerenciador; (2) `onFocusOut` da bandeja: foco que sai sem `relatedTarget` (clique no nada) zera `focused` (em microtarefa, só se o nó segue conectado), e um envio que termina depois não puxa o foco de volta.
- **Menores:** `AdapterReason` → `RteUploadAdapterReason`, exportado do entry `.`; `response.ts` está no _chunk_ (rulings 27 e (d) e `CLAUDE.md` corrigidos); comentários de `allowDrop` e `mapState` (cópia por arrasto, ruling 25); mensagem do lint do `/upload`; `import` no topo de `table-form.ts`; `inputExtension(): Extension`.

**Verificação final (2026-10-06):** `lint`, `build`, `test`, `test-zone`, `verify-package` e `size` do angular e do core verdes; angular 1597/1597 em `test` e em `test-zone` (61 arquivos), core 1054/1054; `check:rules` e `typecheck:e2e` verdes. E2E `e2e/angular`, `--workers=2`: **Chromium 466 passaram** (2 intermitentes sob carga, verdes isoladas: N23 "setas circulares" zone e N36 "progresso determinado"); **Firefox 464 passaram, 3 ignoradas**, 1 falha (N36 progresso, abaixo); **WebKit 461 passaram, 3 ignoradas, 4 falhas** (abaixo).

- **N36 "progresso determinado cresce" (Firefox, às vezes Chromium):** o motor despeja o corpo de 900 kB no _socket_ de uma vez em _loopback_ (a leitura lenta do servidor não vira contrapressão), e o `progress` salta a ~1 sem valores intermediários. O teste passou a exigir só o valor determinado em [0, 1]; o crescimento é provado nos unitários (bandeja e gerenciador).
- **WebKit, aberto:** `editor-upload-states` "erro (500)" e "erro (http:)" (zoneless) e `editor-upload-a11y` (axe `forced-colors`; região `aria-live` com erro) falham quando rodam depois do teste "cancelar pelo teclado" na mesma execução (isolados, ou com `-g`, passam). Reproduz em `76f03f2`, sem as correções desta onda, e é só do WebKit; nos casos de `states` o servidor recebe o envio e responde 500, a região de status mostra "Could not upload ...: the server refused it." mas `lastUploadError` segue `null`. Causa não isolada; fica como pendência para o CI do PR.

Menores adiados que **seguem** abertos: guarda de conteúdo cobrir `marker-element`; gatilho de carga sem conferir `rules()`; ganchos de teste frágeis (`loaded` privado); caminho de `requestIdleCallback` só no Playwright; guardar todas as instâncias vistas por entrada (`markers.ts`) e teste do caminho de atualização do nó; `dialog: Signal<unknown>` em `editor-bindings.ts`; `waitForTimeout` no N34; vírgula decimal pt-BR no MB do diálogo.

**Adições da revisão final:**

- `uploadFiles()` após falha de carga do _chunk_ devolve a contagem aceita pela E5, ainda que cada arquivo vire `'unavailable'`; no README, "quantos foram aceitos" = aceitos pela E5.
- `cancelAllUploads()` descarta os gestos ainda à espera do _chunk_ sem anúncio nem `uploadError` (cancelar não é erro; esses nunca estiveram na bandeja).
- O teste de _ticks_ do N38 é um limite frouxo; a prova de que o adaptador roda fora da zona é o `upload-manager.spec` (`isInAngularZone`).
- Lacunas de teste conhecidas: `'count'` antes do _chunk_; _dragover_ em `readonly` (E2E); Aplicar antes do _chunk_; laço da E5 duplicado entre fachada e gerenciador (dívida).
- O erro do campo de arquivo não tem `aria-live`, como na 05c1 (foco + `aria-describedby`).

## Pendências conhecidas

- **Evoluções (§2 da spec):** substituir o arquivo de uma mídia existente pelo diálogo (hoje: remover e inserir); enviar arquivo de pôster ou de faixa `.vtt` (só por endereço); "Tentar de novo" num envio que falhou (o marcador some); retomar envio interrompido; redimensionar ou comprimir no navegador; ler o tamanho natural do arquivo; outros tipos (PDF, áudio); colar/soltar no modo _editar_; envio em `readonly`/`disabled`.
- **Colagem de Word/Excel (N35):** o que cada motor põe na área de transferência ao colar de Word ou Excel (texto + imagem renderizada) foi observado só com `DataTransfer` sintético; a E12 (texto vence) cobre o caso, mas a variação entre motores e versões é registrada para a spec 08.
- **Falha de carga do _chunk_ `rte-upload`:** sem nova tentativa (ruling 27); só recarregando a página.
- **Soltar fora do editável** (alças, barra, bandeja) e **arrastar imagem entre editores sem adaptador** (ruling 32).
- **Validadores nas diretivas:** `setValidators()`/`clearValidators()` do consumidor os remove; reanexar ao trocar o controle (ruling 31).
- **`headers()` rejeitado** no `httpUploadAdapter` vira `'server'` (deveria ser `'network'` ou documentado).
- **Vírgula decimal pt-BR** nas dicas de tamanho (i18n).
- **Cópia por arrasto** de mídia compartilha a instância do nó (ruling 25).
- **Leitores de tela** na bandeja e nos anúncios, colar/soltar em motores antigos e no celular: spec 08.
- **Flakes vigiados** (herdados): N5 (arrasto da alça) no Firefox (ADR 0008); "alternar 100×" do lifecycle sob carga; travamento ocasional do Firefox no `goto` do app de teste (repetir com `--workers=1`).

## Consequências

- **05c2b:** `registerExternal?` e `onMediaRemoved?` entram como **membros opcionais** do `RteUploadAdapter` (adaptadores da 05c2a seguem válidos); o aviso de saída e o rascunho leem `pendingUploads()`; `markSaved()` chama `onMediaRemoved(mediaSession().removed)` e não com envio pendente (H6).
- **05d:** `onUiItem` de `image`/`video` abre diálogos que já enviam arquivo; o menu `/` ignora marcadores e não abre em composição; `api-extractor` cobre os tipos da §4 da spec e os entries `/upload` e `/validators`; os orçamentos de desempenho somam o envio.
- **Spec 06:** nada muda no HTML; marcador e bandeja são só do editor.
- **Spec 07:** `examples/server-node` implementa o _endpoint_ do `httpUploadAdapter` com as responsabilidades da E22 (_magic bytes_, limites, autenticação, CSRF, `Content-Disposition`, `nosniff`).
- **Spec 08:** leitores de tela, colar/soltar em motores antigos e no celular, envio de vídeo grande em rede lenta.
