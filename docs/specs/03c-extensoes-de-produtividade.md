# Spec 03c — Extensões de produtividade (`@cds/rte-core`)

> Parte 3 de 3 da spec 03 (ver `03-core-e-esquema.md`). Depende da 03b (concluída): fábrica `createEditorExtensions`, serializador canônico `getRteHtml`, fixture e teste de contrato. Consumida pela spec 05 (barra de busca, menu `/`, contadores, `maxLength`, placeholder, i18n e a11y da UI).
> Decisões tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro"; fatos de pacotes conferidos no código-fonte do Tiptap 3.31.4 e do `prosemirror-view` 1.42.6 instalados (2026-10-03).

## 1. Objetivo

Entregar, no entry `@cds/rte-core/extensions`, a **lógica sem UI** de quatro recursos de produtividade, ligados pela fábrica: **busca e substituição** (`rtSearch`), **comandos `/`** (`rtSlashCommand`: gatilho, consulta, filtro, itens, teclado e execução; o menu visual é da spec 05), **limite e contagem de caracteres/palavras** (`rtCharLimit`) e **placeholder** (`rtPlaceholder`). Nenhum deles muda o HTML: tudo o que mostram são decorações, que nunca chegam a `getRteHtml`.

## 2. Fora de escopo

Barra de busca, menu `/` visual (listbox, posicionamento, ícones), contadores na tela, mensagens `aria-live`, atalhos `Mod-F`/`F3`, CSS das classes `rte-*` deste documento e `RTE_LABELS` (spec 05); validadores de formulário `rteMaxChars`/`rteMaxWords` (spec 05, sobre `countCharacters` desta spec); busca em atributos (legenda, crédito, `alt`, autor), busca por expressão regular, busca sem diacríticos e itens `/` que abrem diálogo por conta própria (fora da v1; ver C9 e C15).

## 3. Decisões

Cada uma com o motivo. Divergências na execução viram o **ADR 0005** (extensões de produtividade).

| # | Decisão | Motivo |
|---|---|---|
| C1 | Tudo no entry `/extensions`, **sem dependência nova**: nada de `@tiptap/suggestion`, nem `Placeholder`/`CharacterCount` de `@tiptap/extensions`. | Licenças e peers inalterados; os oficiais não atendem C2, C4 e C13 (abaixo). |
| C2 | **Placeholder próprio** (`rtPlaceholder`): decoração de nó com `class="rte-placeholder"` e `data-placeholder`, só no **documento vazio** (texto da opção `placeholder`) e nos **títulos vazios** de `rtCallout`/`rtReadAlso` (rótulo que a serialização escreveria, B12); mais `aria-placeholder` no elemento editável quando o documento está vazio. Calculado a cada atualização da vista, sem estado incremental. | O oficial guarda o texto na decoração (troca de idioma fica velha até a próxima edição do bloco), usa classes `is-*` fora da convenção `rte-*` e não dá nome acessível; o título vazio de caixa era consequência pendente do ADR 0004 (decisão 29). |
| C3 | Placeholder visível também com o editor **somente leitura**. Texto vazio (`''`) = sem decoração nem `aria-placeholder`. | Mesmo comportamento de `input`/`textarea` nativos; o título de caixa mostra o que será publicado. |
| C4 | **Limite próprio** (`rtCharLimit`) com o limite lido **por função a cada verificação** (lição 4). | O `CharacterCount` oficial lê `options.limit` fixo, o `autoTrim` apaga o **início** do documento, o `filterTransaction` muta a transação e recusa entrada de IME (desfaz a composição). |
| C5 | **Regra de contagem única:** caracteres = `countCharacters(htmlToText(getRteHtml))` (pontos de código, sem quebras de linha, espaços colapsados como no `htmlToText`); palavras = `countWords` do mesmo texto. O editor calcula sem serializar (`getRteTextStats`), com **igualdade provada por propriedade**. | O contador do editor, o validador da spec 05 e o servidor (só tem o HTML) dão o **mesmo número**; ponto de código não varia por motor (grafema varia com a versão do ICU) e é como `varchar` conta. |
| C6 | **Semântica do limite:** só a **entrada direta** é barrada quando aumentaria a contagem acima do limite — digitação fora de composição (recusada), colagem (cortada no **maior prefixo** que cabe; nada se não couber) e soltar conteúdo **externo** (recusado). Conteúdo inicial, `setContent`, comandos (toolbar, `/`, substituição), composição IME, autocorreção e arrasto interno **nunca** são barrados nem cortados: o estado fica `overLimit`. Apagar é sempre permitido. | Igual ao `maxlength` nativo para o que o usuário digita; nunca perde conteúdo existente nem quebra IME; o formulário (spec 05) fica inválido em vez de truncar em silêncio. |
| C7 | Estatísticas **incrementais por bloco de topo** (cache em `WeakMap` por nó; o ProseMirror reaproveita os nós não alterados). | Contagem por tecla em documento de 20 mil palavras sem varrer tudo (spec 05 R4); `Intl.Segmenter` só nos blocos alterados. As linhas do `htmlToText` nunca cruzam blocos de topo, então a soma é exata. |
| C8 | Busca **literal** (sem regex), opções `caseSensitive` (padrão `false`) e `wholeWord` (padrão `false`); a dobra de caixa é por ponto de código com `toLowerCase()` **só quando o comprimento se mantém** (sem locale). | ReDoS impossível por construção; posições do documento exatas (`'İ'.toLowerCase()` muda o comprimento); igual em todos os motores. |
| C9 | A busca percorre o texto de **cada bloco de texto** (inclusive código, células, títulos de caixa, tarefas), atravessando marcas; **não** atravessa limites de bloco nem `hardBreak`. Atributos (legenda, crédito, `alt`, autor) ficam fora da v1. | Casa "**no**tícia" com marcas diferentes; substituir em atributo exige outro caminho de edição (registrado como evolução). |
| C10 | No máximo **1000 resultados** indexados e decorados (`capped: true` acima disso); `replaceAllSearchMatches` não tem teto e é **uma transação** (um passo de desfazer). | Custo de decorações limitado; substituir tudo continua completo. |
| C11 | Substituição: texto **literal**; herda as marcas do início do trecho (`tr.insertText(texto, from, to)`); CR/LF/CRLF viram espaço fora de `codeBlock` (dentro dele, `\n`); NUL vira U+FFFD; vazio apaga o trecho. Com o editor não editável, os comandos de substituição devolvem `false` (a busca continua funcionando). | Nunca gera conteúdo fora do esquema (quebra de linha crua em parágrafo); comportamento previsível. |
| C12 | O core **não registra atalhos** de busca; `nextSearchMatch`/`previousSearchMatch` são circulares, **selecionam** o resultado e rolam até ele (`scrollIntoView`) sem focar o editor. | O foco fica no campo da barra (spec 05), que é dona de `Mod-F`, `Enter`/`Shift+Enter`, `F3` e `Escape`. |
| C13 | O menu `/` **abre só quando um `/` é digitado** (transação de texto de 1 caractere, não colagem nem conteúdo programático, nem cursor movido para um `/x` existente), no **início do bloco ou depois de espaço** (inclusive U+00A0), com o pai sendo `paragraph` (em qualquer contêiner) e sem a marca `code`. Fecha quando: a consulta ganha espaço, passa de 30 caracteres, o cursor sai da faixa, a faixa é apagada, `Escape` (o mesmo `/` não reabre), item executado ou o editor deixa de ser editável. | Evita falso positivo em `e/ou`, URLs, código, títulos e tarefas; reabrir ao clicar num texto antigo seria intrusivo. |
| C14 | **Registro de itens** com recurso: item embutido some quando o recurso está desligado (ou o nó não existe, ex.: `embeds` sem provedor) e quando `editor.can()` diz que o comando não roda ali (ex.: tabela dentro de tabela). Filtro sem caixa e sem diacríticos (NFD), por **prefixo de palavra** do título, das palavras-chave ou do `id`; a ordem é a do registro. | `features` desliga o recurso também no menu (spec 05 R12); ordem estável é previsível para leitor de tela. |
| C15 | **Execução numa cadeia só:** apaga `/consulta` e roda o comando do item na mesma transação (um passo de desfazer). Itens sem comando (`image`, `video`, `embed`: precisam de diálogo) apagam `/consulta`, fecham o menu e chamam `onUiItem(id, editor)`. | Desfazer volta exatamente ao texto digitado; o core não tem UI. |
| C16 | **Teclado com o menu aberto e ao menos um item:** `ArrowDown`/`ArrowUp` (circulares), `Enter` executa o ativo, `Escape` fecha. `Tab` **não** é capturado (03b, WCAG 2.1.2). Sem itens, só `Escape` é tratado (`Enter` segue o padrão). Prioridade da extensão **acima** das de conteúdo (Tiptap `priority: 1000`). | Padrão combobox + listbox com o foco no texto (spec 05 R10); `Enter` não divide o parágrafo com o menu aberto. |
| C17 | Títulos e palavras-chave dos itens embutidos em `RTE_SLASH_LABELS` (pt-BR, en, es) **no core**; a spec 05 os compõe no `RTE_LABELS`. | O filtro depende do título traduzido (o usuário digita "/tab" ou "/tít"); uma fonte só, testável sem Angular. |
| C18 | Estado exposto por **getters puros** sobre o editor (`getSearchState`, `getSlashMenuState`, `getCharLimitState`), memoizados por `EditorState`; ids, `aria-activedescendant` e posicionamento ficam na spec 05. | Combina com a ponte de signals (spec 05 R1: `computed` lendo `editor.state`); o core não inventa ids de DOM. |
| C19 | **Nada desta spec chega ao HTML:** decorações, placeholder, `aria-placeholder` e estado de busca/menu ficam na vista; `getRteHtml` e `editor.getHTML()` não mudam com eles. | O serializador lê o documento (03b §5, item 4); vira teste explícito (7.2). |
| C20 | `features.search` e `features.slashCommands` (já em `RteFeatures`, padrão `true`) passam a registrar `rtSearch` e `rtSlashCommand`; `rtPlaceholder` e `rtCharLimit` são **sempre** registrados. | Placeholder dos títulos e contadores servem a todo editor; o esquema não muda (03a). |

## 4. API

```ts
// @cds/rte-core (entry `.`, sem Tiptap)
/** Pontos de código de `text`, sem contar `\n` e `\r` (C5). */
function countCharacters(text: string): number;

// @cds/rte-core/extensions
import type { ChainedCommands, Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

interface RteEditorOptions /* da 03b, acrescida de: */ {
  placeholder?: string | (() => string);                              // padrão '' (C2, C3)
  charLimit?: number | null | (() => number | null | undefined);     // padrão null (sem limite)
  slash?: RteSlashOptions;
}

// --- Contagem e limite ---
interface RteTextStats { characters: number; words: number }
function getRteTextStats(doc: ProseMirrorNode, options?: {
  labels?: RteContentLabelsSource;   // títulos vazios de caixa contam com o rótulo (como na serialização)
}): RteTextStats;
interface RteCharLimitState extends RteTextStats {
  limit: number | null;               // valor atual da função; inválido → null
  remaining: number | null;           // limit - characters (pode ser negativo)
  overLimit: boolean;
  rejected: number;                   // contador monotônico de entradas recusadas/cortadas (aria-live da 05)
}
function getCharLimitState(editor: Editor): RteCharLimitState;

// --- Busca e substituição ---
interface RteSearchOptions { caseSensitive?: boolean; wholeWord?: boolean }
interface RteSearchState {
  query: string; caseSensitive: boolean; wholeWord: boolean;
  matches: readonly { from: number; to: number }[];   // ordem de documento, no máximo 1000
  total: number; capped: boolean;
  activeIndex: number;                                 // -1 sem resultado
  lastReplaced: number | null;                         // nº da última substituição (null antes)
}
function getSearchState(editor: Editor): RteSearchState | null;   // null com `features.search: false`

// --- Comandos / ---
type RteSlashItemId =
  | 'paragraph' | 'heading2' | 'heading3' | 'heading4'
  | 'bulletList' | 'orderedList' | 'taskList' | 'blockquote' | 'codeBlock' | 'table' | 'horizontalRule'
  | 'callout' | 'pullquote' | 'readAlso' | 'image' | 'video' | 'embed';
interface RteSlashItem {
  readonly id: string;                                  // ^[a-z][a-zA-Z0-9-]{0,39}$, único (TypeError)
  readonly title?: string | (() => string);             // embutidos: de RTE_SLASH_LABELS
  readonly keywords?: readonly string[];
  readonly group?: string;                              // embutidos: 'text' | 'lists' | 'blocks' | 'news' | 'media'
  /** Recebe a cadeia já com `/consulta` apagada; ausente = item de UI (C15). */
  readonly command?: (chain: ChainedCommands, editor: Editor) => ChainedCommands;
}
type RteSlashLabels = Record<RteSlashItemId, { title: string; keywords: readonly string[] }>;
const RTE_SLASH_LABELS: Readonly<Record<'pt-BR' | 'en' | 'es', RteSlashLabels>>;   // padrão en
const RTE_SLASH_ITEMS: readonly RteSlashItem[];        // embutidos, congelados, na ordem do tipo acima
interface RteSlashOptions {
  items?: readonly RteSlashItem[] | ((defaults: readonly RteSlashItem[]) => readonly RteSlashItem[]);
  labels?: Partial<RteSlashLabels> | (() => Partial<RteSlashLabels>);   // lido a cada uso (lição 4)
  onUiItem?: (id: string, editor: Editor) => void;
}
interface RteSlashMenuState {
  open: boolean; query: string;
  range: { from: number; to: number } | null;           // do "/" ao cursor (posicionamento na 05)
  items: readonly { id: string; title: string; group?: string }[];
  activeIndex: number;                                   // -1 sem itens
}
function getSlashMenuState(editor: Editor): RteSlashMenuState;     // fechado com `slashCommands: false`
```

- **Comandos** (module augmentation, só com o recurso ligado): `setSearchQuery(query, options?)` (consulta acima de 1000 unidades é cortada; vazia = sem busca), `setSearchOptions(options)`, `clearSearch()`, `nextSearchMatch()`, `previousSearchMatch()`, `replaceSearchMatch(replacement)` (o ativo; depois o ativo passa ao próximo resultado), `replaceAllSearchMatches(replacement)`; `setSlashActiveIndex(index)`, `runSlashItem(index?)` (padrão: o ativo), `closeSlashMenu()`. Todos devolvem `false` sem efeito quando não se aplicam. Transações só de estado (consulta, navegação, menu) levam `addToHistory: false` e não mudam o documento.
- **Itens embutidos** (comando · recurso): `paragraph` `setParagraph` · base; `heading2–4` `setHeading({ level })` · base; `bulletList`/`orderedList` `toggle…` · base; `taskList` `toggleTaskList` · tasks; `blockquote` `setBlockquote` · base; `codeBlock` `setCodeBlock` · code; `table` `insertTable({ rows: 3, cols: 3, withHeaderRow: true })` · tables; `horizontalRule` `setHorizontalRule` · base; `callout` `setCallout('info')` · newsBlocks; `pullquote` `setPullquote({})` · newsBlocks; `readAlso` `insertReadAlso()` · newsBlocks; `image` · media, `video` · media, `embed` · embeds com provedor (sem comando: `onUiItem`). Inserção em parágrafo vazio **substitui** o parágrafo (lição 14). A opção `items` em forma de função recebe os embutidos **já filtrados** pelos recursos.
- **Fábrica:** `charLimit` estático inválido (não inteiro ou negativo) lança `RangeError`; o da função, inválido, vale como "sem limite" (nunca lança durante a entrada). `slash.items` com `id` repetido lança `TypeError`. Ordem nova da lista: … `newsBlocks`; `rtPlaceholder`, `rtCharLimit`, `rtSearch` (se `search`), `rtSlashCommand` (se `slashCommands`); `options.extensions`.
- **Classes de decoração** (CSS na 05): `rte-placeholder` (+ `rte-placeholder--doc` no documento vazio), `rte-search-match`, `rte-search-match--active`, `rte-slash-query` (faixa `/consulta`).

## 5. Requisitos

- **R1.** API da seção 4 exportada pelo `index.ts` de `/extensions`; `countCharacters` pelo `.`; sem import de `@tiptap/*` fora de `extensions/src` (lint); SSR: importar, criar `new Editor({ element: null })` com a fábrica, chamar os getters e `getRteTextStats` em Node sem DOM.
- **R2.** **Contagem (C5, C7):** para todo documento, `getRteTextStats(doc, { labels })` é igual a `{ characters: countCharacters(t), words: countWords(t) }` com `t = htmlToText(serializeRteHtml(doc, { labels }))`. Digitar num bloco recalcula só esse bloco (contador de chamadas no teste).
- **R3.** **Limite (C4, C6):** digitação que deixaria a contagem acima do limite **e** maior que a anterior é recusada (`handleTextInput`, nunca com `view.composing`); colagem é cortada no maior prefixo (por pontos de código, sem partir par substituto, estrutura fechada pelo `Fragment.cut`) que mantém a contagem ≤ limite, por busca binária sobre o resultado real (`handlePaste`, transação com `uiEvent: 'paste'`); soltar externo que ultrapasse é recusado (`handleDrop`, `moved: false`). Cada recusa ou corte incrementa `rejected` (transação só de *meta*). Nenhum outro caminho é barrado ou cortado; `overLimit` reflete o estado a cada transação; mudar o valor da função vale na verificação seguinte, sem recriar extensões.
- **R4.** **Placeholder (C2, C3):** documento vazio = um único `paragraph` sem conteúdo; decoração e `aria-placeholder` aparecem e somem na mesma atualização; troca do texto (função) ou dos rótulos aparece na próxima atualização da vista, inclusive por transação só de *meta*.
- **R5.** **Busca (C8–C12):** resultados idênticos aos de uma implementação de referência ingênua; nunca cruzam blocos nem `hardBreak`; `wholeWord` exige que os vizinhos não sejam `[\p{L}\p{M}\p{N}_]`; o índice é recalculado só nos blocos de texto alterados; o ativo inicial é o primeiro resultado em ou depois da seleção e, após edição, o primeiro em ou depois da posição mapeada do ativo anterior; substituir tudo é um passo de desfazer e a saída continua válida no esquema.
- **R6.** **Comandos `/` (C13–C17):** regras de abertura e fechamento de C13, filtro e disponibilidade de C14, execução de C15, teclado de C16; nenhum item embutido produz conteúdo fora do esquema; `features.slashCommands: false` não registra a extensão e `features.<recurso>: false` remove os itens do recurso.
- **R7.** **Sem vazamento (C19):** com busca ativa, menu aberto e placeholder visível, `getRteHtml(editor)` e `editor.getHTML()` são idênticos aos do mesmo documento sem essas extensões.
- **R8.** **Desempenho (documento de 20 mil palavras):** busca ativa e limite ligado não varrem o documento inteiro por tecla (R2, R5, testes de contagem de chamadas); o tempo de `dispatch` de uma tecla com tudo ligado é **medido e registrado** no ADR 0005 (Chromium, informativo; o orçamento é da spec 05 R4).
- **R9.** **Orçamento de tamanho:** cenários `extensions` e `whole` remedidos; orçamento = medido + cerca de 16% (regra do ADR 0003) se passar do atual; números no ADR 0005.
- **R10.** Rótulos `RTE_SLASH_LABELS` completos nos 3 idiomas (teste de completude) e congelados.

## 6. Testes

### 6.1 Unitários (Vitest, `// @vitest-environment jsdom`, em `extensions/src/*.spec.ts`)
- `text-stats.spec.ts`: fixture `all-features` e casos de borda (vazio, só espaços, `hardBreak`, emoji fora do BMP, ZWJ conta por ponto de código, título vazio de caixa com rótulo pt-BR); cache: editar 1 bloco de 500 recalcula 1.
- `char-limit.spec.ts`: digitação no limite recusada e `rejected` incrementado; digitação com o documento já acima recusada; apagar e trocar seleção por texto menor permitidos; colagem cortada (texto, HTML com marcas, lista) e colagem sem espaço recusada; `setContent` acima do limite preservado com `overLimit`; comando acima do limite aceito; limite por função alterado sem recriar; `view.composing` simulado não recusa; valores inválidos.
- `placeholder.spec.ts`: decoração e `aria-placeholder` só no documento vazio; título vazio de caixa e de "Leia também" com o rótulo atual; troca de idioma por função; somente leitura continua mostrando.
- `search.spec.ts`: marcas no meio da palavra, blocos e `hardBreak` não atravessados, código, células, `caseSensitive`, `wholeWord` com acentos (`ação`), `İ`/`ß`, teto de 1000, navegação circular e seleção, ativo mapeado após edição, substituir um/todos (marcas herdadas, quebra de linha → espaço, `\n` em código, vazio apaga), um `undo` desfaz tudo, editor não editável, contador de reindexação por bloco.
- `slash.spec.ts`: abre só com `/` digitado (`handleTextInput` e transação de texto), não com colagem, `setContent` ou cursor movido; não abre depois de letra, em `codeBlock`, `heading`, tarefa, títulos e com marca `code`; fecha por espaço, 31 caracteres, cursor fora, `Escape` (sem reabrir); filtro sem caixa/diacríticos por prefixo de palavra, título traduzido (pt-BR "tab" → Tabela), `id` em inglês; recursos desligados e `editor.can()`; teclado (`ArrowUp/Down` circulares, `Enter`, `Escape`, `Tab` ignorado, `Enter` sem itens divide o parágrafo); execução em um passo de desfazer; `onUiItem`; itens do consumidor e `id` repetido.
- Fábrica e índice: ordem nova da lista, `features.search`/`slashCommands: false`, `charLimit` estático inválido lança; exports públicos.
- SSR (`ssr.spec.ts`, `node`): R1.

### 6.2 Propriedade (fast-check) e contrato
- **Contagem:** documentos JSON gerados (mesmos geradores de `properties.spec.ts`) → R2.
- **Busca:** documento e consulta arbitrários (inclusive vazia, maiúsculas, símbolos, `İ`) → resultados iguais à referência; `replaceAll(r)` com `r` sem a consulta deixa 0 resultados; `undo` devolve o documento original; saída com `validateHtml(…, 'canonical')` vazio.
- **Comandos `/`:** para cada item embutido com comando × posições de cursor geradas em documentos gerados: o resultado passa em `doc.check()` e `validateHtml(getRteHtml, schema, { mode: 'canonical' })` devolve `[]`.
- **Contrato (`contract.spec.ts`):** R7 — fixture `all-features` com busca por "a" ativa: `getRteHtml` igual ao arquivo; menu `/` aberto (documento com o `/` digitado) e editor vazio com placeholder: `getRteHtml` e `editor.getHTML()` iguais aos de um editor sem `rtSearch`/`rtSlashCommand`/`rtPlaceholder` com o mesmo documento, sem `rte-`, `data-placeholder` nem `aria-placeholder`.

### 6.3 Navegador real (Playwright, Chromium, Firefox e WebKit)
O harness `e2e/core/helpers/editor-bundle.ts` passa a expor `getSearchState`, `getSlashMenuState`, `getCharLimitState`, `getRteTextStats` e `htmlToText`; a página de teste ganha CSS mínimo para `rte-placeholder` (`::before { content: attr(data-placeholder) }`), `rte-search-match` e `rte-slash-query`. Em `e2e/core/`:
- **E8 placeholder** (`editor-placeholder.spec.ts`): editor vazio mostra o texto (conteúdo do `::before` computado) e `aria-placeholder`; digitar remove, apagar tudo (`Mod+A`, `Backspace`) devolve; título vazio de caixa mostra o rótulo; `getRteHtml` sem vazamento.
- **E9 limite** (`editor-char-limit.spec.ts`): com o teclado real, digitar além do limite não muda o texto e incrementa `rejected`; `Backspace` funciona; colagem por `view.pasteHTML` é cortada; `setContent` acima do limite fica com `overLimit`; **IME no Chromium** (CDP `Input.imeSetComposition`/`insertText`) não é recusado nem quebra a composição (nos outros motores, pulado com motivo registrado).
- **E10 busca** (`editor-search.spec.ts`): decorações visíveis nos resultados, ativo distinto; `next` seleciona e rola um resultado fora da tela até ele; substituir tudo num documento com marcas e um `Mod+Z` restaura; documento de 20 mil palavras: tempo de `dispatch` por tecla com busca ativa e limite ligados é registrado (R8).
- **E11 comandos `/`** (`editor-slash.spec.ts`): digitar `/` no início e depois de espaço abre, depois de letra não; `/tab` filtra; `ArrowDown`/`Enter` com o teclado real insere a tabela válida e um `Mod+Z` volta a `/tab`; `Escape` fecha e continuar digitando não reabre; `Enter` não divide o parágrafo com o menu aberto; em bloco de código não abre.
- **E1 (contrato)** ganha o caso de R7.

## 7. Critérios de aceite

- [ ] `npx nx run-many -t lint,typecheck,build,test,verify-package` verde; `npm run check:rules`, `check:licenses` (sem dependência nova), `notices` sem drift e `test:tools` verdes.
- [ ] Unitários 6.1 e propriedades 6.2 verdes, inclusive a igualdade de contagem com `htmlToText` (R2) e o contrato sem vazamento (R7).
- [ ] E8–E11 e o caso novo do E1 verdes em Chromium, Firefox e WebKit (`npx playwright test -c e2e`) e no CI.
- [ ] Testes de contagem de chamadas provam o recálculo só dos blocos alterados (busca e estatísticas); tempo por tecla em 20 mil palavras registrado no ADR 0005.
- [ ] Orçamentos `extensions` e `whole` verdes no `npm run check:size`, com os números no ADR 0005.
- [ ] ADR 0005 registra C1–C20 e os desvios; README do core documenta busca, comandos `/`, limite (C6, com o exemplo de IME), contagem (C5) e placeholder; `docs/specs/README.md` marca a 03c como concluída.

## 8. Consequências para a spec 05

- `charCount`/`wordCount` = `getCharLimitState(editor)`; `readingTime` = `Math.ceil(words / 200)` (mesma regra de `readingTime`); `rteMaxChars`/`rteMaxWords` medem `countCharacters`/`countWords` de `htmlToText(value)` (C5). O `maxLength` do schema vira `charLimit` por função; o `maxLength` nativo do Signal Forms **não** deve medir a string HTML.
- `placeholder` por função lendo o signal; na troca de idioma, despachar uma transação só de *meta* para atualizar placeholder e rótulos (R4).
- Combobox no elemento editável (`aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`) a partir de `getSlashMenuState`; listbox posicionada por `view.coordsAtPos(range.from)`; `onUiItem` abre os diálogos de imagem, vídeo e embed.
- Barra de busca dona de `Mod-F`, `Enter`/`Shift+Enter`, `F3`, `Escape` e do `aria-live` ("3 de 12", "1000+", "N substituições" via `lastReplaced`); `aria-live` do limite a partir de `rejected`/`remaining`.
- CSS de `rte-placeholder`, `rte-search-match(--active)` e `rte-slash-query`, respeitando contraste do tema (spec 02).

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Entrada por caminhos que não passam por `handleTextInput` (autocorreção, ditado, mudanças de DOM complexas) ultrapassar o limite | Aceito por C6: fica `overLimit` e o formulário invalida; nada é perdido |
| Igualdade de contagem com `htmlToText` quebrar quando o serializador ou o `htmlToText` mudarem | Propriedade R2 no CI; os dois mudam juntos |
| `Intl.Segmenter` diferente entre servidor e navegador em CJK | Regra herdada da 03a; caracteres (o limite) não dependem dele |
| Usuário esperar busca em legendas e sem acentos | Fora da v1, documentado no README; registrado como evolução no ADR 0005 |
| Prioridade do teclado do menu `/` conflitar com extensões do consumidor | `priority: 1000` documentada; teste com `Enter`/`Arrow*` e listas/tabelas |
| IME só testável de verdade no Chromium | Regra simples (nunca recusar durante `view.composing`) coberta por unitário; E9 no Chromium; spec 08 valida teclado virtual |
| Paste cortado no meio de estrutura complexa (tabela) | Corte pelo `Fragment.cut` fecha a estrutura; `doc.check()` e `validateHtml` nos testes |
