# Core 03c — Extensões de produtividade (busca, comandos `/`, limite e placeholder): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no entry `@cds/rte-core/extensions` a lógica sem UI de `rtPlaceholder`, `rtCharLimit` (com `getRteTextStats`), `rtSearch` e `rtSlashCommand`, mais `countCharacters` no entry `.`, sem mudar um byte do HTML.

**Architecture:** Cada recurso é uma `Extension` do Tiptap com um `Plugin` próprio (estado, `decorations`, `handleTextInput`/`handlePaste`/`handleDrop`) criada por `createXxxExtension(ctx, …)` e ligada pela fábrica depois de `newsBlocks`, na ordem da spec §4. Contagem e busca são incrementais por nó (cache `WeakMap` por bloco de topo / bloco de texto); o estado público sai por getters puros memoizados por `EditorState`. A contagem do editor percorre a árvore do ProseMirror com as mesmas regras de linha do `htmlToText` (módulo compartilhado `src/text-lines.ts`) e é provada igual a `htmlToText(serializeRteHtml)` por propriedade.

**Tech Stack:** TypeScript 6, Tiptap 3.31.4 (`@tiptap/core`, `@tiptap/pm/{state,view,model,transform,history}`), prosemirror-view 1.42.6, Vitest 4 (`node` por padrão, `jsdom` por arquivo), fast-check 4.10, Playwright (3 motores), esbuild (orçamento de tamanho).

**Spec:** `docs/specs/03c-extensoes-de-produtividade.md` (vinculante; ler inteira antes de qualquer tarefa — §3 tem C1–C20 e §4 a API exata). Contexto: `docs/decisions/0004-extensoes-de-conteudo.md` (decisão 29: placeholder do título de caixa).

## Global Constraints

- Sem dependência nova (C1): nada de `@tiptap/suggestion`, nem `Placeholder`/`CharacterCount` de `@tiptap/extensions`; `npm run check:licenses` e `npm run notices` sem diff.
- Imports de `@tiptap/*` só em `packages/core/extensions/src` (lint existente); `countCharacters` e `src/text-lines.ts` sem Tiptap; nenhum `window`/`document`/`navigator` no topo de módulo; nenhum `innerHTML`.
- Nada desta spec chega ao HTML (C19): `fixtures/content/all-features.html` e `.json` não mudam; `getRteHtml` e `editor.getHTML()` iguais com ou sem as 4 extensões.
- Classes e atributos exatos: `rte-placeholder`, `rte-placeholder--doc`, `rte-search-match`, `rte-search-match--active`, `rte-slash-query`; `data-placeholder`; `aria-placeholder` no elemento editável.
- Números exatos: teto de **1000** resultados indexados/decorados; consulta de busca cortada em **1000** unidades (sem partir par substituto, `truncateText` de `limits.ts`); consulta `/` fecha acima de **30** caracteres (pontos de código); `id` de item `^[a-z][a-zA-Z0-9-]{0,39}$`; tabela do `/` = `{ rows: 3, cols: 3, withHeaderRow: true }`; `priority: 1000` em `rtSlashCommand` e `rtCharLimit`.
- Transações só de estado (consulta, navegação, menu, `rejected`) levam `setMeta('addToHistory', false)` e não mudam o documento. Transações que mudam o documento por comando do core (substituir, executar item `/`) chamam `closeHistory(tr)` de `@tiptap/pm/history` (um passo de desfazer, sem fundir com a digitação anterior).
- Lição 4: `placeholder`, `charLimit`, `slash.labels` e `labels` em forma de função são lidos **a cada uso**; nunca guardados na criação. Funções do consumidor que lançam ou devolvem tipo errado valem como ausentes (`''`, sem limite, rótulo `en`) — nunca lançam durante a entrada.
- Buscas por chave vinda de entrada (rótulos por `id`) só com `Object.hasOwn`/`Map` (ADR 0003, decisão 16).
- Getters (`getSearchState`, `getSlashMenuState`, `getCharLimitState`) devolvem objetos congelados, o mesmo objeto para o mesmo `EditorState` (memo `WeakMap<EditorState, …>`).
- Código e nomes públicos em inglês; comentários, mensagens de erro e documentação em pt-BR.
- Testes que montam editor começam com `// @vitest-environment jsdom`. Rodar de `packages/core`: `npx vitest run <arquivo>`; pacote: `NX_DAEMON=false npx nx test core --skip-nx-cache`. Propriedades leem `FC_SEED`/`FC_RUNS` como `properties.spec.ts`.
- Windows: `export NX_DAEMON=false`; `npx prettier --check --end-of-line auto <arquivos>` antes de cada commit; Playwright sempre com `--workers=4`.
- Antes de cada commit: `npx nx run-many -t lint,typecheck,test -p core` verde.
- Commits em pt-BR (`feat(core): …`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch: `feat/spec-03c`.

## Review Focus

1. **Tecla recusada no caminho de mutação do DOM** (Chromium/Firefox/WebKit digitam por `readDOMChange`, não por `keypress`): o caractere já está no DOM quando `handleTextInput` devolve `true`; se o nó não for redesenhado, a tela mostra um texto que o documento não tem — E9 confere o `textContent` do parágrafo, não só `getRteHtml` (Tarefa 10).
2. **Colagem cujo corte não é monotônico** (espaços que colapsam, NBSP nas pontas, emoji fora do BMP, documento já acima do limite): a busca binária pode parar num prefixo que ainda passa do limite ou partir um par — propriedade "depois de qualquer colagem, contagem ≤ max(limite, anterior) e `doc.check()` passa" (Tarefa 3).
3. **Consulta/substituição com metacaracteres** (`.*`, `(`, `\`, `$&`, `$1`): uma implementação com `RegExp` ou `String.replace` interpreta o texto — testes de consulta `.*` literal e substituição `$&$1` literal (Tarefas 4 e 5).
4. **Faixa `/` obsoleta depois de mudança programática** (`setContent`, colaboração, `undo`) com o menu aberto: executar o item apagaria texto errado — teste "`setContent` com o menu aberto fecha e `runSlashItem` devolve `false`" (Tarefa 7).
5. **Agrupamento do histórico com a digitação** (`newGroupDelay` de 500 ms): substituir tudo ou executar um item logo depois de digitar funde o passo com as teclas e um `undo` apaga a digitação — testes "digitar e substituir/executar em seguida; um `undo` só desfaz a operação" (Tarefas 5 e 8).

## Pré-voo: conflitos entre a spec e o código (decididos pela spec)

1. `factory.spec.ts` tem o teste "search e slashCommands são aceitos e ignorados", contrário a C20; cada tarefa que registra uma extensão acrescenta o nome a `BASE_NAMES` (o `OFF` do teste não desliga `search`/`slashCommands`, que têm padrão `true`) e a Tarefa 9 troca o teste por "`search: false`/`slashCommands: false` não registram".
2. A §6.2 pede "os mesmos geradores de `properties.spec.ts`", que são privados do arquivo: a Tarefa 1 os move sem mudança para `extensions/src/testing/doc-arbitraries.ts`.
3. C5 exige "calcular sem serializar" **e** igualdade exata com `htmlToText(serializeRteHtml)`: o percurso usa a árvore do ProseMirror; blocos de texto são genéricos; os demais nós usam a especificação de saída `node.type.spec.toDOM(node)` (array, sem string HTML nem `htmlparser2`), para que legenda, crédito, autor e cargo contem como na saída. O conjunto de tags de bloco e o colapso de espaços saem de `html-to-text.ts` para `src/text-lines.ts`, usado pelos dois lados.
4. C13 "transação de texto de 1 caractere, não … conteúdo programático": abrir exige as duas coisas — `handleTextInput` registrou `'/'` **e** a transação seguinte é exatamente esse `ReplaceStep`. `tr.insertText('/')` despachado direto e `insertContent('/')` não abrem.
5. C14 dá "tabela dentro de tabela" como exemplo de `editor.can()` falso, mas no Tiptap 3.31.4 `insertTable` sempre devolve `true` e a célula é `block+`: o comando do item `table` é `chain.command(notInsideTable).insertTable(…)`, o que torna o `can()` falso dentro de célula. O `insertTable` global não muda.
6. A propriedade da §6.2 "`replaceAll(r)` com `r` sem a consulta deixa 0 resultados" é falsa em geral (consulta `ab`, documento `abb`, `r = 'a'` → `ab`): a propriedade usa `r` sem nenhum ponto de código da consulta dobrada e `wholeWord: false`.
7. O critério "`npm run check:size`" roda só `theme:size`: os orçamentos do core são conferidos por `npx nx run core:size` (o CI roda `nx affected -t size`); o script não muda; registrado no ADR 0005.
8. Colagem cortada: o incremento de `rejected` vai como *meta* na própria transação da colagem (um passo de desfazer); recusas (digitação, colagem sem espaço, soltar) são transações só de *meta*.
9. Título de caixa só com `hardBreak`: a serialização troca o conteúdo pelo rótulo (o `textContent` do `p` é vazio), então contagem e placeholder o tratam como vazio.
10. `/` depois de `hardBreak` não abre (C13 literal: início do bloco ou depois de espaço/U+00A0).
11. Exports públicos só na Tarefa 9 (o `index.spec.ts` confere a lista exata); as tarefas 1–8 testam pelos módulos.

---

### Task 1: `countCharacters`, regras de linha compartilhadas e `getRteTextStats` (C5, C7, R2)

**Files:**
- Create: `packages/core/src/text-lines.ts`, `packages/core/extensions/src/text-stats.ts`, `packages/core/extensions/src/titles.ts`, `packages/core/extensions/src/testing/doc-arbitraries.ts`
- Modify: `packages/core/src/text.ts`, `packages/core/src/index.ts`, `packages/core/src/index.spec.ts` (`MAIN` + `countCharacters`), `packages/core/html/src/html-to-text.ts` (importa de `text-lines.ts`, comportamento igual), `packages/core/extensions/src/properties.spec.ts` (importa os geradores)
- Test: `packages/core/src/text.spec.ts`, `packages/core/extensions/src/text-stats.spec.ts` (`jsdom`)

**Interfaces:**
- Produces (`src/text.ts`, exportado no `.`): `countCharacters(text: string): number` — pontos de código (`for…of`), sem `\n` nem `\r`; substituto solto conta 1.
- Produces (`src/text-lines.ts`, interno): `TEXT_BLOCK_TAGS: ReadonlySet<string>` (o `BLOCKS` atual, literal) e `collapseTextLine(line: string): string` (`line.replace(/\s+/g, ' ').trim()`).
- Produces (`titles.ts`): `emptyTitleLabel(node: ProseMirrorNode, parent: ProseMirrorNode | null, labels: RteContentLabels): string | null` — para `rtCalloutTitle` sem nenhum nó de texto: `labels.calloutTitles[v]` com `v` = `parent.attrs.variant` se for uma das 4 variantes, senão `'info'`; para `rtReadAlsoTitle` sem texto: `labels.readAlsoTitle`; senão `null`.
- Produces (`text-stats.ts`): `interface RteTextStats { characters: number; words: number }`; `getRteTextStats(doc: ProseMirrorNode, options?: { labels?: RteContentLabelsSource }): RteTextStats`; interno `textStatsProbe: { blocks: number }` (incrementado a cada bloco de topo calculado, isto é, falta no cache).
- Produces (`testing/doc-arbitraries.ts`): `docArb`, `VALID`, `HOSTILE`, `validDoc`, `hostileDoc`, `text`, `binary` movidos de `properties.spec.ts` sem mudança.

- [ ] **Step 1: Testes que falham** (`text.spec.ts`): `countCharacters('')` 0; `'a\nb\r\nc'` 3; `'😀'` 1; `'👨‍👩‍👧'` 5; `'é'` 2; `'\ud800'` 1; `' a '` 3.
- [ ] **Step 2: Testes que falham** (`text-stats.spec.ts`), com `ref(doc, labels?)` = `{ characters: countCharacters(t), words: countWords(t) }`, `t = htmlToText(serializeRteHtml(doc, { labels }))`, documentos de `createTestEditor(…, html).state.doc`:
  - fixture `all-features` (com `codeLanguages: RTE_CODE_LANGUAGES`): `getRteTextStats(doc)` = `ref(doc)`; idem com `labels: RTE_CONTENT_LABELS['pt-BR']`.
  - vazio → `{ characters: 0, words: 0 }`; `<p>   </p>` com NBSP → 0; `<p>a<br>b</p>` → `{ 2, 2 }`; `<p>😀 a</p>` → 3 caracteres; `<p>👨‍👩‍👧</p>` → 5; `<p>no<strong>tícia</strong></p>` → `{ 7, 1 }`; `<pre><code>a\n\tb</code></pre>` → 3; imagem com `caption: 'Legenda'`, `credit: 'Foto: Ana'` → 17.
  - `<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title"></p><p>x</p></aside>`: com `es` → 9, com `pt-BR` → 8; título só com `<br>` → igual ao vazio; todos iguais a `ref`.
  - cache: 500 parágrafos `palavra N`; chamar uma vez; `textStatsProbe.blocks = 0`; documento depois de `tr.insertText('x', <posição dentro do 250º>)` → probe 1; o mesmo documento de novo → 0; outros `labels` sem títulos no documento → 0.
  - propriedade (R2): `fc.oneof(validDoc, hostileDoc, whitespaceDoc)` × `labels ∈ { undefined, pt-BR, es, { readAlsoTitle: '  ' } }` → `getRteTextStats` = `ref`; `whitespaceDoc` = parágrafos com texto de `fc.string({ unit: fc.constantFrom(' ', '\t', '\r', '\n', NBSP, ' ', '　', '\0', 'a', 'é', '😀'), minLength: 1 })`; 300 execuções.
- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/text.spec.ts extensions/src/text-stats.spec.ts` → FAIL.
- [ ] **Step 4: Implementar.** Mover `BLOCKS` e o colapso para `text-lines.ts` (os testes de `html-to-text.spec.ts` continuam verdes). Mover os geradores. `getRteTextStats`: resolve `labels` uma vez (`resolveContentLabels`); para cada filho de `doc`, cache `WeakMap<ProseMirrorNode, { labelsKey: string | null; stats: RteTextStats }>` (`labelsKey` só quando o bloco usou `emptyTitleLabel`; chave = `JSON.stringify([calloutTitles, readAlsoTitle])`); falta no cache calcula as linhas do bloco e soma `countCharacters` das linhas e `countWords(linhas.join('\n'))`. Percurso de um bloco:

```text
walk(node, parent):
  text            → line += node.text
  hardBreak       → flush
  textblock       → flush; label = emptyTitleLabel(node, parent, labels)
                    label !== null ? line += label : walk(filhos); flush
  outro inline    → ignora
  outro nó        → spec = node.type.spec.toDOM?.(node) (dentro de withRenderDocument(createStringDocument()))
                    array → walkSpec(spec): tag ∈ TEXT_BLOCK_TAGS faz flush ao abrir e fechar;
                            string → line += s; 0 → walk(cada filho, node); array → recursivo
                    outro (DOM/{dom}) → flush; walk(filhos); flush
flush: t = collapseTextLine(line); se t, lines.push(t); line = ''
```
  Divergência com `ref` se corrige no percurso, nunca no `htmlToText` (C5 define a regra pelo HTML).
- [ ] **Step 5: Rodar e ver passar** → PASS; `npx vitest run extensions/src/properties.spec.ts html/src` verde.
- [ ] **Step 6: Commit** — `feat(core): countCharacters e getRteTextStats incremental igual ao htmlToText`.

### Task 2: Placeholder (`rtPlaceholder`, C2, C3, R4)

**Files:**
- Create: `packages/core/extensions/src/placeholder.ts`
- Modify: `extensions/src/types.ts` (`placeholder?: string | (() => string)` em `RteEditorOptions`), `extensions/src/factory.ts`, `extensions/src/factory.spec.ts` (`BASE_NAMES` + `'rtPlaceholder'`)
- Test: `extensions/src/placeholder.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `emptyTitleLabel` (Tarefa 1), `ctx.labels()`.
- Produces: `createPlaceholderExtension(ctx: RteExtensionContext, source: RteEditorOptions['placeholder']): AnyExtension` (nome `rtPlaceholder`); `resolvePlaceholder(source): string` (função que lança ou não devolve string → `''`); `isEmptyDoc(doc): boolean` (um único `paragraph` com `content.size === 0`). Plugin só com `props.decorations(state)` e `props.attributes(state)` — sem estado; posições dos títulos vazios memoizadas por `doc` (`WeakMap`), rótulos lidos a cada atualização.

- [ ] **Step 1: Testes que falham:**
  - `createTestEditor({ placeholder: 'Escreva aqui' })`: `p.rte-placeholder.rte-placeholder--doc` com `data-placeholder="Escreva aqui"`; `view.dom.getAttribute('aria-placeholder') === 'Escreva aqui'`. Depois de `insertContent('a')`: sem `.rte-placeholder` e sem `aria-placeholder`; `clearContent()` devolve os dois.
  - sem decoração: `<p></p><p></p>`, `<h2></h2>`, `<p><br></p>`, `placeholder: ''` e sem opção.
  - função: `let t = 'A'`; `placeholder: () => t` → `A`; `t = 'B'` + `view.dispatch(state.tr.setMeta('x', 1))` → `data-placeholder` e `aria-placeholder` `B`; função que lança → sem decoração e sem erro.
  - títulos: callout `warning` com título vazio e `labels: () => cur` (`cur` = pt-BR) → `p.rt-callout__title.rte-placeholder` (sem `--doc`) com `Atenção`; `cur` = `es` + transação só de *meta* → `Atención`; "Leia também" vazio sem `labels` → `Read also`; título com texto → sem decoração.
  - `editor.setEditable(false)` → decoração e `aria-placeholder` continuam.
  - `getRteHtml(editor)` e `editor.getHTML()` sem `rte-placeholder`, `data-placeholder` nem `aria-placeholder`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** (`Decoration.node(pos, pos + node.nodeSize, { class, 'data-placeholder': texto })`; documento vazio com texto `''` → nada; título com rótulo `''` → nada); fábrica: `createPlaceholderExtension(ctx, options.placeholder)` logo depois de `newsBlocks`.
- [ ] **Step 4: Rodar e ver passar** → PASS (inclusive `factory.spec.ts`).
- [ ] **Step 5: Commit** — `feat(core): placeholder do documento vazio e dos títulos de caixa como decoração`.

### Task 3: Limite de caracteres (`rtCharLimit`, C4, C6, R3)

**Files:**
- Create: `packages/core/extensions/src/char-limit.ts`, `packages/core/extensions/src/testing/type-text.ts`
- Modify: `extensions/src/types.ts` (`charLimit?: number | null | (() => number | null | undefined)`), `extensions/src/factory.ts`, `extensions/src/factory.spec.ts` (`BASE_NAMES` + `'rtCharLimit'`; erros)
- Test: `extensions/src/char-limit.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `getRteTextStats`, `editor.storage.rtContent.labels`.
- Produces: `interface RteCharLimitState extends RteTextStats { limit: number | null; remaining: number | null; overLimit: boolean; rejected: number }`; `getCharLimitState(editor: Editor): RteCharLimitState` (lê `editor.storage.rtCharLimit`; ausente → `TypeError` como `getRteHtml`; memo por `EditorState` revalidado quando o `limit` atual difere do memorizado); `createCharLimitExtension(ctx, source: RteEditorOptions['charLimit']): AnyExtension` (nome `rtCharLimit`, `priority: 1000`, storage `RteCharLimitStorage { limit(): number | null }` com *module augmentation*); `assertCharLimit(value: unknown): void` (estático: `null`/`undefined`/função passam; senão exige `Number.isInteger(v) && v >= 0`, senão `RangeError` pt-BR); `resolveCharLimit(source): number | null` (função que lança ou valor inválido → `null`); `charLimitKey: PluginKey<{ rejected: number }>`; `sliceCodePoints(slice: Slice): number`; `cutSlice(slice: Slice, codePoints: number): Slice` (`content.cut(0, posição depois de n pontos de código)`, `openStart` original, `openEnd` de `Slice.maxOpen(content).openEnd`).
- Produces (`testing/type-text.ts`): `typeText(editor: Editor, text: string): void` — para cada ponto de código, como o `prosemirror-view`: `deflt = () => view.state.tr.insertText(ch, from, to)`; se nenhum `handleTextInput` tratar, `view.dispatch(deflt())`.

- [ ] **Step 1: Testes que falham** (`chars` = `getCharLimitState(editor)`):
  - `charLimit: 5`, `<p>abcd</p>`, cursor no fim, `typeText('ef')` → texto `abcde`, `{ characters: 5, limit: 5, remaining: 0, overLimit: false, rejected: 1 }`; espaço no fim de `abcde` é aceito (o colapso o ignora) e `f` depois é recusado.
  - `setContent('<p>abcdefg</p>')` com limite 5 → preservado, `overLimit: true`, `remaining: -2`, `rejected` igual; `typeText('x')` recusado; `pressKey(editor, 'Backspace')` apaga; selecionar `ab` de `abcdefg` e digitar `z` → aceito (7 → 6).
  - colagem (limite 10, `<p>abc</p>`): `view.pasteText('defghijklmnop')` → `abcdefghij`, `rejected` +1, a transação tem `uiEvent: 'paste'`, um `undo` volta a `abc`; `pasteHTML('<p><strong>defgh</strong>ijklm</p>')` → `abc` + `<strong>defgh</strong>` + `ij`; lista `<ul><li><p>1234</p></li><li><p>5678</p></li></ul>` num documento vazio com limite 6 → `<ul><li><p>1234</p></li><li><p>56</p></li></ul>`, `doc.check()` passa e `validateHtml` canônico `[]`; limite 4, `ab` + `pasteText('😀😀😀😀😀')` → `ab😀😀`; `abc` com limite 3 + `pasteText('d')` → igual, `rejected` +1; colagem abaixo do limite não muda `rejected`.
  - soltar: `vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: <fim>, inside: -1 })`; `view.someProp('handleDrop', (f) => f(view, new Event('drop') as DragEvent, sliceGrande, false))` → `true`, documento igual, `rejected` +1; com `moved: true` → não tratado.
  - IME: `(view as unknown as { input: { composing: boolean } }).input.composing = true` + `typeText('x')` no limite → aceito, `overLimit: true`, `rejected` igual.
  - comando: `insertContent('xyz')` acima do limite → aceito, `overLimit: true`.
  - função: `let l: number | null = 5; charLimit: () => l` → `l = 10` permite digitar sem recriar; `-1`, `1.5`, `NaN`, `'5'`, `undefined` e função que lança → `limit: null`, digitação livre.
  - fábrica: `charLimit` `-1`, `1.5`, `Infinity`, `NaN`, `'5' as never` → `RangeError`; `0` e `null` aceitos.
  - getter: mesmo estado → mesmo objeto (`toBe`), congelado.
  - ordem: em `editor.state.plugins`, o plugin de `charLimitKey` vem antes de todo plugin com `spec.isInputRules`.
  - propriedade (Review Focus 2): limite `0..40`, texto inicial e texto colado de `fc.string({ unit: fc.constantFrom('a', ' ', NBSP, '😀', 'é') })` (inicial ≤ 30, colado 1..40); depois de `pasteText`: `characters ≤ Math.max(limite, antes)` e `doc.check()` não lança; 200 execuções.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.** Regra única: entrada aceita se `depois <= limite || depois <= antes` (C6). `handleTextInput`: `view.composing` ou limite `null` → `false`; senão compara `getRteTextStats(deflt().doc)` com o atual; recusa = despachar `state.tr.setMeta(charLimitKey, 'rejected').setMeta('addToHistory', false)` e devolver `true` (o `DOMObserver` redesenha o nó sujo). `handlePaste`: monta o resultado como o `doPaste` (`sliceSingleNode` → `replaceSelectionWith(node, false)`, senão `replaceSelection(slice)`); cabendo, devolve `false`; senão busca binária em `n ∈ [0, sliceCodePoints)` pelo maior `n` cujo resultado com `cutSlice(slice, n)` é aceito (conferindo o candidato final); `n = 0` → recusa; senão despacha o corte com `scrollIntoView`, `paste: true`, `uiEvent: 'paste'` e a *meta* de `rejected`. `handleDrop`: `moved`, composição ou limite `null` → `false`; posição por `view.posAtCoords({ left: event.clientX, top: event.clientY })` (nula → `false`) e `dropPoint(doc, pos, slice) ?? pos` de `@tiptap/pm/transform`; resultado como o `drop` do `prosemirror-view`; recusado → *meta* e `true`. Fábrica: `assertCharLimit(options.charLimit)` antes de montar a lista; `createCharLimitExtension` depois de `rtPlaceholder`.
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): limite de caracteres só na entrada direta, com corte de colagem e IME livre`.

### Task 4: Busca — índice incremental, decorações e navegação (`rtSearch`, C8–C10, C12, R5)

**Files:**
- Create: `packages/core/extensions/src/search-index.ts`, `packages/core/extensions/src/search.ts`, `packages/core/extensions/src/testing/search-reference.ts`
- Modify: `extensions/src/factory.ts` (se `options.features?.search !== false`), `extensions/src/factory.spec.ts` (`BASE_NAMES` + `'rtSearch'`)
- Test: `extensions/src/search.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `truncateText` (`limits.ts`); `typeText` (Tarefa 3); `validDoc`/`text` (Tarefa 1).
- Produces (`search-index.ts`): `SEARCH_CAP = 1000`, `MAX_SEARCH_QUERY = 1000`; `foldCase(text: string): string` (por ponto de código: `c.toLowerCase()` se mantiver o comprimento, senão `c`); `type Matcher = (segment: string) => readonly number[]` e `createMatcher(query: string, options: { caseSensitive: boolean; wholeWord: boolean }): Matcher | null` (`null` para consulta vazia; `indexOf` sobre o texto dobrado, sem sobreposição, avançando 1 quando `wholeWord` recusa; vizinhos — ponto de código antes e depois — não podem casar `/[\p{L}\p{M}\p{N}_]/u`); `blockMatches(node: ProseMirrorNode, matcher: Matcher): readonly (readonly [number, number])[]` (deslocamentos no conteúdo do bloco de texto; segmentos cortados por todo filho que não é texto, inclusive `hardBreak`; incrementa `searchProbe.blocks`); `collectMatches(doc, matcher, cache: WeakMap<ProseMirrorNode, readonly (readonly [number, number])[]>, cap: number): { matches: RteSearchMatch[]; capped: boolean }` (percorre os blocos de texto em ordem sem descer neles; para no `cap + 1`º).
- Produces (`search.ts`): `RteSearchOptions`, `RteSearchState` exatamente como a spec §4 (`RteSearchMatch = { from: number; to: number }`); `getSearchState(editor: Editor): RteSearchState | null` (`null` sem o plugin); `createSearchExtension(ctx): AnyExtension` (nome `rtSearch`); `searchKey`; comandos `setSearchQuery(query, options?)`, `setSearchOptions(options)`, `clearSearch()`, `nextSearchMatch()`, `previousSearchMatch()` (*module augmentation*). A Tarefa 5 acrescenta os de substituição.
- Produces (`testing/search-reference.ts`): `referenceMatches(doc, query, options): RteSearchMatch[]` — ingênua e independente: para cada segmento, para cada `i`, compara `foldCase(seg.slice(i, i + q.length)) === foldCase(q)` (ou igualdade exata com `caseSensitive`), confere vizinhos, avança `q.length` ao casar.

- [ ] **Step 1: Testes que falham** (`q(editor, query, opts?)` = `setSearchQuery` + `getSearchState`):
  - `<p>no<strong>tí</strong>cia</p>`: `notícia` e `NOTÍCIA` → 1 resultado cobrindo o texto; `NOTÍCIA` com `caseSensitive: true` → 0.
  - `<p>ab</p><p>cd</p>` e `<p>ab<br>cd</p>` com `bc` → 0.
  - `alvo` em bloco de código, célula, título de caixa, tarefa e item de "Leia também" → 5 resultados em ordem de documento.
  - `<p>ação reação ação_x ação1 (ação)</p>`, `ação` com `wholeWord` → 2 (o 1º e o entre parênteses).
  - `<p>İstanbul istanbul</p>`: `i` → 1 (só em `istanbul`); `İ` → 1. `<p>Straße STRASSE</p>`: `ß` → 1; `ss` → 1.
  - `<p>a.*b</p>` com `.*` → 1; `<p>ab</p>` com `.*` → 0 (Review Focus 3).
  - teto: `<p>` com `'a '.repeat(1200)` e `a` → `matches.length === 1000`, `total === 1000`, `capped: true`, 1000 `.rte-search-match`.
  - consulta de 1001 `a` → `query.length === 1000`; 999 `a` + `😀` → 999. Consulta vazia → `matches: []`, `activeIndex: -1`, sem decoração.
  - `setSearchOptions({ caseSensitive: true })` recalcula com a mesma consulta; `clearSearch()` → `query: ''`, sem decorações, `lastReplaced: null`; de novo → `false`.
  - ativo: `<p>x a</p><p>a</p><p>a</p>` com o cursor no início do 2º parágrafo → `activeIndex: 1`; cursor no fim do documento → 0.
  - `nextSearchMatch` / `previousSearchMatch` circulares; a seleção é `{ from, to }` do ativo; a transação tem `scrolledIntoView`; com um `<input>` focado fora do editor, `document.activeElement` continua o `input`; exatamente um `.rte-search-match--active`; sem resultados → `false`.
  - edição: ativo no 3º resultado, inserir texto no 1º parágrafo → o ativo continua no mesmo trecho; apagar o trecho ativo → ativo = primeiro em ou depois da posição mapeada.
  - `undo` depois de `setSearchQuery`/`nextSearchMatch` não tem o que desfazer (`editor.can().undo() === false` num editor novo).
  - probe: 500 parágrafos, busca ativa, `searchProbe.blocks = 0`, `typeText` num parágrafo → 1; transação só de *meta* → 0.
  - `features: { search: false }` → `getSearchState` `null` e `editor.commands.setSearchQuery` `undefined`.
  - propriedade: `validDoc` × consulta de `fc.oneof(fc.constant(''), fc.constantFrom('A', 'İ', 'ß', '.*', '&', '😀'), text, trecho do texto do documento)` × opções → `getSearchState(...).matches` = `referenceMatches(...).slice(0, 1000)`; 200 execuções.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.** Estado do plugin (interno): `{ query, caseSensitive, wholeWord, matcher, cache, matches, capped, activeIndex, lastReplaced, decorations }`; `apply`: ação da *meta* (`setQuery`/`setOptions` recriam `matcher` e `cache` e escolhem o ativo pela seleção; `clear`; `activate`); se `tr.docChanged` e há `matcher`, `collectMatches` sobre o novo `doc` (o cache poupa os blocos inalterados) e ativo = primeiro em ou depois de `tr.mapping.map(ativoAnterior.from)` (circular); decorações `Decoration.inline` só quando `matches` ou o ativo mudam. Comandos com `setMeta(searchKey, ação)` + `addToHistory: false`; navegação faz `setSelection(TextSelection.create(doc, from, to)).scrollIntoView()`, sem `focus`. `getSearchState` deriva o objeto público congelado.
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): busca literal incremental por bloco com teto, decorações e navegação circular`.

### Task 5: Substituição (C10, C11, R5)

**Files:**
- Modify: `packages/core/extensions/src/search.ts`
- Test: `extensions/src/search.spec.ts` (bloco `describe('substituição')`)

**Interfaces:**
- Consumes: `collectMatches` com `cap = Infinity` e o `cache` do estado (Tarefa 4).
- Produces: comandos `replaceSearchMatch(replacement: string)` e `replaceAllSearchMatches(replacement: string)`; `normalizeReplacement(text: string, inCode: boolean): string` (NUL → U+FFFD; CRLF/CR/LF → `' '` fora de bloco de código, `'\n'` dentro). Ação de *meta* `{ type: 'replaced', anchor: number, count: number }`: o próximo ativo é o primeiro resultado em ou depois de `anchor` (fim do texto inserido) e `lastReplaced = count`.

- [ ] **Step 1: Testes que falham:**
  - `normalizeReplacement('a\r\nb\rc\nd', false)` → `'a b c d'`; com `true` → `'a\nb\nc\nd'`; `'\0'` → `'�'`.
  - `<p><strong>gato</strong> gato</p>`, `gato` → `cão`: `<p><strong>cão</strong> gato</p>`, o ativo é o `gato` restante, `lastReplaced: 1`. `gato` → `gatos` duas vezes troca os dois (não repete o mesmo trecho). Vazio apaga o trecho.
  - `a\nb` num parágrafo → `a b`; num bloco de código → `<pre><code>a\nb</code></pre>` em `getRteHtml`. `$&$1` sai literal (Review Focus 3).
  - `<p><em>ab</em> <strong>ab</strong></p>`, `ab` → `x` com `replaceAll` → `<p><em>x</em> <strong>x</strong></p>`.
  - 1500 resultados (acima do teto): `replaceAll` troca todos, `lastReplaced: 1500`, um `undo` devolve o `getRteHtml` original.
  - `typeText('z')` seguido de `replaceAll` e um `undo` → o documento volta a ter o `z` (Review Focus 5).
  - `setEditable(false)`: os dois comandos → `false`, documento igual; `setSearchQuery` continua funcionando. Sem resultados → `false`.
  - propriedade (pré-voo 6): `validDoc`, consulta = trecho não vazio do texto, `wholeWord: false`, `r` de `fc.string()` filtrado para não ter ponto de código de `foldCase(consulta)` → depois de `replaceAll(r)`, `total === 0`; `validateHtml(getRteHtml, S, { mode: 'canonical' })` = `[]`; um `undo` devolve o `getRteHtml` original; 200 execuções.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.** Cada troca usa `tr.replaceWith(from, to, schema.text(texto, $from.marksAcross($to) ?? []))` (ou `tr.delete` para texto vazio) — nunca `insertText`, que leria `storedMarks`; `inCode` = `$from.parent.type.spec.code === true`. `replaceAll` percorre do último para o primeiro numa transação só, com `closeHistory(tr)`; `replaceSearchMatch` também. Não editável (`editor.isEditable` das *props* do comando) ou sem ativo → `false`.
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): substituir um e substituir tudo literais, com marcas herdadas e um passo de desfazer`.

### Task 6: Registro de itens `/` e rótulos (C14, C17, R10)

**Files:**
- Create: `packages/core/extensions/src/slash-items.ts`
- Modify: `extensions/src/types.ts` (`slash?: RteSlashOptions`)
- Test: `extensions/src/slash-items.spec.ts` (`node`)

**Interfaces:**
- Produces: `RteSlashItemId`, `RteSlashItem`, `RteSlashLabels`, `RteSlashOptions` exatamente como a spec §4; `RTE_SLASH_LABELS` (congelado em profundidade); `RTE_SLASH_ITEMS` (17, congelados, na ordem do tipo; `group` e comando abaixo; `image`/`video`/`embed` sem `command`); `resolveSlashItems(ctx: RteExtensionContext, items: RteSlashOptions['items']): readonly RteSlashItem[]` (filtra os embutidos por recurso, aplica `items` — a função recebe os já filtrados; valida `id` pela regex e unicidade → `TypeError` pt-BR citando o `id`); `resolveSlashLabels(source: RteSlashOptions['labels']): RteSlashLabels` (por `id`, sobre `en`; só `title` string e `keywords` array de strings; `Object.hasOwn`); `slashTitle(item, labels): string` (`item.title` string/função → senão rótulo do `id` embutido → senão o `id`); `slashKeywords(item, labels): readonly string[]`; `normalizeForFilter(text: string): string` (`NFD`, sem `\p{M}`, minúsculas); `filterSlashItems(items, query, labels): readonly RteSlashItem[]` (consulta vazia → todos; senão casa se `normalizeForFilter(query)` é prefixo de alguma palavra (`split(/[^\p{L}\p{N}]+/u)`) do título, das palavras-chave ou do `id` — o `id` inteiro e suas partes por hífen/camelCase; ordem do registro).
- Recursos dos embutidos: base = `paragraph`, `heading2–4`, `bulletList`, `orderedList`, `blockquote`, `horizontalRule`; `tasks` = `taskList`; `code` = `codeBlock`; `tables` = `table`; `newsBlocks` = `callout`, `pullquote`, `readAlso`; `media` = `image`, `video`; `embeds` com `ctx.providers.length > 0` = `embed`.
- Grupos: `text` = paragraph, heading2–4; `lists` = bulletList, orderedList, taskList; `blocks` = blockquote, codeBlock, table, horizontalRule; `news` = callout, pullquote, readAlso; `media` = image, video, embed.
- Comandos (spec §4): `setParagraph()`, `setHeading({ level: 2|3|4 })`, `toggleBulletList()`, `toggleOrderedList()`, `toggleTaskList()`, `setBlockquote()`, `setCodeBlock()`, `command(notInsideTable).insertTable({ rows: 3, cols: 3, withHeaderRow: true })` (pré-voo 5; `notInsideTable` = nenhum ancestral da seleção é `table`), `setHorizontalRule()`, `setCallout('info')`, `setPullquote({})`, `insertReadAlso()`.
- Rótulos (cópia fixada por este plano; `título · palavras-chave`):

| id | en | pt-BR | es |
|---|---|---|---|
| paragraph | Paragraph · text, p | Parágrafo · texto, p | Párrafo · texto, p |
| heading2 | Heading 2 · title, h2, subtitle | Título 2 · cabeçalho, h2, subtítulo | Título 2 · encabezado, h2, subtítulo |
| heading3 | Heading 3 · h3 | Título 3 · h3 | Título 3 · h3 |
| heading4 | Heading 4 · h4 | Título 4 · h4 | Título 4 · h4 |
| bulletList | Bulleted list · ul, bullets, unordered | Lista com marcadores · ul, marcadores, tópicos | Lista con viñetas · ul, viñetas |
| orderedList | Numbered list · ol, ordered, numbers | Lista numerada · ol, números, ordenada | Lista numerada · ol, números, ordenada |
| taskList | Task list · todo, checklist, checkbox | Lista de tarefas · tarefas, checklist, afazeres | Lista de tareas · tareas, checklist, pendientes |
| blockquote | Quote · blockquote, citation | Citação · blockquote, aspas | Cita · blockquote, comillas |
| codeBlock | Code block · code, pre, snippet | Bloco de código · código, pre, trecho | Bloque de código · código, pre, fragmento |
| table | Table · grid, rows, columns | Tabela · grade, linhas, colunas | Tabla · cuadrícula, filas, columnas |
| horizontalRule | Divider · hr, separator, line | Linha horizontal · hr, separador, divisória | Línea horizontal · hr, separador, divisor |
| callout | Callout · note, box, warning | Caixa de destaque · destaque, nota, aviso | Recuadro destacado · destacado, nota, aviso |
| pullquote | Pull quote · quote, highlight | Citação em destaque · olho, aspas | Cita destacada · comillas |
| readAlso | Read also · related, links, see also | Leia também · relacionados, links, veja também | Lee también · relacionados, enlaces, ver también |
| image | Image · picture, photo, img | Imagem · foto, figura, img | Imagen · foto, figura, img |
| video | Video · movie, clip, mp4 | Vídeo · filme, clipe, mp4 | Vídeo · película, clip, mp4 |
| embed | Embed · youtube, vimeo, spotify, iframe | Incorporar · embed, youtube, vimeo, spotify | Insertar · embed, youtube, vimeo, spotify |

- [ ] **Step 1: Testes que falham:**
  - completude: cada idioma tem os 17 ids com `title` não vazio e `keywords` array; `Object.isFrozen` em profundidade.
  - `RTE_SLASH_ITEMS.map((i) => i.id)` na ordem do tipo; `group` de cada um; `command` função exceto `image`, `video`, `embed`.
  - `resolveSlashItems` com `createExtensionContext` padrão → 17; `features: { tables: false }` sem `table`; `embedProviders: []` sem `embed`; `media: false` sem `image`/`video`; `newsBlocks: false` sem os 3; `code: false`; `tasks: false`; a função `items` recebe a lista já filtrada; array estático substitui os embutidos; `id` `'Bad'`, `'1a'`, `''`, `'a'.repeat(41)` e repetido → `TypeError`; `'constructor'` é aceito e `slashTitle` devolve `'constructor'` (não a função do protótipo).
  - filtro com pt-BR: `tab` → `['table']`; `tit`, `tít`, `TÍT` → `heading2`, `heading3`, `heading4`; `lista` e `list` → `bulletList`, `orderedList`, `taskList`; `h2` → `heading2`; `xyz` → `[]`; `''` → todos na ordem. Com `en`: `quote` → `blockquote`, `pullquote`.
  - `labels: { table: { title: 'Grade', keywords: [] } }` → `gra` acha `table`; `labels` por função chamada a cada `resolveSlashLabels`; `title: 1` ignorado (fica `en`).
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): registro de itens / com recursos, rótulos pt-BR/en/es e filtro sem acentos`.

### Task 7: Comandos `/` — gatilho, estado e disponibilidade (`rtSlashCommand`, C13, C14, C18)

**Files:**
- Create: `packages/core/extensions/src/slash.ts`
- Modify: `extensions/src/factory.ts` (se `options.features?.slashCommands !== false`; `resolveSlashItems` na criação), `extensions/src/factory.spec.ts` (`BASE_NAMES` + `'rtSlashCommand'`)
- Test: `extensions/src/slash.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: Tarefa 6; `typeText`, `pressKey`.
- Produces: `RteSlashMenuState` (spec §4); `getSlashMenuState(editor: Editor): RteSlashMenuState` (fechado e congelado sem o plugin ou com `!editor.isEditable`; `items` = `filterSlashItems` dos disponíveis com `title` e `group`; `activeIndex` limitado a `items.length - 1`, `-1` sem itens); `createSlashCommandExtension(ctx, options: RteSlashOptions | undefined): AnyExtension` (nome `rtSlashCommand`, `priority: 1000`); `slashKey`; `SLASH_QUERY_MAX = 30`; comandos `setSlashActiveIndex(index: number)` e `closeSlashMenu()`. Estado interno `{ open: boolean; from: number; activeIndex: number; pendingUi: string | null }` (`from` = posição do `/`).
- Disponibilidade (C14): item com `command` está disponível se `item.command(editor.can().chain().deleteRange(range), editor).run()` (exceção → indisponível); sem `command`, sempre.

- [ ] **Step 1: Testes que falham:**
  - abre: `typeText('/')` em parágrafo vazio → `open: true`, `query: ''`, `range` do `/` ao cursor, `activeIndex: 0`, `.rte-slash-query` com texto `/`; depois de `abc ` e depois de NBSP; parágrafo dentro de item de lista, citação, corpo de caixa e célula.
  - não abre: depois de letra (`abc/`), depois de `<br>`, em `heading`, `codeBlock`, `rtTaskItem`, título de caixa, item de "Leia também", com `toggleCode()` antes; `view.dispatch(state.tr.insertText('/'))`, `insertContent('/')`, `setContent('<p>/</p>')`, `pasteText('/')`; só `someProp('handleTextInput', …)` sem despacho seguido de outra transação; `<p>/tab</p>` com o cursor movido para depois do `b`.
  - consulta: `typeText('/ta')` → `query: 'ta'`, itens filtrados; `setSlashActiveIndex(1)` e mais uma letra → `activeIndex` volta a 0.
  - fecha: espaço; o 31º caractere da consulta (30 ainda aberto); cursor antes do `/` ou em outro bloco; seleção não vazia; `/` apagado com `Backspace`; `closeSlashMenu()` e depois `typeText('b')` não reabre; `setEditable(false)` → fechado, e depois `setEditable(true)` continua fechado; `setContent('<p>x</p>')` com o menu aberto → fechado (Review Focus 4).
  - disponibilidade: `/` num parágrafo de célula → sem `table`; com `features: { media: false }` sem `image`/`video`.
  - estado: mesmo `EditorState` → mesmo objeto; transações de menu com `addToHistory: false`; `features: { slashCommands: false }` → fechado e sem comandos.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.** `props.handleTextInput(view, from, to, text)`: com `text === '/'` grava `pending = { from, to, doc: view.state.doc }` e devolve `false`. `apply(tr, prev, old, next)`: se `pending.doc === tr.before`, `tr.steps.length === 1`, o passo é `ReplaceStep` com `from`/`to` iguais aos gravados e insere um só nó de texto `'/'` sem a marca `code`, o pai em `next` é `paragraph`, o que vem antes do `/` é início do bloco ou texto terminado em `' '`/`' '`, e o editor é editável → abre com `from`; `pending` zera a cada `apply`. Aberto: `from` mapeado (`mapResult(from, 1).deleted` ou caractere ≠ `/` → fecha) e as regras de fechamento de C13 conferidas sobre `next.selection`; consulta = texto entre `from + 1` e o cursor; `activeIndex` volta a 0 quando a consulta muda. Plugin `view.update`: `!view.editable` com o menu aberto → despacha o fechamento. Decoração `Decoration.inline(from, cursor, { class: 'rte-slash-query' })`.
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): gatilho do menu / só por digitação, consulta, fechamento e disponibilidade por can()`.

### Task 8: Comandos `/` — execução, itens de UI e teclado (C15, C16, R6)

**Files:**
- Modify: `packages/core/extensions/src/slash.ts`
- Test: `extensions/src/slash.spec.ts` (blocos `execução`, `teclado`, `propriedade`)

**Interfaces:**
- Consumes: estado e getter da Tarefa 7.
- Produces: comando `runSlashItem(index?: number)` (padrão: o ativo) construído sobre `props.chain()` (mesma transação): `command(({ tr }) => { closeHistory(tr); tr.setMeta(slashKey, fechar); return true })`, `deleteRange(range)` e, se houver, `item.command(cadeia, editor)`; item de UI grava `pendingUi = id` e o `view.update` do plugin chama `options.onUiItem?.(id, editor)` uma vez, depois do estado aplicado. `addKeyboardShortcuts`: `ArrowDown`/`ArrowUp` (circulares por `setSlashActiveIndex`), `Enter` (`runSlashItem()`), `Escape` (`closeSlashMenu()`) — só com o menu aberto e editável; sem itens, só `Escape`; `Tab` nunca.

- [ ] **Step 1: Testes que falham:**
  - `typeText('/tab')` + `pressKey(editor, 'Enter')` → `true`; o documento é só a tabela (3 linhas × 3 células, 1ª linha de `tableHeader`; o parágrafo vazio foi substituído, lição 14); `validateHtml` canônico `[]`; um `undo` → `getRteHtml` `<p>/tab</p>` (Review Focus 5: a digitação veio menos de 500 ms antes).
  - `abc /heading` + `Enter` → `heading` nível 2 com texto `abc `; um `undo` volta a `abc /heading`.
  - `ArrowDown`/`ArrowUp` circulares (`pressKey` → `true`); `/zzz`: `ArrowDown` e `Enter` → `false` e `keyboardShortcut('Enter')` divide o parágrafo; com itens, `keyboardShortcut('Enter')` executa sem dividir; `Escape` → `true` e fecha; `Tab` com o menu aberto → `false`.
  - prioridade: em item de lista, `/tab` + `keyboardShortcut('Enter')` insere a tabela em vez de dividir o item.
  - UI: `onUiItem = vi.fn()`; `/ima` + `Enter` → `/ima` apagado, menu fechado, `onUiItem` chamado uma vez com `('image', editor)` e, dentro da chamada, `editor.state.doc.textContent` já sem `/ima`.
  - item do consumidor `{ id: 'x', title: 'X', command: (c) => c.insertContent('X') }` → parágrafo `X`.
  - `runSlashItem(99)` e com o menu fechado → `false`; `setSlashActiveIndex(-1)` e `(1.5)` → `false`.
  - para cada embutido com comando, num parágrafo vazio único: `doc.check()` passa, `validateHtml` canônico `[]`; para `table`, `horizontalRule`, `readAlso`, `callout`, `pullquote` o `doc.firstChild` é o nó novo.
  - propriedade (§6.2): `validDoc` × item com comando (`fc.constantFrom`) × parágrafo escolhido do documento: cursor no fim dele, `typeText(' /')`, `runSlashItem(índice do item)` quando disponível → `doc.check()` passa e `validateHtml(getRteHtml, S, { mode: 'canonical' })` = `[]`; 200 execuções.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.** Se algum comando embutido deixar o parágrafo vazio antes do nó inserido, compor o item com o ajudante de `insert.ts` (`emptyParagraph`/`replaceEmptyParagraphWith`) sem mudar o comando global.
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): execução de itens / numa transação, itens de UI por onUiItem e teclado do menu`.

### Task 9: API pública, fábrica, SSR e contrato sem vazamento (R1, R7, C20)

**Files:**
- Modify: `packages/core/extensions/src/index.ts`, `extensions/src/index.spec.ts`, `extensions/src/factory.spec.ts`, `extensions/src/ssr.spec.ts`, `extensions/src/contract.spec.ts`

**Interfaces:**
- Produces (`@cds/rte-core/extensions`): valores `getRteTextStats`, `getCharLimitState`, `getSearchState`, `getSlashMenuState`, `RTE_SLASH_LABELS`, `RTE_SLASH_ITEMS`; tipos `RteTextStats`, `RteCharLimitState`, `RteSearchOptions`, `RteSearchState`, `RteSlashItemId`, `RteSlashItem`, `RteSlashLabels`, `RteSlashOptions`, `RteSlashMenuState`. Internos (`textStatsProbe`, `searchProbe`, `foldCase`, `cutSlice`, `resolveSlashItems`, `searchKey`, `slashKey`, `charLimitKey`) **não** exportados.

- [ ] **Step 1: Testes que falham:**
  - `index.spec.ts`: `Object.keys(ext).sort()` = `['RTE_CONTENT_LABELS', 'RTE_SLASH_ITEMS', 'RTE_SLASH_LABELS', 'createEditorExtensions', 'getCharLimitState', 'getRteHeadings', 'getRteHtml', 'getRteTextStats', 'getSearchState', 'getSlashMenuState', 'serializeRteHtml']`; internos acima ausentes; os tipos novos usados numa atribuição.
  - `factory.spec.ts`: trocar "aceitos e ignorados" por: `{ ...OFF, search: false, slashCommands: false }` → `BASE_NAMES` sem `rtSearch`/`rtSlashCommand`; com tudo ligado a lista termina em `'rtLang', 'rtPlaceholder', 'rtCharLimit', 'rtSearch', 'rtSlashCommand'` e a extensão do consumidor vem depois; `slash: { items: (d) => [...d, d[0]!] }` → `TypeError`.
  - `ssr.spec.ts` (`node`): com o editor `element: null` do fixture JSON, `getSearchState(editor)` tem `query: ''`, `getSlashMenuState(editor).open === false`, `getCharLimitState(editor).characters` e `getRteTextStats(editor.state.doc)` iguais a `countCharacters(htmlToText(fixture))`.
  - `contract.spec.ts` (R7): fixture com `setSearchQuery('a')` ativo → `getRteHtml` igual ao arquivo; editor com `typeText('/')` (menu aberto) e editor vazio com `placeholder: 'P'` → `getRteHtml` e `getHTML()` iguais aos de um editor com a mesma lista sem `rtSearch`, `rtSlashCommand` e `rtPlaceholder` (via 3º argumento de `createTestEditor`) e o mesmo documento, sem `rte-`, `data-placeholder` nem `aria-placeholder`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** os exports.
- [ ] **Step 4: Rodar e ver passar** — `npx nx run-many -t lint,typecheck,build,test,verify-package -p core` verde; `all-features.json` sem drift.
- [ ] **Step 5: Commit** — `feat(core): API pública das extensões de produtividade, SSR e contrato sem vazamento`.

### Task 10: Navegador real E8–E11 e o caso novo do E1 (§6.3, R8)

**Files:**
- Create: `e2e/core/editor-placeholder.spec.ts`, `e2e/core/editor-char-limit.spec.ts`, `e2e/core/editor-search.spec.ts`, `e2e/core/editor-slash.spec.ts`
- Modify: `e2e/core/helpers/editor-bundle.ts` (exporta `getSearchState`, `getSlashMenuState`, `getCharLimitState`, `getRteTextStats` de `extensions/src/index` e `htmlToText` de `html/src/index`), `e2e/core/helpers/editor-page.ts` (CSS: `.rte-placeholder::before { content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: #6b6b6b }`, `.rte-search-match { background: #fff3a3 }`, `.rte-search-match--active { background: #ffb74d }`, `.rte-slash-query { text-decoration: underline }`), `e2e/core/window.d.ts`, `e2e/core/editor-contract.spec.ts`, `e2e/README.md`

- [ ] **Step 1: E8** — editor com `{ placeholder: 'Escreva aqui' }`: `getComputedStyle(p, '::before').content === '"Escreva aqui"'` e `aria-placeholder`; `page.keyboard.type('a')` remove; `ControlOrMeta+A` + `Backspace` devolve; callout `warning` com título vazio mostra `Warning`; `getRteHtml` sem `rte-`.
- [ ] **Step 2: E9** — `{ charLimit: 5 }`, `<p>abcd</p>`, foco no fim: `page.keyboard.type('xyz')` → `getRteHtml` `<p>abcdx</p>`, o `textContent` do parágrafo no DOM também `abcdx` (Review Focus 1), `rejected` 2; `Backspace` apaga; `view.pasteHTML('<p>123456</p>')` com limite 10 corta; `setContent` acima → `overLimit`; IME (só Chromium; nos outros `test.skip(browserName !== 'chromium', 'IME por CDP só no Chromium (spec 03c, E9)')`): no limite, `Input.imeSetComposition({ text: 'あ', selectionStart: 1, selectionEnd: 1 })` + `Input.insertText({ text: 'あ' })` → texto contém `あ`, `overLimit: true`, `rejected` igual.
- [ ] **Step 3: E10** — `<p>gato <strong>gato</strong></p>` + 60 parágrafos e um `gato` no fim: `setSearchQuery('gato')` → `.rte-search-match` visíveis e um `--active`; `previousSearchMatch()` a partir do 1º seleciona o do fim e `expect(último).toBeInViewport()`; `replaceAllSearchMatches('cão')` + `ControlOrMeta+Z` com o foco no editor → `getRteHtml` original. R8: documento de 2000 parágrafos × 10 palavras, `{ charLimit: 1_000_000 }` e busca `palavra` ativa; 50 teclas pelo caminho de `handleTextInput` medidas com `performance.now()` em volta de `someProp('handleTextInput')` + `dispatch`; mediana e p95 em `test.info().annotations` (`R8`) e `console.log`; asserção só `mediana < 1000` (informativo).
- [ ] **Step 4: E11** — `page.keyboard.type('/')` no início abre e `a/` não abre; `/tab` filtra para `[Table]`; `ArrowDown` + `Enter` → tabela válida (`validateHtml` `[]`) e `ControlOrMeta+Z` volta a `<p>/tab</p>`; `Escape` fecha e `b` não reabre; `Enter` com o menu aberto não cria parágrafo novo; em `<pre><code>` não abre.
- [ ] **Step 5: E1 (R7)** em `editor-contract.spec.ts`: fixture com busca `a` ativa → `getRteHtml` igual ao arquivo e `getHTML()` sem `rte-search-match`.
- [ ] **Step 6: Rodar** — `npm run typecheck:e2e`; `npx playwright test -c e2e e2e/core --workers=4` → PASS nos 3 motores; suíte inteira com `--workers=4` verde; anotar a mediana/p95 do Chromium para o ADR. Documentar os specs novos no `e2e/README.md`.
- [ ] **Step 7: Commit** — `test(core): placeholder, limite, busca e comandos / em navegador real (E8–E11)`.

### Task 11: Orçamento de tamanho, ADR 0005, documentação e verificação final (R8, R9)

**Files:**
- Create: `docs/decisions/0005-extensoes-de-produtividade.md`, `.changeset/core-03c.md` (`'@cds/rte-core': minor`)
- Modify: `packages/core/size-budget.json`, `packages/core/README.md`, `docs/specs/03c-extensoes-de-produtividade.md` (critérios §7 marcados), `docs/specs/README.md` (linha da 03c: "concluída; falta o CI do PR"), `docs/decisions/0004-extensoes-de-conteudo.md` (decisão 29 e Consequências: placeholder do título atendido pela 03c)

- [ ] **Step 1: Medir** — `npx nx build core`; `node tools/check-size.mjs --config packages/core/size-budget.json`; para `extensions` e `whole` acima do orçamento atual, novo orçamento = `Math.ceil(medido * 1.15 / 64) * 64` (regra do ADR 0003); anotar `min`/`gzip` medidos.
- [ ] **Step 2: ADR 0005** (formato do ADR 0004): Contexto; (a) C1–C20 com motivo; (b) rulings — o pré-voo inteiro e os desta execução; (c) mudanças na spec; (d) números (tamanhos da Etapa 1, mediana/p95 do R8 no Chromium); (e) verificação em navegador; Pendências (busca em atributos, regex e sem diacríticos como evolução; IME fora do Chromium com a spec 08; `check:size` só do tema; tabela aninhada ainda possível por colagem/toolbar); Consequências para a spec 05 (§8 da spec).
- [ ] **Step 3: README do core** — busca e substituição (literal, teto 1000, sem atributos), comandos `/` (abertura, teclado, `priority: 1000`, `onUiItem`, rótulos), limite (C6 com o exemplo de IME: a composição nunca é recusada e o estado fica `overLimit`), contagem (C5: `countCharacters(htmlToText(html))` no servidor) e placeholder (classes `rte-*`, `aria-placeholder`).
- [ ] **Step 4: Verificação final** — `npm run check:rules`, `npm run test:tools`, `npx nx run-many -t lint,typecheck,build,test,verify-package,size`, `npm run check:licenses`, `npm run notices` sem diff, `docs/html-schema.md` sem drift, `npm run typecheck:e2e`, `npx playwright test -c e2e --workers=4` → tudo verde; marcar cada critério da §7 com a evidência.
- [ ] **Step 5: Commit** — `docs(core): ADR 0005 das extensões de produtividade, orçamento, README e fechamento da spec 03c`.
