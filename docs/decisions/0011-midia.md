# ADR 0011: Diálogos de mídia, detalhes da imagem e sessão de mídia

- Status: aceita (2026-10-06)
- Spec de origem: `docs/specs/05c1-dialogos-de-midia.md` (parte 5 de 7 da spec 05)

## Contexto

A 05b2a entregou a base de diálogos (`RteDialogs`, `RteDialogController`, `@defer`, `openDialog()`) e a 05b2b os menus flutuantes (`@defer`, `RteFloatingMenuKind`, origem do diálogo no editável). A 05c foi dividida: a **05c1** (esta) dá ao `rte-editor` a inserção e a edição de mídia **por endereço** (imagem, vídeo e _embed_), os itens `image`/`video`/`embed` da barra, os menus flutuantes de vídeo e _embed_, o "Detalhes da imagem…", a seleção de mídia por clique e a sessão de mídia (`mediaChange`/`mediaSession`); a **05c2** traz arquivos (upload, colar, soltar) e rascunho. Tudo foi provado em jsdom (zoneless e zone.js) e nos 3 motores do Playwright, com CSP estrita, _prerender_ e hidratação. O 0010 é dos menus flutuantes; este é o 0011.

## Decisão

### (a) Decisões da spec (V1–V18)

| #   | Decisão                                                                                                                                                                                                                                                                         | Motivo                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | A 05c é dividida: 05c1 = mídia por endereço, menus, seleção por clique, `mediaChange`/`mediaSession`; 05c2 = arquivos, `uploadError`, os dois validadores, rascunho, `isDirty`/`markSaved()`.                                                                                   | Juntas passam de ~20 tarefas; o envio de arquivo estende os diálogos e a limpeza de órfãos usa a sessão, então estes vêm primeiro.                    |
| V2  | Três tipos de diálogo, `RteDialogKind` + `image`/`video`/`embed`, modos _inserir_ e _editar_ pelo alvo (`NodeSelection` do tipo = editar). Sem tipo `imageDetails`.                                                                                                             | Uma regra para todos os diálogos; barra, menu, `/` (05d) e `openDialog` concordam.                                                                    |
| V3  | Mesmo `@defer` dos diálogos; `rte-dialogs.ts` dividido em um componente por formulário (`src/dialogs/forms/`). Acima de 12 kB gzip o ADR reavalia um segundo `@defer`.                                                                                                          | Um _chunk_ com `prefetch on idle` já tira a latência; dois somariam espera sem ganho no _bundle_ inicial. Resultado em (d): 10022 B, abaixo de 12 kB. |
| V4  | Endereço de mídia validado por `normalizeAttribute(regra do schema(), entrada.trim())`; o que se aplica é o canônico; sem completar `https://`, sem exceção para `http:`/`data:`/`blob:`.                                                                                       | Uma fonte da verdade (o comando e o sanitizador derivam do mesmo esquema); adivinhar o esquema de um endereço de arquivo erra mais do que acerta.     |
| V5  | _Embed_ aceito **se e somente se** `editor.can().setEmbed(url)`; o _chunk_ não importa `@cds/rte-core/embeds`; no modo _editar_ só a legenda (`updateEmbed`) e a URL como texto.                                                                                                | O `src` do _embed_ é sempre montado pelo core; sem `toEmbed` duplicado na UI.                                                                         |
| V6  | Imagem: Endereço, Texto alternativo (até 1000), "decorativa", Legenda e Crédito (até 300), e ao editar Alinhamento e Largura (1–10000). Editar = **uma** cadeia `updateImage` + `setImageSize`; "Remover" no modo editar.                                                       | Detalhes num formulário só; largura é a alternativa às alças (WCAG 2.5.7); uma cadeia = um passo de desfazer e uma emissão (D8).                      |
| V7  | O diálogo nunca produz `alt: null`: texto ou `''` com "decorativa". O HTML canônico escreve `alt=""` nos dois casos, então `rteImagesHaveAlt` não pode ser só do valor e vai para a 05c2, sobre a contagem de `alt: null` da sessão.                                            | WCAG 1.1.1, técnica H67; mudar o contrato do HTML mexeria no esquema, no sanitizador e na spec 06.                                                    |
| V8  | Vídeo: Endereço, Pôster, Legenda e 0 a 10 faixas (`applyEach`) em `<fieldset>`/`<legend>`; erros no campo; "Padrão" exclusivo; foco previsível ao acrescentar/remover; dica da WCAG 1.2.2 sem faixa `captions`.                                                                 | O core descarta faixas inválidas: a UI recusa antes, para nada sumir em silêncio; WCAG 2.4.3.                                                         |
| V9  | Itens `image`/`video` (recurso `media`) e `embed` (recurso `embeds` e provedor ativo), `aria-haspopup="dialog"`, sem `aria-pressed`; "Editar …" e `--active` com a mídia selecionada. _Presets_: `article` + `['image','embed']`, `full` + `['image','video','embed']`.         | Mesmo padrão dos itens de diálogo; se o comando recusar na aplicação, o diálogo fecha como cancelamento (ruling 4).                                   |
| V10 | `RteFloatingMenuKind` + `video`/`embed` (chaves separadas); prioridade imagem > vídeo > _embed_ > link > texto > tabela; "Detalhes da imagem…" antes dos alinhamentos; vídeo/_embed_: "Detalhes…" e "Remover…"; origem do diálogo no editável (M14).                            | Fecha a consequência do ADR 0010.                                                                                                                     |
| V11 | `pointer-events: none` em `video`/`iframe` só sob o `.rte-editor` editável, no `editor.css`; `readonly`/`disabled` não recebem.                                                                                                                                                 | Um `iframe` engole o clique e os controles do `video` tocariam em vez de selecionar; a regra não pode vazar para a página publicada (spec 06).        |
| V12 | Depois de aplicar: inserir deixa a mídia selecionada e o foco no editável; editar mantém a `NodeSelection`; remover deixa o cursor onde o nó estava; sem decoração de seleção pendente.                                                                                         | Descobrir os detalhes logo depois de inserir; lição 14.                                                                                               |
| V13 | Sessão de mídia: contagem de referências dos endereços de `img[src]`, cada URL do `srcset`, `video[src]`, `poster` e `track[src]` (_embeds_ fora); `mediaChange` `{ added, removed }` depois do `value`; `mediaSession` = `current`, `added`, `removed` (líquido), incremental. | O consumidor limpa órfãos; desfazer pode trazer de volta um endereço "removido": usar o líquido ao salvar, com carência no servidor.                  |
| V14 | Rótulos novos em `toolbar`, `dialogs` e `floating` (pt-BR, en, es), troca de idioma ao vivo com o diálogo aberto; `dialogs.remove` passa a ser usado.                                                                                                                           | D15; completude testada.                                                                                                                              |
| V15 | CSS no `editor.css` (camada `rte.components`, só `--rte-*`): `__fieldset`/`__legend`/`__readonly`, `pointer-events`, contorno de seleção de `video`/`iframe`, `forced-colors`.                                                                                                  | CSP (D16); a aparência `rt-*` fica no `content.css`.                                                                                                  |
| V16 | Nenhum endereço entra sem a regra do esquema (V4) ou o `toEmbed` (V5); `iframe` só com valores fixos; sem pré-visualização; README documenta CSP e `mediaHosts`. Rota `media` com CSP ampliada (ruling 5).                                                                      | Defesa em profundidade; privacidade: o navegador do redator requisita o endereço assim que ele entra no documento.                                    |
| V17 | O rastreador roda no ouvinte de `transaction` (fora da zona); só `mediaChange` entra na zona e só com delta; `mediaSession` é _signal_ escrito uma vez por transação que muda o conjunto.                                                                                       | Mesma suíte nos dois modos; sem `NG0100`/`NG0101`.                                                                                                    |
| V18 | Unitários em `test`/`test-zone`; navegador real na rota `media` do app de teste nos 3 motores, nos _builds_ zoneless e zone.                                                                                                                                                    | Regra principal do repositório.                                                                                                                       |

Diretrizes **P1–P16** (Apêndice A da spec, para a 05c2; **não implementadas aqui**, vinculantes como diretrizes): P1 adaptador `RteUploadAdapter` (`uploadImage`, `uploadVideo?`, `registerExternal?`, `onMediaRemoved?`); P2 `httpUploadAdapter` em `@cds/rte-angular/upload` com `XMLHttpRequest` e cancelamento real; P3 resposta do adaptador revalidada pela regra V4; P4 validação de tipo e tamanho antes do envio (sem `svg`); P5 marcador de envio como decoração de _widget_; P6 pré-visualização por _object URL_ desligada por padrão; P7 colar e soltar arquivos; P8 `uploadError` tipado; P9 "Enviar arquivo" nos diálogos de imagem e vídeo; P10 ciclo de vida (abortar em destruição, troca e carga externa); P11 rascunho opt-in e restauração nunca automática; P12 `isDirty`/`markSaved()` chamando `onMediaRemoved(mediaSession().removed)`; P13 validadores `rteImagesHaveAlt`/`rteUploadsFinished` sobre estado do editor; P14 `beforeunload` opt-in; P15 endpoint falso no `serve.mjs` e `DataTransfer` real; P16 divisão da 05c2 se passar de ~11 tarefas.

### (b) Rulings

**Pré-voo** (varredura do plano contra o código; valem para a execução):

1. Os ícones `image`/`video`/`embed` passam da T2 para a T3 (junto dos ids da barra); a T2 acrescenta só `mediaDetails`: `RteIconName` deriva de `RteToolbarItemId` e o teste de chaves quebraria duas vezes.
2. A prova "menus fora do principal" usa `grep -c "rte-video-form"` e `grep -cE "\.videoDetails\b|\.embedDetails\b|removeMedia"` no `cds-rte-angular.mjs` (→ 0); o `grep videoDetails` cru acha a chave de `RTE_LABELS_EN`, que é do _chunk_ principal por desenho (D15).
3. O N31 (zone) não usa "`zoneTurns()` igual antes e depois de 20 teclas": cada tecla emite `value` por `zone.run` (D8). Guarda real: ver ruling R-T13-2.
4. Comando de mídia que devolve `false` fecha o diálogo **como cancelamento** (V9): foco devolvido à origem ou ao editável, documento intacto, aviso `[rte-editor]` 1× em `isDevMode()`. A spec vence o pré-voo 8. `controller.ts` ganhou o `restoreFocus` na recusa (vale para os sete diálogos), só com o documento intacto (revisão final: a cadeia do Tiptap dos diálogos antigos despacha mesmo com um passo `false`, e então o foco fica onde o comando o deixou).
5. **Desvio da V16 (rota `media`):** CSP com `img-src` e `media-src 'self' https://media.example.test` além do `frame-src` dos três provedores. Sem isso o N27 com `https://media.example.test/a.png` gera violação antes de o `context.route` responder; é a CSP de consumidor que o README documenta. As outras rotas seguem com a CSP estrita da 05a.
6. **Ausência de MP4 (pré-voo 16, desvio da §6.2/§9):** só `e2e.webm` (VP8) e `e2e.vtt`. Gerar H.264 exigiria dependência nova (R1). O N28 confere `textTracks` nos 3 motores; no WebKit (sem VP8 no Linux) a prova de carga da _cue_ foi feita mesmo assim (o `.vtt` carrega) e o resto só pelo DOM. Pendência abaixo.
7. A propriedade R6 de imagem e vídeo exercita o **validador do formulário** contra `normalizeAttribute(regra do schema(), s.trim())`, com o caso pelo DOM (aceito ⇒ `src` canônico, recusado ⇒ HTML inalterado); comparar `canonicalMediaUrl` com a fórmula que a define seria teste-espelho. A do _embed_ compara com um editor de controle separado.
8. `index.spec.ts`: `expectTypeOf<RteDialogKind>().toEqualTypeOf<…sete tipos…>()` no lugar de uma atribuição de tipo sem asserção.
9. A T1 move para `dialogs/form-helpers.ts` `focusFirstInvalid` e `langCodeValidator` (usado pelo formulário de idioma e pelas faixas): nenhum formulário copia esses corpos.
10. `mediaUrlValidator` nunca dá erro com valor vazio (o vazio é do `required`); a opção `optional` saiu da assinatura (o texto mostrado não depende da ordem de registro).
11. Endereços de mídia são validados com `trim` (V4 vence a redação curta da R6); o idioma da faixa segue o diálogo de idioma (sem `trim`).
12. N32: a guarda original `B − A ≤ 1 ms` mede o documento com mídia, não só o rastreador; ver ruling 29.
13. Regressão prevista: o menu de imagem tem "Detalhes da imagem…" como primeiro item (V10), e os unitários que esperavam o alinhamento primeiro foram corrigidos na T8. Nenhum E2E dependia disso (T13 conferiu).
14. Casos novos: legenda e crédito com 301 caracteres → `errorMaxLength(300)` e nada aplica (imagem, vídeo e _embed_).
15. A página `media` do app de teste mostra também o último `mediaChange` e o `mediaSession()` (`<output>`/`<pre>` com `data-testid`), além da ponte.
16. Listas de `RteMediaChange`/`RteMediaSession` ordenadas por unidade de código (`a < b`), não `localeCompare` (determinístico entre jsdom e os 3 motores).

**Execução** (numeração do _ledger_ `progress.md`, a mesma das citações deste ADR):

17. Modelos: Opus nas tarefas 3–9 e revisões delas; Sonnet nas demais (otimização aprovada pelo usuário).
18. Revisão da T1 em paralelo com a T2 (arquivos disjuntos).
19. **Vídeo com mais de 10 faixas** (HTML colado): todas as faixas são carregadas, "Acrescentar faixa" fica desabilitado com ≥ 10, sem erro de formulário, e aplicar preserva todas. Um corte (`slice`) descartaria faixas em silêncio, contra a R4.
20. **Tamanho do _chunk_ dos diálogos aceito:** estimativa ~10,5–10,9 kB, medido 10022 B (< 11 kB e < 12 kB da V3), sem segundo `@defer`. **A 05c2 começa separando os formulários de mídia num `@defer` próprio** (um _chunk_ `media`, auxiliares no principal) antes dos campos de arquivo.
21. Revisão da T6 em paralelo com a T7.
22. Revisão da T7 (só testes) em paralelo com a T8.
23. Revisão da T8 em paralelo com a T9.
24. **URLs canônicas na sessão:** o rastreador normaliza os endereços com as mesmas regras do esquema que o `renderHTML` usa e descarta os inválidos (`updateAttributes`, `setContent` por JSON e `setNodeMarkup` incluídos), e `mediaChange` só sai junto de `value`. Contar valores crus produziria `removed` de uma URL ainda presente no HTML, risco de exclusão no `onMediaRemoved` da 05c2.
25. Revisão da T10 em paralelo com a T11.
26. Revisão da T11 em paralelo com a T12.
27. **Os botões de `.rte-dialog__actions` não tiram o foco do campo:** `mousedown` com `preventDefault` (em vez de "não marcar como tocado quando o foco vai para as ações", como a ruling do _ledger_ pedia; mesmo efeito, aceita). Motivo: no Firefox o clique em "Aplicar" logo depois do `blur` de um campo se perdia porque o erro inline que aparecia deslocava o botão entre `mousedown` e `mouseup`. Vale para os sete formulários (defeito de produto pré-existente, achado na T11).
28. Revisão da T12 em paralelo com a T13.
29. **R14 é limite do custo do _rastreador_** (redação da spec: "o rastreador não pode somar mais de 1 ms à mediana"). Guarda do N32 = ouvintes de `transaction` menos a serialização, pareado por tecla, com B−A ≤ 1 ms e B ≤ 1 ms. O B−A da tecla inteira é informativo (ver (d)).
30. Revisão da T13 em paralelo com a T14.

**Rulings de tarefa:**

- T3: `NodeSelection` de **outra** mídia (vídeo selecionado, diálogo de imagem) → `insert` sobre o intervalo do nó; o core insere **depois** do vídeo, que é mantido, e a imagem fica selecionada. `alignNames` vem direto de `labels.floating.imageAlign*` (sem importar `floating/commands.ts` para o principal).
- T4: `onDecorative` esvazia o `alt` ao marcar e ao desmarcar; largura não numérica vale como vazia; no teste por DOM a expectativa canônica sai do `input.value` depois de digitar (o `<input type="text">` remove LF/CR). `runMedia` aplica em cadeia aninhada: nada é despachado se um comando recusa; um passo de desfazer no sucesso.
- T5: lista de faixas num `div role="group"` com `h3.rte-dialog__subtitle`; `srclang` gravado canônico (`normalizeAttribute`, sem `trim`); "Padrão" lê `event.target.checked`; um só componente (ts 265 linhas, html 210).
- T6: rótulo da URL somente leitura do _embed_ num `span.rte-dialog__label` seguido de `p.rte-dialog__readonly` (um `<p>` não aceita `label for`); legenda do _embed_ também até 300.
- T8: as três mídias dos menus compartilham um `@default` dirigido pela tabela `RTE_FLOATING_MEDIA` (no lugar de `@case` duplicados); separadores: imagem = Detalhes · alinhamentos · Remover; vídeo/_embed_ = Detalhes · Remover. Correção fora dos Files: o `toolbar.spec.ts` "Insert table…" emitia um pedido real e, com o _chunk_ já carregado (`isolate: false`), abria um `<dialog>` sem calço e causava 27–46 falhas em cascata; passou a usar espião no-op.
- T9: `srcset` que o `parseSrcset` recusa não contribui; o mesmo endereço em `src` e `srcset` do mesmo nó conta duas referências; o teste de zona filtra as entradas em `NgZone.run` vindas de `onTransaction`.
- T10: o duplo clique do ProseMirror (< 500 ms e 10 px) no Firefox exigiu separar os cliques do teste; o embed do fixture não leva o `style` (`aspect-ratio`).
- T12: `MEDIA_FIXTURE` passou à forma **canônica** (`loading`/`decoding`, `alt=""`, `controls=""`/`playsinline=""`); a imagem "sem alt" virou `alt=""` (V7); `MEDIA_FIXTURE_OUT` dá a saída. O `style="aspect-ratio"` que o core acrescenta ao `iframe` fica fora do fixture (sob CSP estrita, recarregado, viola `style-src-attr`; só o Chromium reporta ao parsear, ruling 28 do ADR 0007); o N30 compara ignorando esse atributo. O diálogo aberto por um botão fora do host devolve o foco ao editável (a origem de `openDialog` só é elemento do host, `focusOrigin` da 05b2a).
- T13 (ver (d) e (e)): **R-T13-1** guarda do N32 = custo do rastreador isolado; **R-T13-2** R13 (zone) medida **por tecla** (mediana 1 turno com e sem mídia, `mediaChanges` inalterado) e não em lotes em rajada, porque o ProseMirror junta teclas e os lotes de 20 teclas dão 11–14 transações; **R-T13-3** em `forced-colors` a URL somente leitura (`.rte-dialog__readonly`) usa `CanvasText`, como a dica.

### (c) Mudanças na spec

- **V9/V10:** "aplicável sempre" confirmado; a recusa de comando fecha como cancelamento com o foco devolvido (ruling 4, vence o pré-voo 8).
- **V16 sobre a rota `media`:** além do `frame-src`, `img-src` e `media-src` (ruling 5).
- **§6.2 e §9:** sem MP4 (ruling 6).
- **§6.2 N31:** R13 por tecla (R-T13-2). **N32:** guarda sobre o rastreador (ruling 29).
- **V8:** vídeo com mais de 10 faixas mantém todas (ruling 19).
- **V13:** endereços canônicos pelo esquema (ruling 24).
- **Classes públicas acrescentadas:** `.rte-dialog__tracks`, `.rte-dialog__subtitle`, `.rte-dialog__track-add`, `.rte-dialog__track-remove` (além das de V15).
- **R15:** `editor`/`whole`/`dialogs`/`floating`/`i18n` reorçados; a expectativa de "~1,5 kB no `editor`" foi superada (ver (d)).
- **§7:** critérios marcados com a evidência; o do CI do PR fica aberto.
- **`docs/specs/README.md` e `05-editor-angular.md`:** 05c1 de "a executar" para "concluída; falta o CI do PR".

### (d) Números (2026-10-06)

Tamanho (`min+gzip`, Angular, Tiptap, `@cds/*`, `lowlight` e `highlight.js` externos; `editor`/`whole` com `externalChunks: "dynamic"`, `dialogs` e `floating` medem o _chunk_; orçamento = `ceil(medido × 1,15 / 64) × 64`):

| Cenário      | Antes (05b2b) | Agora | Orçamento antes | Orçamento agora |
| ------------ | ------------- | ----- | --------------- | --------------- |
| `editor`     | 23181         | 26200 | 26688           | 30144           |
| `whole`      | 23241         | 26256 | 26752           | 30208           |
| `dialogs`    | 5048          | 10022 | 5824            | 11584           |
| `floating`   | 7077          | 7440  | 8192            | 8576            |
| `i18n`       | 2643          | 3749  | 3072            | 4352            |
| `validators` | 1156          | 1156  | 1344            | 1344 (igual)    |

O `editor` cresceu +3019 B (a expectativa da R15 era ~1,5 kB: o rastreador de mídia, os itens e _presets_ e os rótulos em inglês, que são do principal); o `dialogs` +4974 B (dentro dos 4–6 kB); o `floating` +363 B; o `i18n` +1106 B (rótulos novos em pt-BR e es). O `RteDialogFormBase` e os ajudantes de formulário (`focusFirstInvalid`, `langCodeValidator`, `dialogErrorText`) ficam no _chunk_ `rte-dialogs`, como `runMedia` e `canonicalMediaUrl` (conferido no `dist`): só os diálogos os usam, então não vão ao principal nem criam um terceiro _chunk_. **V3:** `dialogs` = 10022 B < 12288 B: nenhum segundo `@defer` agora (ruling 20); a 05c2 começa por separar os formulários de mídia.

R1 (`grep -c`): `rte-core/embeds` no _chunk_ dos diálogos = 0; `rte-video-form` no _chunk_ dos menus e no principal = 0; `videoDetails` no _chunk_ dos diálogos = 0; `\.videoDetails|\.embedDetails|removeMedia` no principal = 0. Um único _chunk_ `rte-dialogs-<hash>` e um único `rte-floating-menus-<hash>`.

`editor.css`: 26055 B brutos, 5791 B gzip (05b2b: 23581 / 5428).

**N32, desempenho** (R14; documento de 20 mil palavras, 2000 parágrafos de 10 palavras; A = sem mídia, como N8/N15/N26; B = com 200 imagens espalhadas; mediana em ms; N8 = `handleTextInput` + `dispatch` + validação; o relógio é de 1 ms no Firefox e no WebKit e de 0,1 ms no Chromium). Ao lado, os números do N15/N26 do ADR 0010 (mediana N8, sem mídia):

| Motor    | N15 (0010) N8 | A N8  | B N8  | B−A N8 (tecla inteira, informativo) | B−A +render | serialização B−A | ouvintes A → B | rastreador (ouvintes − serialização, pareado) A / B / B−A |
| -------- | ------------- | ----- | ----- | ----------------------------------- | ----------- | ---------------- | -------------- | --------------------------------------------------------- |
| Chromium | 9,75          | 9,50  | 11,80 | 2,30                                | 2,40        | 1,10             | 2,00 → 3,15    | 0,00 / 0,00 / 0,00                                        |
| Firefox  | 11,00         | 13,00 | 15,00 | 2,00                                | 5,00        | 2,00             | 4,00 → 6,00    | 0,00 / 0,00 / 0,00                                        |
| WebKit   | 10,50         | 13,00 | 15,00 | 2,00                                | 2,00        | 1,00             | 4,00 → 5,00    | 0,00 / 0,00 / 0,00                                        |

Leitura (**R14 é limite do _rastreador_**, ruling 29): o custo do rastreador, medido como os ouvintes `transaction` menos a serialização do `value`, pareado por tecla, fica abaixo da resolução do relógio nos 3 motores (guarda: B−A ≤ 1 ms e B ≤ 1 ms; é um limite superior, pois inclui também `value.set`, a ponte e o _sink_ dos menus). O B−A da **tecla inteira** (2,0–2,3 ms) é só informativo e **não vem do rastreador**: decompõe-se em serialização do documento maior a cada tecla (D8: `getRteHtml` completo, ~1–2 ms), o validador sobre o HTML maior, a atualização da vista do ProseMirror, o desenho das 200 imagens e a detecção de mudanças. Prova determinística: `media-session.spec.ts` "visited independe do número de mídias" (o rastreador visita os mesmos nós, < 10 por tecla, com e sem 200 imagens). **Para a 05d:** o custo por tecla com mídia vem da serialização completa do D8, não do rastreador; se o orçamento de digitação da 05d apertar, o adiamento da serialização (`updateOn`) é a alavanca. A medida lê o campo privado `callbacks` do `EventEmitter` do Tiptap só durante a medição e falha alto depois de uma atualização do Tiptap que mude isso. Na regressão completa do Firefox: B−A N8 1,00, +render 2,00, serialização 1,00, rastreador 0,00.

### (e) Verificação em navegador real

- **N27** (imagem), **N28** (vídeo e _embed_, faixas carregadas pelo navegador), **N29** (barra, menus e seleção por clique), **N30** (sessão de mídia), **N31** (acessibilidade, tema, CSP, SSR, _chunk_ e R13) e **N32** (desempenho): `e2e/angular/editor-media-{image,video-embed,menus,session,a11y,perf}.spec.ts` e `editor-dialogs*.spec.ts` nos 3 motores, nos _builds_ zoneless e zone; N1–N26 continuam verdes.
- Regressão completa `e2e/angular` (Tarefa 13): Chromium 391 passed; WebKit 386 passed (3 skipped); Firefox 388 passed (3 skipped, 1 falha: o N5 de arrasto da alça da imagem, flake **anterior** à 05c1, já vigiado no ADR 0008). Depois das correções, N31+N32 isolados 11/11 por motor. Nenhuma regressão N1–N30 atribuível à 05c1.
- Unitários: 1268 por modo (`test` e `test-zone`); o `editor.lifecycle.spec.ts` "alternar 100×" é um flake de carga da máquina (passa sozinho 12/12).

Achados reais do navegador (todos com teste antes da correção):

1. **Firefox, clique em "Aplicar" perdido:** o erro inline que aparece no `blur` desloca o botão entre `mousedown` e `mouseup`. Correção: `mousedown` com `preventDefault` nos botões de `.rte-dialog__actions` (ruling 27). RED em unitário (7/7) e no E2E do Firefox.
2. **Firefox, cancelar "Detalhes…" de vídeo/_embed_ escondia o menu:** o `close()` nativo devolve o foco ao editável antes do controlador; `commands.focus()` vira no-op e o Firefox, que põe o cursor no início ao focar, troca a `NodeSelection` por `TextSelection`. Correção em `restoreFocus`: `if (editor.view.hasFocus()) editor.view.focus()` (regrava a seleção no DOM).
3. **WebKit, `forced-colors`:** a URL somente leitura do _embed_ ficava em `GrayText` (contraste serious no axe, o WebKit emulado liga `(forced-colors: active)` sem forçar as cores) → `CanvasText` (R-T13-3).
4. **Firefox, ProseMirror:** dois cliques a menos de 500 ms e 10 px são um duplo clique; os testes separam os cliques de mídia.
5. **Teste do N27 no Firefox:** a falha do "alt vazio" era o `beforeEach` (`waitForEditor` de 5 s com `e2e.webm` pendente), não o mecanismo do clique; 20 s.
6. **Nx 23 no Windows:** falso "Recursive task invocation detected" por PID reutilizado no `webServer`; contorno: repetir o comando.

## Revisão final

Revisões por tarefa (spec ✅) com correções aceitas: T1 classe base `RteDialogFormBase` e `form-helpers.ts`; T5 faixas > 10; T9 URLs canônicas e `mediaChange` só com `value` (ruling 24); T11 clique perdido (ruling 27) e cobertura de editar/remover, foco e `Mod+Z`; T12 `MEDIA_FIXTURE` com imagem sem alt, N29 com `embed: false`. Menores aceitos sem mudança na onda das tarefas: teste de recusa parcial em modo editar; largura não numérica apaga em silêncio (ruling T4); `hostValue` mutável no `dialog-defer.spec`; rótulo "Endereço da página" mostrando o `src` do player; busca do nó duplicada; `rte-floating-menus.ts` (507 linhas) para extrair um `placement-controller.ts`; `nav-media` mantém o CSP estrito da home.

Revisão final da 05c1 (`5837ed1..2241230`, veredito "pronta com correções"): segurança, fronteiras de _chunk_, sessão de mídia, zona e SSR sem achado; 1 Important e 9 menores corrigidos na onda final, com teste antes da correção:

- **Important:** trocar o endereço de uma imagem no diálogo limpa `srcset`, `sizes` e `height` antigos (a `width` fica, salvo se a pessoa mexeu nela); antes o navegador seguia exibindo os candidatos do `srcset` da imagem antiga e a sessão os contava em `current` (órfãos para o `onMediaRemoved` da 05c2). Só mudar `alt`/legenda preserva `srcset`/`sizes`/`height`.
- Endereços só de espaços: `required` no endereço de imagem, vídeo e faixa; pôster só de espaços é "sem pôster", sem erro.
- `restoreFocus` na recusa só com o documento intacto (ruling 4).
- `removeImage` morto removido do _chunk_ dos menus; `RTE_FLOATING_MEDIA` exaustivo por `satisfies`.
- Ponte E2E de `media-alt`/`media-key`: `lastMediaChange`/`mediaChanges` lançam erro (sem `(mediaChange)` ligado) em vez de `null`/0.
- `toolbar.spec.ts` volta a provar que o pedido chega ao `RteDialogController.open`.
- URL somente leitura do _embed_ num `role="group"` nomeado pelo rótulo; grupo das faixas com `aria-describedby` para o lembrete da WCAG 1.2.2 enquanto não há faixa `captions`.

Aceitos sem mudança: `keepFocus` no `mousedown` das ações; esperas de 600 ms nos E2E; extração do `placement-controller.ts` (na 05d); largura não numérica como vazia (ruling T4); `rteEmbedUrl` em recusa de posição (inalcançável); `nav-media` com a CSP estrita; demais itens da lista "Accepted" da revisão.

## Pendências conhecidas

- **MP4/H.264 no app de teste:** só `e2e.webm` (VP8); no WebKit/Linux o vídeo não decodifica e o N28 prova só o DOM e as _cues_ do `.vtt` (ruling 6).
- **Marcar "decorativa" no HTML:** o HTML canônico não distingue `alt=""` decorativo de `alt` esquecido (V7); evolução do core se a 05c2 mostrar que a sessão não basta.
- **`referrerpolicy` nas imagens da vista do editor:** o esquema não tem o atributo; evolução do core.
- **Trocar o endereço de um _embed_ existente:** hoje remover e inserir (o core só atualiza a legenda).
- **Título próprio do `iframe`:** o core usa o nome do provedor.
- **`style="aspect-ratio"` do _embed_ sob CSP estrita:** o core o acrescenta e o Chromium reporta `style-src-attr` ao carregar o conteúdo (ruling 28 do ADR 0007, aceito).
- **Flakes vigiados:** N5 (arrasto da alça) no Firefox (ADR 0008); "alternar 100×" do lifecycle sob carga; travamento ocasional do Firefox no `goto` do app de teste (repetir com `--workers=1`).
- **Leitores de tela, teclado virtual e motores mais antigos** (anúncio de "Faixa n" e dos erros, `pointer-events` em `iframe`, `textTracks`): spec 08.
- **Menus de mídia em `readonly`:** evolução (herdado da 05b2b).

## Consequências

- **05c2:** os diálogos de imagem e de vídeo ganham o campo de arquivo ("endereço **ou** arquivo"); **começa separando os formulários de mídia num `@defer` próprio** (ruling 20); `onMediaRemoved` recebe o `removed` líquido da sessão em `markSaved()`; `rteImagesHaveAlt` usa a contagem de `alt: null` da sessão (V7), mas precisa de um _signal_ próprio dessa contagem: `missingAlt()` é método, não reativo, e a única escrita reativa (`mediaState`) fica atrás do portão do delta de URLs em `onTransaction` (`rte-editor.ts`, `if (!media || !delta || !emitted) return`), então trocar o `alt` de `null` para texto (sem mudar URL) não publicaria nada; a 05c2 escreve esse _signal_ quando a contagem muda, fora do portão; `registerExternal` passa pela mesma regra de URL (V4); as diretrizes P1–P16 viram decisões numeradas, com testes N33 em diante.
- **05d:** `onUiItem` de `image`/`video`/`embed` chama `openDialog(kind)`; o menu `/` oculta também os menus de vídeo e _embed_; os orçamentos de desempenho somam o N32 (a serialização do D8 é o custo por tecla com mídia, não o rastreador); `api-extractor` cobre `RteMediaChange`, `RteMediaSession`, `mediaChange`, `mediaSession`, `RteDialogKind` e `RteFloatingMenuKind` ampliados.
- **Spec 06:** nada muda no HTML; a regra de `pointer-events` é só do editor.
- **Spec 08:** leitores de tela nos diálogos com faixas, teclado virtual, motores mais antigos.
