# ADR 0009: Diálogos nativos sob demanda (link, idioma, autor da citação e tabela)

- Status: aceita (2026-10-05)
- Spec de origem: `docs/specs/05b2a-dialogos-link-e-idioma.md` (parte 3 de 6 da spec 05)

## Contexto

A 05b1 entregou a barra, os menus e o tema por instância, mas os itens que precisam de dados do usuário (endereço do link, código do idioma, autor da citação, tamanho da tabela) ficaram de fora. A 05b2a dá ao `rte-editor` a base de diálogos: `<dialog>` nativo modal dentro do host, carregado por `@defer` num _chunk_ separado, com formulários em Signal Forms, mais os quatro diálogos, os itens `link`/`lang`/`quoteAuthor`, a entrada `insertTableCustom`, o atalho `Mod-K`, a seleção pendente e `RteEditor.openDialog(kind)`. Tudo foi provado em jsdom (zoneless e zone.js) e nos 3 motores do Playwright, com CSP estrita, _prerender_ e hidratação. O 0008 é da barra; este é o 0009.

## Decisão

### (a) Decisões da spec (G1–G21) e diretrizes da 05b2b (F1–F9)

| #   | Decisão                                                                                                                                                                                                       | Motivo                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| G1  | A 05b2 é dividida: 05b2a (diálogos, itens, `Mod-K`, `openDialog`) e 05b2b (menus flutuantes).                                                                                                                 | O "Editar" do menu flutuante de link depende do diálogo de link; as duas metades somam bem mais que ~10 tarefas.             |
| G2  | `<dialog>` nativo com `showModal()`, último filho do host (fora de `.rte-editor__frame`), `aria-labelledby` no título, sem _focus trap_ próprio.                                                              | APG _Dialog (Modal)_; _top layer_, `inert` e `aria-modal` do navegador; descendente do host mantém D11 e herda o tema.       |
| G3  | Fecha por `Escape`, "Cancelar" ou aplicação; sem _light dismiss_ e sem `closedby`; o estado final é lido do evento `close`. Tudo que não é "Aplicar"/"Remover" é cancelamento.                                | Clique acidental fora não descarta o digitado; o Chromium não deixa impedir o segundo `Escape`; um caminho só nos 3 motores. |
| G4  | Foco inicial explícito no primeiro campo; aplicar/remover devolve o foco ao editável; cancelar devolve à origem (se conectada e focável) ou ao editável.                                                      | APG; D11 (abrir e fechar não emitem `editorBlur`/`touch`).                                                                   |
| G5  | Integridade: mudança externa do documento, `disabled`/`readonly`/`hidden`, troca de `toolbar` que remova a origem, destroy ou recriação cancelam; "Aplicar" confere o `doc`.                                  | Evita aplicar o comando em posição errada.                                                                                   |
| G6  | Um diálogo por vez (em todo o documento); abrir fecha antes os menus da barra.                                                                                                                                | Modal sobre modal confunde leitores de tela; _popover_ `auto` por baixo de modal fica inacessível.                           |
| G7  | Carga por um `@defer (when dialogRequested(); prefetch on idle)` com `@placeholder {}` vazio e `@error`; `RteDialogs` só no `imports` e dentro do bloco.                                                      | O custo dos formulários sai do _bundle_ inicial; qualquer referência por valor fora do bloco desfaz o _chunk_.               |
| G8  | Formulários em Signal Forms (só `@publicApi`); erro só depois de `touched` ou de tentativa de envio; envio inválido foca o primeiro campo inválido.                                                           | Um modelo e uma validação por diálogo; rótulos de erro pela mesma i18n.                                                      |
| G9  | Link validado por `normalizeHref(url, linkPolicy)` com a política mesclada que criou o editor; "nova aba" só com `target: 'preserve'`.                                                                        | Uma fonte da verdade para o que é link aceito.                                                                               |
| G10 | Modos do link: inserir, aplicar, editar e remover; editar só quando a seleção inteira cabe num intervalo de link.                                                                                             | Sem modo ambíguo com seleção que cobre metade de um link.                                                                    |
| G11 | Itens `link` (sempre), `lang` e `quoteAuthor` (`newsBlocks`), com `aria-haspopup="dialog"`, sem `aria-pressed`; `--active` e nome "Editar …" dentro de link/idioma.                                           | Abrem diálogo, não alternam.                                                                                                 |
| G12 | `Mod-K` por `RteUiExtension` (pacote Angular), só quando aplicável.                                                                                                                                           | O `@tiptap/extension-link` não registra o atalho; convenção de editores.                                                     |
| G13 | Seleção pendente por decoração `rte-pending-selection`, por transação só de _meta_ (fora do histórico e do valor).                                                                                            | Sem foco o navegador esconde a seleção.                                                                                      |
| G14 | Idioma: `<select>` com `RTE_DIALOG_LANGUAGES` (12) e "Outro…" validado pela regra `span[lang]` do esquema; direção "Padrão"/`ltr`/`rtl`.                                                                      | Regra única com o esquema; `ar`/`he` sugerem `rtl`.                                                                          |
| G15 | Autor da citação: Autor e Cargo opcionais (`maxLength` 200), `updatePullquote`.                                                                                                                               | O _toggle_ `pullquote` da 05b1 não muda.                                                                                     |
| G16 | `insertTableCustom` ("Inserir tabela…"): Linhas 1–100, Colunas 1–20, cabeçalhos de linha e coluna.                                                                                                            | A guarda de 100 do U14 continua valendo; limite de colunas é de UI.                                                          |
| G17 | Presets: `link` em `minimal`, `article` e `full`; `lang` e `quoteAuthor` no `full`.                                                                                                                           | Link é o item mais usado depois de negrito e itálico.                                                                        |
| G18 | API mínima: `openDialog(kind: RteDialogKind): boolean` (`link`, `lang`, `quoteAuthor`, `table`); `RTE_DIALOG_LANGUAGES`; `RteDialogKind`.                                                                     | Gatilho próprio sem barra; `false` em cada recusa.                                                                           |
| G19 | Rótulos: seção `dialogs` e chaves novas em `toolbar`; trocar o idioma com o diálogo aberto atualiza sem perder o digitado.                                                                                    | D15 da 05a.                                                                                                                  |
| G20 | CSS `.rte-dialog*` no `editor.css`, só `--rte-*`, `::backdrop` com cor literal antes do `color-mix`, largura `min(32rem, 100vw - 32px)`, alvos >= 24 px, sem animação, borda `CanvasText` em `forced-colors`. | CSP estrita e legibilidade em qualquer motor.                                                                                |
| G21 | Unitários em `test`/`test-zone` com `installDialogShim()`; navegador real no app de teste (rota `dialogs`).                                                                                                   | `showModal`, `inert`, _top layer_, `Escape` e `Tab` só existem no navegador.                                                 |

Diretrizes F1–F9 da 05b2b (Apêndice A da spec; viram decisões numeradas na 05b2b): F1 implementação própria em `popover="manual"` dentro do host, sem `@tiptap/extension-bubble-menu`; F2 regras de exibição (imagem > link > texto > tabela); F3 posição por âncora virtual com `positionMenu`; F4 aparecer nunca move o foco; F5 `Alt+F10` foca o menu flutuante, senão a barra; F6 conteúdo de cada menu e a guarda U14 da tabela; F7 `floatingMenus` na entrada e em `provideRichText`; F8 0 mutações ao digitar; F9 custo por tecla medido como no N15.

### (b) Rulings

**Pré-voo do plano**

1. **`thead`/`scope` da tabela (R11).** O core serializa cabeçalhos em `<tbody>` com `<th>` e só escreve `scope` se o atributo existir. Sem `thead`; a cadeia do diálogo grava `scope` nas células novas na mesma transação: `th` da primeira linha, `col`; `th` da primeira coluna fora da primeira linha, `row`.
2. **`maxlength` nativo.** O `[formField]` grava `maxLength`/`min`/`max`/`required` nativos; o navegador impede digitar além de 200. O erro `errorMaxLength(200)` é provado no unitário pelo modelo e no N17 por `evaluate`.
3. **`check-pack` (R1).** A regra passa a `/^fesm2022\/[^/]+\.mjs(?:\.map)?$/`, com caso novo no `check-pack.test.mjs`.
4. **Medida com o _chunk_ externo (R18).** `externalChunks: true` no `check-size.mjs` e `entry` com `*` que casa exatamente um arquivo; cenário `dialogs` mede o _chunk_.
5. **`@error` é terminal.** O Angular não refaz um `@defer`: depois da falha, `openDialog` devolve `false`, o `Mod-K` não consome a tecla e há aviso `[rte-editor]` em modo de desenvolvimento.
6. **Intervalo da abertura nos modos de edição.** O pedido guarda `req.range` (de `getMarkRange`) e os comandos aplicam `setTextSelection(req.range)`; mesmo resultado, sem depender de o cursor estar na borda.
7. **Marca de link depois de aplicar.** O `Link` do Tiptap é inclusivo; todo modo termina com `setTextSelection(fim)` + `unsetMark('link')`.
8. **Valores iniciais do idioma.** Novo: `en` e direção "Padrão"; `ar`/`he` levam a `rtl` e a sugestão é lembrada (`autoDir`); trecho com código fora da lista abre em "Outro…".
9. **Tabela.** Vazio, `errorRequired`; não inteiro ou fora do limite, `errorRange(min, max)`.
10. **Signal Forms.** Um `form()` por tipo no construtor do `RteDialogs`; cada abertura chama `reset(initial)`; erro visível = `touched() && invalid()`; `onInvalid` foca o primeiro inválido por ordem fixa.
11. **G5 e foco.** Cancelamento por `disabled`/`hidden`/destroy não move o foco; `insertTableCustom` fecha o menu com `close('trigger')`.
12. **Seleção pendente.** Fundo `var(--rte-primary-subtle)`; sem decoração para intervalo vazio, `quoteAuthor` e `table`.
13. **G6 no documento.** Recusa também com qualquer `dialog.rte-dialog[open]` no `ownerDocument`.
14. **Rótulos.** `insertTable` vira "Insert table 3 × 3" / "Inserir tabela 3 × 3" / "Insertar tabla 3 × 3"; `dialogs.remove` existe e fica para a 05c.
15. **Ícones.** `link`, `languages` e `user-pen` do Lucide 1.52.0; `third-party-embedded.json` inalterado.
16. **N20 identifica o _chunk_ pelo conteúdo** (contém `rte-dialog__form`, não contém `rte-editor__mount`, não está no HTML pré-renderizado).

**Desta execução**

17. **Execução** em `feat/spec-05b2`, no checkout principal, sem worktree. Implementadores Opus nas tarefas 2, 4–9 e Sonnet nas demais.
18. **`Ctrl+A` permite link e idioma.** `AllSelection` conta como faixa de texto em `linkTarget`/`langTarget` (selecionar tudo e trocar o idioma é uso comum).
19. **Primeira rodada da Task 2.** Autor da citação com a seleção inteira, faixa da tabela `{from, from}`, borda do link explícita (cursor na borda conta como dentro), testes de atualização, de faixa apagada e de `destroy`.
20. **Checagem do G5 no listener de `transaction` do editor** (via `zone.run`), não num `effect` sobre `version()`: o `effect` causava `NG0101` (_tick_ recursivo) no `test-zone`. Comportamento igual.
21. **Correções da revisão da Task 4 (feitas na Task 5, com teste).** `openDialog` recusa com o host `hidden`; evento `close` atrasado não cancela diálogo novo; corrida do G6 na primeira carga do _chunk_ resolvida com `WeakMap<Document, controller>`.
22. **Campo de URL com `type="text"` e `inputmode="url"`.** `type="url"` transformaria `'   '` em `''` e daria erro de obrigatório em vez de `rteLinkUrl` (R6). Custo: sem a validação nativa de URL do navegador; vale a do core.
23. **Orçamentos recalculados** pela fórmula (ver (d)); `i18n` já estourava com os rótulos da Task 1.
24. **Dica do diálogo em `forced-colors` do WebKit.** `GrayText` falhava o contraste no axe; `.rte-dialog__hint` usa `CanvasText` em `forced-colors` (com teste).
25. **`Tab` depois do último controle do diálogo vai à interface do navegador** (Chromium e WebKit; não há _focus trap_ por G2). A janela perder o foco conta como saída (regra da 05a): `editorBlur` e `touch` disparam. Aceito: o campo fica marcado como tocado ao sair pela interface do navegador.
26. **Firefox no Windows pode travar com vários _workers_** (2 a 4); 38/38 com 1 _worker_. Repetir o projeto com `--project=firefox --workers=1`.
27. **A preocupação da Task 4** (foco no `body` ao restaurar a origem, gerando `editorBlur` espúrio) não se reproduziu nos 3 motores.
28. **`b911992` isolado quebra o N2 e o N5**; corrigido em `043f1d8`. Aceito (estado intermediário do _branch_).

### (c) Mudanças na spec

- **`thead` e `scope`:** o core não produz `thead`; os cabeçalhos ficam em `<tbody>` com `th scope="col"|"row"` (ruling 1).
- **`maxlength` nativo** do `[formField]` (ruling 2).
- **Intervalo da abertura** (`req.range`) nos modos de edição e remoção da marca guardada depois de aplicar (rulings 6 e 7).
- **`Ctrl+A`** aplica link e idioma (ruling 18).
- **§7:** critérios marcados com a evidência; o do CI do PR fica aberto.
- **`docs/specs/README.md` e `05-editor-angular.md`:** 05b2a de "escrita" para "concluída; falta o CI do PR".

### (d) Números (2026-10-05)

Tamanho (`min+gzip`, Angular, Tiptap, `@cds/*`, `lowlight` e `highlight.js` externos, _chunk_ dos diálogos externo; orçamento = `ceil(medido × 1,15 / 64) × 64`):

| Cenário      | Antes (05b1) | Agora | Orçamento antes | Orçamento agora |
| ------------ | ------------ | ----- | --------------- | --------------- |
| `editor`     | 17635        | 21203 | 20032           | 24384           |
| `whole`      | 17676        | 21258 | 20032           | 24448           |
| `dialogs`    | -            | 5059  | -               | 5824            |
| `i18n`       | 1544         | 2455  | 1792            | 2880            |
| `validators` | 1156         | 1156  | 1344            | 1344 (igual)    |

O acréscimo do `editor`/`whole` (+3,6 kB gzip) vem dos itens novos, de `RteUiExtension`, do controlador e dos rótulos `dialogs` em inglês (`RTE_LABELS_EN`; pt-BR e es ficam no entry `/i18n`); os formulários ficam no _chunk_. O _chunk_ dos diálogos (`fesm2022/cds-rte-angular-rte-dialogs-<hash>.mjs`): 43066 B brutos no pacote, 29592 B minificados, 5059 B gzip na medida de tamanho (7993 B com `gzip -9` do arquivo bruto).

`editor.css`: 22644 B brutos, 5109 B gzip (05b1: 17287 / 4197).

App de teste (`angular-e2e-app:build`, informativo): _bundle_ inicial 897,10 kB brutos / 242,75 kB transferidos (05b1: 892,92 / 238,39); _chunk_ lazy `rte-dialogs` 17,52 kB / 4,50 kB transferidos, fora do inicial.

### (e) Verificação em navegador real

N16 (diálogo de link pela interface), N17 (idioma, autor da citação e tabela), N18 (foco, modal, `Escape`, `Tab`, G5), N19 (axe em claro, escuro e `forced-colors`, contraste, alvos, foco visível, tema por instância, idioma ao vivo, viewport de 320 px) e N20 (`@defer`, _chunk_ separado, _prerender_, hidratação, CSP) em `e2e/angular/editor-dialogs*.spec.ts`, nos 3 motores e nos _builds_ zoneless e zone. N1–N15 das partes anteriores continuam verdes (o N11 foi renomeado). Achado real do navegador: a dica em `GrayText` falhava o contraste no `forced-colors` do WebKit (ruling 24).

## Pendências conhecidas

- **`@error` terminal:** depois de falha de rede no _chunk_, só recarregar a página restaura os diálogos.
- **Legenda de tabela (`caption`):** depende de o core preservá-la (ruling 16 do ADR 0004); entra como campo do diálogo de tabela.
- **Rolagem do consumidor:** a lib não trava a rolagem da página por trás do modal; o README orienta `:root:has(.rte-dialog[open]) { overflow: hidden }`.
- **Leitores de tela:** anúncio do título e dos erros conferido na spec 08 (NVDA/VoiceOver).
- **Menores adiados da revisão:** ciclo de importação `state.ts` e `dialogs/target.ts` (mover `can()` para um módulo folha); `check-size` externaliza todo `./x.mjs`; o `check-pack` não exige o _chunk_ de diálogos; `max-block-size: 100vh` sem `100dvh`; `rte-dialogs.ts` com ~470 linhas e quatro formulários (dividir na 05c se crescer); texto inserido com link não herda negrito/cor; depois de `applyLang` o texto seguinte continua no idioma; classes `__select`, `__hint` e `__checkbox` fora da lista BEM pública; `sleep` fixos antes de asserções negativas em alguns E2E.

## Consequências

- **Spec 05b2b:** `openDialog('link')` a partir do menu flutuante de link (origem no item do menu); menus flutuantes ocultos com diálogo aberto (G6); `Alt+F10` com a prioridade da F5; diretrizes F1–F9.
- **Spec 05c:** novos `RteDialogKind` (imagem, vídeo, _embed_) no mesmo `RteDialogs` e no mesmo `@defer`; G5 e seleção pendente quando houver intervalo.
- **Spec 05d:** `onUiItem` chama `openDialog(kind)` (assíncrono por construção); `api-extractor` cobre `RteDialogKind`, `RTE_DIALOG_LANGUAGES` e `openDialog`.
- O orçamento do `@cds/rte-angular` agora é `editor` 24384 B, `whole` 24448 B, `dialogs` 5824 B, `i18n` 2880 B e `validators` 1344 B.
