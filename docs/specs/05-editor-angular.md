# Spec 05 — Editor Angular (`@cds/rte-angular`)

> Depende das specs 02 e 03 (concluídas). **Não** depende da spec 04: o editor não importa `@cds/rte-sanitizer` (o valor é o HTML canônico do core; quem sanitiza é o servidor e o `rte-render`). Referência: plano seções 3.2, 3.3, 3.6, 5, 6 e 8 (Fase 3).

> **Atualização (2026-10-04).** Esta spec foi escrita antes do core existir e era grande demais para um ciclo só. Foi revista contra o que o core (03a–03c, ADRs 0003–0005) e o tema (02, ADR 0002) entregam de fato e contra o Angular 22.2.1 instalado, e **dividida em ciclos** (spec → plano → implementação → verificação; quatro partes, a 05b depois repartida em duas), nesta ordem:
> - **05a** — [componente, formulários e base](05a-componente-e-formularios.md) (decisões D1–D26; escrita);
> - **05b** — barra de ferramentas, menus flutuantes, diálogos e tema por instância, por sua vez dividida (2026-10-04) em **05b1** — [barra de ferramentas, tema por instância e CSS de conteúdo](05b1-barra-de-ferramentas-e-tema.md) (decisões U1–U20; escrita) — e **05b2** — menus flutuantes e diálogos, também dividida (2026-10-04) em **05b2a** — [diálogos, link, idioma, autor da citação e tabela](05b2a-dialogos-link-e-idioma.md) (decisões G1–G21; concluída) — e **05b2b** — [menus flutuantes](05b2b-menus-flutuantes.md) (decisões M1–M21 sobre as diretrizes F1–F9; concluída);
> - **05c** — mídia, upload e rascunho, dividida (2026-10-05) em **05c1** — [diálogos de mídia, detalhes da imagem e `mediaChange`](05c1-dialogos-de-midia.md) (decisões V1–V18; concluída; falta o CI do PR; ADR 0011) — e **05c2** — upload e rascunho, por sua vez dividida (2026-10-06) em **05c2a** — [envio de arquivos, marcadores de envio e validadores de mídia](05c2a-envio-de-arquivos.md) (decisões E1–E25 sobre as diretrizes P1–P16 da 05c1; concluída, falta o CI do PR; ADR 0013) — e **05c2b** — [rascunho, salvamento e colagem externa](05c2b-rascunho-e-salvamento.md) (decisões S1–S15 sobre as diretrizes H1–H10 da 05c2a; concluída, falta o CI do PR; ADR 0014);
> - **05d** — menu `/`, busca, contadores e fechamento da API.
>
> As partes 05c2b e 05d são escritas quando chegar a vez delas, no formato da 05a, a partir do escopo da seção 5. Onde esta spec e uma parte divergem, vale a parte. O "mapa dos 134 testes do modelo" deixa de valer (o modelo foi perdido); o `size-limit` é substituído pelo orçamento por cenário do repositório (`tools/check-size.mjs`).

## 1. Objetivo

O componente `rte-editor`, nativo do **Angular 22** (Signal Forms, signals, zoneless/OnPush, `@defer`), sem Tailwind e sem design system, com toolbar configurável, i18n, acessibilidade (WCAG 2.2 AA), adaptador de upload e **desempenho medido**, montado sobre `@cds/rte-core/extensions` e os tokens de `@cds/rte-theme`.

## 2. Fora de escopo

Esquema, extensões e serialização (spec 03, consumidas como estão); sanitização (spec 04); tokens do tema (spec 02, consumidos); exibição do conteúdo publicado (spec 06); demo e servidor de exemplo (spec 07); matriz de versões, regressão visual e teclado virtual (spec 08).

## 3. Decisões já tomadas (valem para todas as partes)

**De 2026-10-02 (README das specs):** `Editor` do Tiptap **direto** com wrapper próprio, sem `ngx-tiptap`; **ícones SVG internos** (sem `lucide-angular`); **`<dialog>` e popover nativos**, sem `@angular/cdk`.

**Desta revisão (registradas na parte indicada):**

| Decisão | Parte | Motivo |
|---|---|---|
| `RteEditor` é `FormValueControl<string>` **sem** `NG_VALUE_ACCESSOR` nem diretiva CVA; Reactive/Template Forms usam o caminho nativo de controle customizado do `@angular/forms` 22.2 | 05a (D5) | No 22.2 o `NgControl` liga um `FormValueControl` sem CVA (valor, `touched`, `disabled`, `required`, `errors`); um CVA no elemento vence esse caminho e o do `FormField` e perderia `required`/`maxLength`/`readonly`/`invalid`/`touched`. Responde o antigo spike S1 |
| Valor = `getRteHtml(editor)`; documento vazio = `''`; só HTML (sem `format: 'json'`) | 05a (D6, D7) | HTML canônico igual em todo motor e no servidor; um formato só |
| Nenhum CSS injetado em tempo de execução: `injectCSS: false`, componentes sem `styles`, CSS em arquivos do pacote incluídos pelo consumidor | 05a (D16) | CSP `style-src 'self'` sem *nonce* (ADR 0004) |
| Strings em `RTE_LABELS` (`Signal<RteLabels>`), compondo `RTE_CONTENT_LABELS`/`RTE_SLASH_LABELS` do core; pacotes pt-BR/en/es em `/i18n`; texto fixo em template barrado por teste | 05a (D15, D25) | Uma fonte por string; troca de idioma em tempo de execução |
| Zoneless primeiro, zone.js suportado; mesma suíte nos dois modos | 05a (D21) | Antigo spike S4 |
| Testes de componente pelo *builder* `unit-test` do Angular (Vitest + jsdom); navegador real num app de teste Angular com *prerender*, hidratação e CSP estrita | 05a (D22) | Regra principal do repositório; lição 12 |
| Sem dependência de `@cds/rte-sanitizer` nem de `@cds/rte-render`; o tema era peer só de CSS na 05a; a 05b1 passou a importá-lo (`applyRteTheme`, `scope:angular` → `scope:theme`, U15, ADR 0008) | 05a (D24), 05b1 (U15) | Grafo do `CLAUDE.md` (`angular` de `core` e `theme`) |
| Peers Angular `>=22.2.0 <23` até a spec 08 provar o 22.0 | 05a (D24) | Testar só o que se suporta |

**Spikes da versão anterior:** S1 (CVA × `FormValueControl`) foi respondido lendo o código do `@angular/forms` 22.2.1 e vira teste da 05a (R5/R6); S4 (zoneless × zone.js) é requisito da 05a (R14); S3 (custo da ponte e do `updateOn`) é medido no N8 da 05a e decidido na 05d; S2 (Angular Aria × roving tabindex próprio; `<dialog>` nativo) foi decidido na 05b1 (U1: implementação própria atrás de diretivas internas; o `@angular/aria@22.2.1` exige `@angular/cdk` 22.2.1 exato como peer).

## 4. Consequências do core e do tema que a spec 05 cumpre

Entradas vinculantes dos ADRs 0002, 0004 e 0005 e da 03c §8, com a parte responsável:

| Consequência | Parte |
|---|---|
| `injectCSS: false`; CSS das alças (`touch-action: none`), das tarefas, `hljs-*`, `rte-placeholder`, `rte-search-match(--active)`, `rte-slash-query` | 05a |
| Não definir `clipboardParser`/`domParser` próprios (o `RteDOMParser` faz o corte de espaços, decisão 27 do ADR 0004) | 05a |
| `Tab` sai da tabela e do editor (decisão 34); nota do `Tab` do Firefox nas tarefas (decisão 33) | 05a (teclado), 05b1 (toolbar) |
| `maxLength` do schema → `charLimit` por função; `maxLength` nativo não mede a string HTML; contagem pela regra do C5 | 05a |
| `placeholder` por função e transação só de *meta* na troca de idioma | 05a |
| Guarda de `colspan`/`rowspan` > 100 nas operações de tabela; "criar linha" pela toolbar (o `Tab` não cria) | 05b1 (toolbar), 05b2b (menu flutuante de tabela) |
| Aparência dos blocos `rt-*` num CSS de conteúdo único para editor e página (spec 06, R3) | 05b1 (`@cds/rte-core/styles/content.css`) |
| `onUiItem` abre os diálogos de imagem, vídeo e embed (o *callback* do core é síncrono e engolido se lançar: o diálogo é aberto de forma assíncrona pela UI) | 05c1 (diálogos, `openDialog('image' \| 'video' \| 'embed')`), 05d (ligação) |
| Combobox no editável a partir de `getSlashMenuState`, listbox em `view.coordsAtPos(range.from)`; `bulletList`/`orderedList` não alternam | 05d |
| Barra de busca dona de `Mod-F`, `Enter`/`Shift+Enter`, `F3`, `Escape`; comandos de busca chamados em sequência (ruling 16 do ADR 0005); `aria-live` de `lastReplaced` | 05d |
| `aria-live` do limite a partir de `rejected`/`remaining`; `readingTime = Math.ceil(words / 200)` | 05d |
| Histórico: o que se digita até 500 ms (`newGroupDelay`) depois de um comando `/` ou de uma substituição entra no mesmo passo de desfazer (documentar na UI) | 05d |
| Contraste do tema respeitado em todo componente; foco com `outline` de `--rte-focus-width`; `forced-colors` e `prefers-contrast` | todas |

## 5. Partes

### 05a — Componente, formulários e base · depende de 03c, 02
Escrita: [05a-componente-e-formularios.md](05a-componente-e-formularios.md). Componente `rte-editor` sem toolbar, ponte de signals, Signal Forms, Reactive/Template Forms pelo caminho nativo (sem CVA) + `[(value)]`, valor canônico, estados do formulário, `maxLength` → limite, rótulos e `/i18n`, validadores de texto (`/validators`), `editor.css` funcional, casca de SSR, `/testing`, app de teste com CSP nos 3 motores, orçamento de tamanho e medidas de desempenho (ADR 0007).

### 05b — Barra de ferramentas, menus flutuantes, diálogos e tema · depende de 05a
Dividida em duas partes (2026-10-04), por ser grande demais para um plano só:
- **05b1** — escrita: [05b1-barra-de-ferramentas-e-tema.md](05b1-barra-de-ferramentas-e-tema.md). Toolbar com presets/grupos, foco itinerante e menus em `popover` nativo (implementação própria, sem `@angular/aria`), ícones SVG internos (Lucide, ISC, incorporados), todos os comandos sem diálogo, guarda de tabela > 100 por ensaio, "0 re-render" medido por `MutationObserver`, estados do editor na barra, tema por instância por `applyRteTheme` (grafo `angular` → `theme`), `content.css` `rt-*` no `@cds/rte-core` (compartilhado com a spec 06, cores da paleta no escuro) e a correção do `blur` (`afterRenderEffect`). ADR 0008.
- **05b2** — depende de 05b1. Dividida (2026-10-04) em duas partes, por passar de ~10 tarefas e porque o "Editar" do menu flutuante de link depende do diálogo de link:
  - **05b2a** — concluída: [05b2a-dialogos-link-e-idioma.md](05b2a-dialogos-link-e-idioma.md). Base de diálogos em `<dialog>` nativo modal dentro do host (`showModal()`, sem *focus trap* próprio, sem *light dismiss*, cancelamento seguro se o documento mudar por fora), carregada por `@defer (when …; prefetch on idle)`; formulários em Signal Forms (`@publicApi`); diálogos de link (inserir/aplicar/editar/remover, validação por `normalizeHref` com a política mesclada do editor), idioma (`rtLang`, regra do esquema), autor/cargo da citação (`updatePullquote`) e tabela nova (linhas, colunas, cabeçalhos; legenda fora, o core a descarta); itens `link`/`lang`/`quoteAuthor` e entrada `insertTableCustom`; `Mod-K`; seleção pendente visível; `openDialog()`; seção `dialogs` dos rótulos; axe e teclado nos 3 motores. ADR 0009.
  - **05b2b** — concluída: [05b2b-menus-flutuantes.md](05b2b-menus-flutuantes.md). Depende de 05b2a: menus flutuantes de texto selecionado, link (abrir/editar/remover), tabela (mesma guarda U14) e imagem (alinhamento; detalhes da imagem ficam na 05c), começando ocultos (lição 13), em `popover="manual"` dentro do host com a posição da U7 generalizada, sem roubar o foco, `Alt+F10` com prioridade para o menu visível e configuração `floatingMenus`. Diretrizes F1–F9 do Apêndice A da 05b2a, refinadas nas decisões M1–M21 (origem do diálogo no editável, `focusFloatingMenu()`, menus de vídeo/*embed* e detalhes da imagem na 05c). ADR 0010.

Escopo original da 05b, repartido acima: Toolbar `role="toolbar"` com *roving tabindex* (decidir no início: `@angular/aria` 22.2.x, estável no npm, contra implementação própria atrás de abstração interna), presets `minimal | article | full` e configuração por grupos/itens/ordem, com `features` desligando o item junto com a extensão; ícones SVG internos; menus flutuantes de texto e de imagem começando ocultos (lição 13); diálogos em `<dialog>` nativo com *focus trap* e formulários internos em Signal Forms (link com política do core, idioma, autor da citação, variante da caixa, cores da paleta, detalhes de tabela); operações de tabela com a guarda > 100; desfazer/refazer; contadores de re-render da toolbar (0 botões re-renderizados quando o estado ativo não muda); tema por instância (`[theme]`, `provideRichText({ theme })`, `data-rte-mode`) compatível com a CSP da 05a; CSS de conteúdo `rt-*` compartilhado com a spec 06; `@defer` para os diálogos; axe e teclado completo nos 3 motores.

### 05c — Mídia, upload e rascunho · depende de 05b2b
Dividida em duas partes (2026-10-05), por passar de ~20 tarefas e porque o envio por arquivo estende os diálogos de mídia e a limpeza de órfãos usa a sessão de mídia:
- **05c1** — concluída: [05c1-dialogos-de-midia.md](05c1-dialogos-de-midia.md). Diálogos de imagem, vídeo e *embed* por endereço (`RteDialogKind` + `image`/`video`/`embed`, modos inserir/editar pela seleção) no mesmo `@defer` da 05b2a; detalhes da imagem (`alt` obrigatório ou "decorativa", legenda, crédito, alinhamento, largura por `setImageSize`, WCAG 2.5.7); faixas de legenda do vídeo (WCAG 1.2.2); *embed* validado pelo comando do core; URLs de mídia pela regra do esquema do editor (sem `http:`/`data:`/`blob:`); itens `image`/`video`/`embed` da barra e dos *presets*; menus flutuantes de vídeo e *embed* e "Detalhes da imagem…"; seleção de mídia por clique (`pointer-events` só no editor editável); `mediaChange` (delta) e `mediaSession` (líquido desde a base). ADR 0011.
- **05c2** — depende de 05c1 (diretrizes P1–P16 no Apêndice A da 05c1). Dividida (2026-10-06) em duas partes, por passar do gatilho da P16 (~19 tarefas juntas):
  - **05c2a** — concluída (falta o CI do PR; ADR 0013): [05c2a-envio-de-arquivos.md](05c2a-envio-de-arquivos.md). Formulários de mídia num `@defer` próprio (ruling 20 do ADR 0011); `RteUploadAdapter` (`uploadImage`, `uploadVideo?`) por `provideRichText({ upload })`/entrada `upload`, validação de tipo (sem `svg`) e tamanho antes do envio, resposta revalidada pela regra do esquema; `httpUploadAdapter` em `@cds/rte-angular/upload` (`XMLHttpRequest`, progresso, **cancelamento real**, sem interceptors do host, lição 3); envio por diálogo ("endereço **ou** arquivo"), colar e soltar, com marcador de envio como decoração (nunca no valor), bandeja acessível com progresso e cancelar, inserção na posição mapeada por `setImage`/`setVideo` com `{ at }` do core (lição 14); `uploadError`; `uploads`/`pendingUploads`/`imagesMissingAlt`; validadores `rteUploadsFinished` e `rteImagesHaveAlt` (Signal Forms e diretivas para Reactive/Template). ADR 0013.
  - **05c2b** — depende de 05c2a (diretrizes H1–H10 no Apêndice A da 05c2a). Rascunho (`draftKey`, `DraftStorage` do core, restauração só por ação da pessoa, várias abas), `isDirty`/`markSaved()` com `onMediaRemoved`, `registerExternal` e URL colada → *embed* (ambos opt-in), aviso em `beforeunload` opt-in.

Escopo original da 05c, repartido acima: `RteUploadAdapter` (`uploadImage`, `uploadVideo?`, `registerExternal?`, `onMediaRemoved?`) e `httpUploadAdapter({ endpoint, fieldName, headers, withCredentials, mapResponse })` com progresso e **cancelamento real** (`AbortSignal`), sem depender de interceptors do host (lição 3); diálogos de imagem, vídeo (faixas de legenda) e embed (provedores do core), detalhes da imagem (`alt` obrigatório ou "decorativa", legenda, crédito, tamanho sem arrasto por `setImageSize`, WCAG 2.5.7); colar e soltar arquivos; localizar a mídia inserida pelo `src` (lição 14); `mediaChange` (URLs adicionadas/removidas na sessão) e `uploadError`; validadores `rteImagesHaveAlt` e `rteUploadsFinished`; rascunho (`draftKey`, `DraftStorage` do core, aviso em `beforeunload`), `isDirty`/`markSaved()`.

### 05d — Menu `/`, busca, contadores e fechamento · depende de 05c2b
Libera `search` e `slashCommands` (fim do D1 da 05a). Menu `/` como combobox + listbox no editável, posicionado por `coordsAtPos`, com `onUiItem` abrindo os diálogos da 05c1; barra de busca e substituição com atalhos, `aria-live` e o teto de 1000 resultados (C10); contadores (`showWordCount`/`showCharCount`, tempo de leitura) e anúncios do limite; validadores `rteSafeLinks` e `rteNoEmptyHeadings`; `updateOn`/adiamento da serialização se o N8 da 05a mostrar a necessidade; orçamentos finais de desempenho (digitação p95 em 20 mil palavras, INP, criação, vazamento) com os números da 05a; `api-extractor` em todos os entries e README completo.

## 6. Critérios de aceite da spec 05 (soma das partes)

- [ ] 05a, 05b1, 05b2a, 05b2b, 05c1, 05c2a, 05c2b e 05d concluídas, cada uma com seu ADR e seus critérios.
- [ ] Os 3 modos de uso funcionam em navegador real: `[formField]`, `formControlName`/`ngModel` e `[(value)]`.
- [ ] Todos os recursos do plano 2.1 acessíveis pela UI, sem Tailwind, com o CSS do pacote e a CSP estrita.
- [ ] Suíte verde zoneless e com zone.js; E2E verde em Chromium, Firefox e WebKit.
- [ ] Orçamentos de desempenho e de tamanho atendidos (ou ajustados com dados em ADR); axe sem violações sérias.
- [ ] Nenhuma string fixa fora de `RTE_LABELS`; pt-BR, en e es completos.
- [ ] `api-extractor` sem diferenças; `attw`/`publint` verdes.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Contratos de Signal Forms mudarem num *minor* do 22 | Só `@publicApi` estável; piso dos peers = versão testada; matriz da spec 08 |
| `@angular/aria` não cobrir toolbar/combobox como esperado | Decidido na 05b1 (U1): implementação própria atrás de diretivas internas; troca futura sem mudar a API |
| Custo de serializar por tecla em documento grande | Medido na 05a (N8), decidido na 05d |
| Parte posterior exigir mudança no contrato da 05a | Contrato do componente pensado para a UI dentro do host (D11) e rótulos extensíveis por seção; mudança vira ADR |
