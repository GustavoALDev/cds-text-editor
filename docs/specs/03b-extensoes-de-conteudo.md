# Spec 03b — Extensões de conteúdo, fábrica e teste de contrato (`@cds/rte-core`)

> Parte 2 de 3 da spec 03 (ver `03-core-e-esquema.md`). Depende da 03a (concluída), cujo §4 é o **contrato vinculante** da marcação. Consumida pelas specs 03c (busca, comandos `/`, limite, placeholder), 04 (fixture do contrato), 05 (editor Angular) e 06 (renderização).
> O código do modelo (MyPresentation) foi perdido: as extensões são escritas do zero sobre Tiptap 3; nenhum teste é "portado". Decisões tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro"; fatos de pacotes conferidos com `npm view` e no código-fonte do Tiptap 3.31.4 em 2026-10-03.

## 1. Objetivo

Entregar as extensões Tiptap que **produzem exatamente o HTML da 03a §4**, a fábrica `createEditorExtensions(options)` (fonte única da lista de extensões), o **serializador canônico** desse HTML, a leitura tolerante de HTML genérico/colado (A1), o catálogo de linguagens de código sob demanda (`/code-languages`), o NodeView de redimensionamento de imagem, o fixture "todos os recursos" e o **teste de contrato** HTML ⊆ esquema que falha quando uma extensão muda sem o esquema (lição 9).

## 2. Fora de escopo

Busca e substituição, comandos `/`, limite de caracteres e placeholder (03c); toolbar, menus, modais, upload, CSS do editor (inclusive o visual das alças e do realce) e i18n da UI (05); sanitização (04); CSS de leitura e realce na exibição (06); colar/arrastar arquivo de imagem e transformar URL colada em embed (05).

## 3. Decisões

Cada uma com o motivo. Todas valem para o plano e a implementação; divergências viram ADR 0004.

| # | Decisão | Motivo |
|---|---|---|
| B1 | Todo código que importa Tiptap/ProseMirror fica no **entry novo `@cds/rte-core/extensions`** (`packages/core/extensions/src/`); `.`, `/embeds` e `/html` continuam sem Tiptap (regra de lint `no-restricted-imports` para `@tiptap/*`, `lowlight` e `highlight.js` fora de `extensions/src` e `code-languages/src`). | Lição 8 (barrel puxando o editor) e o sanitizador no servidor importa `.` sem carregar o editor. |
| B2 | Pacotes oficiais usados (todos MIT, 3.31.4): `@tiptap/core`, `@tiptap/pm`, `extension-document`, `-paragraph`, `-text`, `-heading`, `-bold`, `-italic`, `-underline`, `-strike`, `-code`, `-subscript`, `-superscript`, `-blockquote`, `-horizontal-rule`, `-hard-break`, `-list` (BulletList, OrderedList, ListItem, ListKeymap), `-text-align`, `-link` (dep. `linkifyjs` 4.3.3, MIT), `-code-block`, `-table`, `@tiptap/extensions` (UndoRedo, Dropcursor, Gapcursor); mais `lowlight` 3.3.0 (MIT) e `highlight.js` 11 (BSD-3-Clause). | Só o necessário para a marcação da 03a; licenças dentro do gate (MIT/ISC/BSD/Apache/0BSD); nada Pro/Cloud. |
| B3 | **Sem `@tiptap/starter-kit`.** | O 3.31.4 declara `@tiptap/core` e `@tiptap/pm` em `dependencies` com versão exata: com o core do consumidor em outra versão, o npm instala uma **segunda cópia do ProseMirror** em silêncio. As extensões avulsas declaram `@tiptap/core`/`@tiptap/pm` como **peer exato** (desde a 3.24; até a 3.22 era `^`), então versões desencontradas falham alto na instalação em vez de duplicar. |
| B4 | Todos os pacotes de B2 são **`peerDependencies` opcionais** do core (`peerDependenciesMeta.optional`), faixa `^3.31.4` para `@tiptap/*`, `^3.3.0` para `lowlight` e `^11.11.1` para `highlight.js`; o `@cds/rte-angular` (spec 05) os declara como peers obrigatórios (o npm ≥ 7 os instala sozinho). Os mesmos pacotes entram exatos (3.31.4) nas `devDependencies` da raiz. | Uma só cópia do ProseMirror, controlada pelo consumidor; quem usa só o sanitizador no servidor não baixa Tiptap nem os 5,4 MB do `highlight.js`. |
| B5 | Piso de versão **Tiptap 3.31.4** (o do lock) = o "mínimo" da matriz de CI da spec 08. | Peers exatos do Tiptap exigem todos os `@tiptap/*` na mesma versão; testar só o que se suporta. |
| B6 | Não usados: `extension-text-style`/`Color`/`-highlight` (cor CSS arbitrária e `data-color` + `color: inherit`, contra A3), `extension-code-block-lowlight` (usa `highlightAuto`, não recalcula ao registrar linguagem depois e importa o core global do `highlight.js`), `extension-image` (sem `figure`), `TaskList`/`TaskItem` oficiais (conteúdo `paragraph+` e marcação diferente da 03a), `TrailingNode` (acrescentaria `<p></p>` ao fim da saída), `@tiptap/static-renderer` (peer React) e `@tiptap/html` (peer happy-dom). | Cada um diverge do contrato ou pesa sem necessidade. |
| B7 | **Serializador canônico próprio, sem DOM:** `serializeRteHtml(doc)` usa o `DOMSerializer` do ProseMirror com um **documento de strings** interno e escreve o HTML pelo algoritmo de serialização do HTML. `getRteHtml(editor)` é a **saída oficial** do editor (a spec 05 usa para o `value`). | Desde o `prosemirror-model` 1.25, o `style` é aplicado via CSSOM (`dom.style.cssText`), então `editor.getHTML()` sai como `color: rgb(179, 38, 30);` (com `;` final, cores em `rgb()`), diferente por motor. Sem DOM, a saída é idêntica em Node, jsdom e nos 3 navegadores e funciona em SSR a partir de JSON (verificado em protótipo). |
| B8 | **Ids de título calculados na serialização**, função pura dos textos dos títulos em ordem de documento (`createHeadingIds({ prefix })` da 03a); o nó `heading` **não** guarda `id` e ids colados são ignorados. | Cobre a carga inicial sem transação nenhuma (lição 10, inclusive editor sem montar e SSR); nada de *DOM clobbering* por id colado; determinístico. Custo: mudar o texto do título muda o id (documentado). |
| B9 | **Toda regra de atributo vem do mesmo objeto `getHtmlSchema(options)`** que a fábrica monta uma vez: as extensões validam na **leitura** e de novo na **renderização** com `normalizeAttribute`/`isAllowedUrl`/`getLinkAttributes`. | Uma fonte só (03a R1); conteúdo em JSON (spec 05, `format: 'json'`) não passa pelas regras de leitura. |
| B10 | Legenda, crédito, autor e cargo são **atributos de texto puro** de nós atômicos (imagem, vídeo, embed) ou de bloco (citação). | O ProseMirror exige que o "buraco" de conteúdo seja o único filho do pai, o que impede `figcaption` editável ao lado de `img`/`small`; texto puro mantém a marcação previsível. Formatação em legenda fica fora da v1. |
| B11 | **Tarefa como bloco de texto** (`rtTaskItem`, conteúdo `inline*`, sem aninhamento): a renderização devolve `{ dom, contentDOM }` montado com o "documento de renderização" (o de strings no serializador, o global no navegador), com `contentDOM` = o `label`. | É a única forma de gerar `<label><input …>Texto</label>` (conteúdo ao lado do `input`). Verificado em protótipo. |
| B12 | Títulos de caixa de destaque e de "Leia também" são **nós filhos editáveis**; se faltarem na leitura, são **sintetizados** com o rótulo traduzido; título vazio sai com o rótulo da variante na serialização. | WCAG 1.4.1: o tipo da caixa não pode depender só de cor (A2). Sem a síntese, o ProseMirror expulsa o conteúdo da caixa (verificado). Na execução, o título sintetizado nasce **vazio** e recebe o rótulo na serialização (§5, item 3b; ADR 0004). |
| B13 | Cores por **marcas próprias** que leem só `data-rt-color`; `style` de entrada nunca é lido (A3); `<mark>` de outro editor vira marca-texto `yellow`. | A3 e lição 9 (`mark` perdia `data-color`). |
| B14 | Links: `Link` oficial estendido, só com `href` e `target` guardados; `rel`/`target` saem de `getLinkAttributes(href, linkPolicy, { target })` **na renderização**; `openOnClick: false`, `defaultProtocol: 'https'`. | O padrão do Tiptap renderiza `target="_blank" rel="noopener noreferrer nofollow"` em todo link (contra a lição 10); uma função pura só decide os atributos. |
| B15 | Realce: `CodeBlock` oficial + **plugin próprio de decorações** com uma instância de `lowlight` por editor (`createLowlight()` sem gramáticas); linguagem não registrada fica sem realce (nunca `highlightAuto`); o catálogo `/code-languages` carrega cada gramática por `import()`; padrão da fábrica: `codeLanguages: []`. | Sob demanda (spec 03 §4.5), sem `lowlight/common`; decorações nunca vão para o HTML (03a §4.4). |
| B16 | Tabelas: `Table`/`TableRow`/`TableHeader`/`TableCell` oficiais estendidos: `table` sem `style`, `colgroup` só quando há largura, `col` só com `width`, sem `align` em célula, `colwidth` lido do nosso `colgroup`. | O oficial gera `style="min-width: …"` em `table` e `col` e `colwidth`/`text-align` em células, fora do esquema. |
| B17 | NodeView de redimensionamento **só DOM, no core**; a lógica é a `computeResize` (03a); um arrasto vira **uma** transação; `Escape` cancela; a alternativa sem arrasto (WCAG 2.5.7) é o comando `setImageSize`, exposto pela UI da spec 05. | Lição 12 (navegador real) e SSR: nada de DOM fora do construtor do NodeView. |
| B18 | Fábrica: as opções são um **superconjunto de `RteHtmlSchemaOptions`** (o mesmo objeto alimenta `getHtmlSchema`); cada chamada cria instâncias novas; valores dinâmicos (rótulos) por **função**, nunca mutando `extension.options` (lição 4); extensões do consumidor entram no fim; nome repetido lança `TypeError`. | Configurável sem fork e previsível; editor e esquema não divergem por configuração. |
| B19 | Nomes de nós/marcas próprios com prefixo `rt` (`rtImage`, `rtTaskItem`…); os oficiais mantêm o nome (`paragraph`, `heading`, `link`, `codeBlock`, `table`…). Os nomes e atributos são **API pública** (formato JSON da spec 05). | Evita colisão com extensões oficiais instaladas pelo consumidor. |
| B20 | **`validateHtml(html, schema)`** (entry `/html`, sem DOM, sobre o `htmlparser2`) e **`isAllowedClass(spec, token)`** (entry `.`) entram agora, públicos. Os interpretadores que **transformam** (`ensureTokens`, `requireChild`, `required`/`default`/`onInvalid`) continuam na spec 04. | O teste de contrato precisa conferir classes e o resto sem lista paralela; antecipa parte da decisão 16 do ADR 0003. |
| B21 | Testes do editor em Vitest com **jsdom por arquivo** (`// @vitest-environment jsdom`); o padrão do core segue `node`. O teste de SSR do `/extensions` roda em `node` **sem** as armadilhas de getter. | O `prosemirror-view` testa `typeof document`/`typeof navigator` ao importar (verificado): a armadilha que lança no getter quebraria um import legítimo; em Node real esses globais são ausentes e o import funciona. |
| B22 | Fixtures compartilhados em **`fixtures/content/`** na raiz: `all-features.html` (escrito à mão, ponto fixo), `all-features.json` (gerado) e `tolerant-cases.json` (leitura tolerante). | A spec 04 (outro pacote) e a 06 consomem o mesmo arquivo sem importar código de outro pacote. |
| B23 | Primeira tarefa: **correção herdada da 03a** no validador de provedor (R1). | Pendência que enfraquece o pareamento host × padrão do `iframe`. |

## 4. Marcação produzida por recurso

Saída de `serializeRteHtml`. Ordem de atributos fixa, como na tabela; booleanos saem como `nome=""` (forma do algoritmo de serialização do HTML; os exemplos da 03a usam a forma minimizada, equivalente). Atributo opcional inválido ou ausente é **omitido**; obrigatório inválido deixa o elemento sem ele (inerte; o sanitizador o remove).

| Recurso | Extensão (nome) | Origem | Saída canônica | Leitura (regras) |
|---|---|---|---|---|
| base | `doc`, `paragraph`, `text` | oficial | `<p [style="text-align: X"]>` | `TextAlign` oficial (`types: ['heading', 'paragraph']`, valores `left/center/right/justify`; outro valor é ignorado) |
| base | `heading` | `Heading` estendido, `levels: [2, 3, 4]` | `<hN id="<prefixo><slug>" [style="text-align: X"]>`, N = 2–4, `id` sempre presente e único (B8) | `h1`→2; `h2`–`h4` iguais; `h5`/`h6`→4; `id` de entrada ignorado; nível fora de 2–4 vindo de JSON é limitado a 2–4 na renderização |
| base | `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript` | oficiais | `strong`, `em`, `u`, `s`, `code`, `sup`, `sub` sem atributos | regras oficiais (`b`, `i`, `del`, estilos `font-weight`/`text-decoration` etc.; `<b style="font-weight:normal">` do Google Docs não vira negrito) |
| base | `blockquote`, `horizontalRule`, `hardBreak` | oficiais | `<blockquote>`, `<hr>`, `<br>` | oficiais |
| base | `bulletList`, `orderedList`, `listItem`, `listKeymap` | oficiais; `orderedList` com atributos substituídos | `<ul>`, `<ol [start="N"]>` (N 2–100000; 1 é omitido), `<li><p>…</p></li>` | `start` pela regra `int` do esquema, senão 1; `type`/`list-style-type` descartados |
| links | `link` | `Link` estendido (B14) | `<a href="…" [target="_blank"] [rel="…"]>` com valores de `getLinkAttributes` | `a[href]`: `getLinkAttributes(href, linkPolicy, { target })`; `null` → texto sem link; `<a>` sem `target` continua sem `target`; `class`/`title` descartados |
| colors | `rtTextColor` (marca) | própria | `<span data-rt-color="<nome>" style="color: <hex light>">` | `span[data-rt-color]` com nome da paleta de texto (`consuming: false`, para `lang` no mesmo `span` também casar); `style` ignorado. Cor e idioma no mesmo trecho saem como `span` **aninhados** (`<span data-rt-color…><span lang…>`), nunca um `span` só: o ProseMirror serializa cada marca como um elemento |
| colors | `rtHighlight` (marca) | própria | `<mark data-rt-color="<nome>" style="background-color: <hex light>">` | `mark`: nome da paleta de marca-texto, senão `yellow` |
| code | `codeBlock` | `CodeBlock` estendido + plugin de realce (B15) | `<pre><code [class="language-<id>"]>…</code></pre>` | `pre` (`preserveWhitespace: 'full'`); classe `language-X` do `code`: minúsculas ASCII, alias do catálogo resolvido para o `id`, aceito se `isAllowedClass` aceitar `language-<id>`; senão sem linguagem |
| tables | `table`, `tableRow`, `tableHeader`, `tableCell` | oficiais estendidos (B16), `resizable: true`, `renderWrapper: false`, `allowTableNodeSelection: false` | `<table>[<colgroup><col [style="width: Npx"]>…</colgroup>]<tbody><tr><th [colspan] [rowspan] [scope]><p>…</p></th>…</tr></tbody></table>`; `colgroup` só se alguma coluna da 1ª linha tiver largura (N 1–9999) | `colwidth` do atributo `colwidth` (formato Tiptap) ou do `col` da coluna (índice somando `colspan`), por `style="width: Npx"` ou `width`; `colspan`/`rowspan` pela regra `int` 1–100, senão 1; `scope` só `col`/`row`; `style`/`align` descartados. `caption` e `thead` não são produzidos (exceção da cobertura, seção 7.3); o texto de um `caption` colado é **descartado** (`ignore`: a regra não pode mutar o DOM de entrada; ADR 0004) |
| tasks | `rtTaskList`, `rtTaskItem` | próprias (B11) | `<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" [checked=""]>Texto</label></li></ul>` | `ul.rt-tasks` e `ul[data-type="taskList"]` (prioridade 60); `li.rt-task` (conteúdo = o `li`, com o `label` como invólucro inline transparente e o `input` descartado), `li` dentro de `rtTaskList`, `li[data-type="taskItem"]` (conteúdo = o único `p` do `div`, senão o `div`; blocos extras e subtarefas saem da lista, sem perder texto); um `p` dentro do item só vira o texto da tarefa se antes dele houver apenas espaço, comentário ou `label`/`input` vazios, senão sai da lista como parágrafo (não junta palavras); `checked` de `data-checked` (`true`/vazio) ou do `input[checked]` |
| media | `rtImage` (atômico, arrastável) | própria + NodeView (B17) | `<figure class="rt-figure rt-figure--<align>"><img src alt [width] [height] loading="lazy" decoding="async" [srcset] [sizes]>[<figcaption>[legenda][ ][<small class="rt-credit">crédito</small>]</figcaption>]</figure>` | `figure.rt-figure` com `img`, `figure` com `img`, `img[src]` solto e **`p` cujo único filho significativo é `img`** (prioridade 60: não sobra parágrafo vazio, lição 18); `align` pela classe, senão `center`; legenda = texto do `figcaption` sem o `small.rt-credit`, espaços colapsados; crédito = texto do primeiro `small.rt-credit` |
| media | `rtVideo` (atômico) | própria | `<figure class="rt-figure rt-figure--video"><video src controls="" preload="metadata\|none" playsinline="" [width] [height] [poster]>[<track kind src srclang label [default=""]>…]</video>[<figcaption>…</figcaption>]</figure>` | `figure` com `video`, `video[src]` ou `video > source[src]` (primeiro válido); `track` inválido é descartado; no máximo um `default` (o primeiro) |
| embeds | `rtEmbed` (atômico; só com provedor ativo) | própria | `<figure class="rt-embed rt-embed--<id>" data-rt-provider="<id>"><iframe src title width height [style="aspect-ratio: A / B"] loading="lazy" referrerpolicy="…" allow="…" allowfullscreen="" sandbox="…"></iframe>[<figcaption>legenda</figcaption>]</figure>` (valores fixos da 03a §4.8) | `figure.rt-embed` e `iframe[src]` solto: `src` aceito pela regra do `iframe` do esquema (provedor = o primeiro cujo `srcPattern` casa) ou convertido por `toEmbed(src, providers)`; senão descartado. `title` (≤ 300, cortado) ou o `name` do provedor; `width`/`height` válidos ou 640 × altura pela proporção (16 / 9 sem proporção), altura grampeada em 1–10000; `srcdoc` nunca é lido. `www.youtube-nocookie.com/embed/ID` é aceito pelo YouTube e sai com o `src` canônico (sem `autoplay` etc.); `iframe` de `/embed/` e URL de página do mesmo provedor dão a mesma saída (altura e proporção do `toEmbed`). Na renderização, `aspectRatio` ausente no JSON cai para a proporção do provedor (ponto fixo da releitura) |
| newsBlocks | `rtPullquote` (conteúdo `paragraph+`) | própria | `<figure class="rt-pullquote"><blockquote><p>…</p></blockquote>[<figcaption><cite>Autor</cite>, cargo</figcaption>]</figure>` (só autor: sem `, cargo`; só cargo: `<figcaption>cargo</figcaption>`) | `figure.rt-pullquote` (prioridade 60, conteúdo = `blockquote`); autor = texto de `figcaption > cite`; cargo = resto do `figcaption`, sem a vírgula inicial |
| newsBlocks | `rtCallout` + `rtCalloutTitle` (conteúdo `rtCalloutTitle (paragraph \| bulletList \| orderedList)+`) | próprias (B12) | `<aside class="rt-callout rt-callout--<variante>" role="note"><p class="rt-callout__title">Título</p>…</aside>` | `aside.rt-callout` (variante pela classe, senão `info`); título = `p.rt-callout__title` no contexto `rtCallout/`; sem título → sintetizado **vazio** (por clones dos filhos, sem mutar a entrada) e preenchido com `labels.calloutTitles[variante]` na serialização |
| newsBlocks | `rtReadAlso` + `rtReadAlsoTitle` + `rtReadAlsoList` + `rtReadAlsoItem` (conteúdo `rtReadAlsoTitle rtReadAlsoList`; item `inline*`) | próprias | `<aside class="rt-read-also" role="note"><p class="rt-read-also__title">Leia também</p><ul><li><a href="…">…</a></li></ul></aside>` | `aside.rt-read-also`; `ul`/`li` por contexto (`rtReadAlso/`, `rtReadAlsoList/`); `li > p` único vira o conteúdo do item (o item exige `li` não-tarefa com conteúdo inline ou um `p`); sem título → sintetizado **vazio** e preenchido com `labels.readAlsoTitle` na serialização |
| newsBlocks | `rtLang` (marca) | própria | `<span lang="<tag>" [dir="ltr\|rtl"]>` | `span[lang]` pela regra `lang` do esquema; `dir` só `ltr`/`rtl` (minúsculas) |
| todos | `undoRedo`, `dropCursor`, `gapCursor` (nomes reais do Tiptap 3.31.4) | `@tiptap/extensions` | — | — |

Regras gerais:
- **Texto alternativo e limites:** `alt` ausente → nó com `alt: null` (a spec 05 distingue "não informado" na sessão) e saída `alt=""`; `alt` acima de 1000, `title` do `iframe` acima de 300 e `label` de `track` acima de 100 são cortados no limite (sem partir par substituto), para o sanitizador não descartar o atributo.
- **Atributos de URL** (`img[src]`, `srcset`, `video[src]`, `poster`, `track[src]`): regra de mídia do esquema (respeita `allowRelativeMedia` e `mediaHosts`); `srcset`/`sizes` por `normalizeAttribute`. Mídia sem `src` válido não vira nó (o texto da legenda fica como parágrafo).
- **Inserção (lição 14):** os comandos de mídia substituem o parágrafo vazio onde está o cursor, em vez de inserir depois dele.
- **Editor sem montar e conteúdo JSON:** a renderização revalida tudo (B9); link inválido sai como `<a>` sem `href` (inerte).
- **Links no JSON:** um `appendTransaction` restrito às faixas alteradas guarda o `href` **canônico** de `getLinkAttributes` (autolink, colagem, `toggleLink`); um `href` perigoso ou inválido vindo de JSON **perde a marca** na primeira transação que passa pela faixa (o `<a>` inerte acima só aparece sem transação: conteúdo inicial, SSR). O mesmo mecanismo grava `codeBlock.language` sempre canônica.

## 5. Serialização canônica (`serializeRteHtml`)

1. `DOMSerializer.fromSchema(schema).serializeFragment(doc.content, { document: stringDocument })`; durante a chamada, o "documento de renderização" das extensões (B11) é o de strings; fora dela, `globalThis.document`.
2. Escrita pelo algoritmo de serialização do HTML: elementos vazios (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`) sem fechamento e sem `/`; atributos na ordem em que a renderização os definiu; texto escapa `&`, `<`, `>` e U+00A0 (`&nbsp;`); atributos escapam `&`, `"`, `<`, `>` e U+00A0. Elemento devolvido como nó de DOM real por extensão do consumidor é escrito pelo `outerHTML`, se existir; senão lança `TypeError`. Texto e atributos passam antes pelo pré-processamento da entrada do HTML (CR e CRLF → LF, NUL → U+FFFD), como a releitura faria; sem isso um CR em bloco de código não seria ponto fixo. O texto de `script`/`style` também é escapado (nenhum dos dois está no contrato).
3. **Normalizações de saída** (as únicas): (a) cada `h2`–`h4`, em ordem de documento, recebe `id` (primeiro atributo) de `createHeadingIds({ prefix: idPrefix })` aplicado ao texto do título, substituindo qualquer `id`; (b) `p.rt-callout__title` vazio recebe o rótulo da variante e `p.rt-read-also__title` vazio recebe `labels.readAlsoTitle`.
4. Decorações (realce de código, seleção) nunca entram: o serializador lê o documento, não a vista.
5. **Leitura:** a fábrica instala um `RteDOMParser` em `schema.cached.domParser` (o cache de `DOMParser.fromSchema`, API pública do ProseMirror), por onde passam `setContent`, `insertContent` e a colagem; ele tira o espaço ASCII inicial do 1º texto de um bloco nascido da divisão do pai (`<p>a <img> b</p>` → `<p>b</p>`), para a saída ser ponto fixo. Com `preserveWhitespace` o corte não roda, e um `clipboardParser`/`domParser` próprio do consumidor (`editorProps`) **pula** o corte.

`getRteHtml(editor)` = `serializeRteHtml(editor.state.doc, { idPrefix, labels })` com os valores guardados pela fábrica no armazenamento `editor.storage.rtContent`; lança `TypeError` se o editor não foi criado com `createEditorExtensions`. `editor.getHTML()` continua disponível e é **aceito** pelo esquema (seção 7.2), mas não é canônico (sem ids; `style` no formato do CSSOM do motor).

## 6. API

```ts
// @cds/rte-core/extensions
import type { AnyExtension, Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

type RteCalloutVariant = 'info' | 'success' | 'warning' | 'danger';
type RteImageAlign = 'left' | 'center' | 'right' | 'full';

interface RteContentLabels {
  calloutTitles: Record<RteCalloutVariant, string>;
  readAlsoTitle: string;
  /** Nome acessível do checkbox da tarefa na vista do editor. */
  taskCheckbox(text: string): string;
}
/** Pacotes: pt-BR (Informação, Sucesso, Atenção, Perigo; "Leia também"; "Tarefa: <texto>"),
 *  en (Information, Success, Warning, Danger; "Read also"; "Task: <text>"),
 *  es (Información, Éxito, Atención, Peligro; "Lee también"; "Tarea: <texto>"). Padrão: en (fallback da spec 05). */
const RTE_CONTENT_LABELS: Readonly<Record<'pt-BR' | 'en' | 'es', RteContentLabels>>;

interface RteEditorOptions extends RteHtmlSchemaOptions {   // features, embedProviders, idPrefix, mediaHosts, allowRelativeMedia
  linkPolicy?: Partial<RteLinkPolicy>;                       // superconjunto do linkPolicy do esquema
  codeLanguages?: readonly RteCodeLanguage[];                // padrão [] (sem realce)
  labels?: Partial<RteContentLabels> | (() => Partial<RteContentLabels>); // lido a cada uso (lição 4)
  image?: { minWidth?: number };                             // padrão 48 (computeResize)
  extensions?: readonly AnyExtension[];                      // do consumidor, no fim da lista
}
function createEditorExtensions(options?: RteEditorOptions): AnyExtension[];
function getRteHtml(editor: Editor): string;
function serializeRteHtml(doc: ProseMirrorNode, options?: {
  idPrefix?: string;                                         // padrão 'rt-'
  labels?: Partial<RteContentLabels> | (() => Partial<RteContentLabels>);
}): string;
function getRteHeadings(doc: ProseMirrorNode, options?: { idPrefix?: string }):
  { pos: number; level: 2 | 3 | 4; text: string; id: string }[];  // mesma função dos ids da seção 5

// @cds/rte-core/code-languages
import type { LanguageFn } from 'highlight.js';
interface RteCodeLanguage {
  readonly id: string;            // vira language-<id>; casa ^[a-z0-9][a-z0-9+#-]{0,29}$
  readonly name: string;          // rótulo para a UI
  readonly aliases: readonly string[];
  load(): Promise<LanguageFn>;    // import('highlight.js/lib/languages/<x>')
}
const RTE_CODE_LANGUAGES: readonly RteCodeLanguage[]; // congelado, 24 linguagens
function defineCodeLanguage(language: RteCodeLanguage): RteCodeLanguage; // valida id e aliases; lança TypeError

// @cds/rte-core (entry `.`)
function isAllowedClass(spec: RteElementSpec, token: string): boolean; // classes.values ou classes.patterns

// @cds/rte-core/html
type RteHtmlViolation = { kind:
  | 'unknown-element' | 'unknown-attribute' | 'invalid-attribute' | 'non-canonical-attribute'
  | 'missing-required-attribute' | 'invalid-class' | 'invalid-style' | 'missing-ensured-token'
  | 'missing-required-child' | 'unexpected-node' | 'max-depth';
  tag: string; name?: string; value?: string; path: string };
function validateHtml(html: string, schema: RteHtmlSchema, options?: {
  mode?: 'canonical' | 'accepted';  // padrão 'canonical'
  maxDepth?: number;                // padrão 256
}): RteHtmlViolation[];
```

- **Fábrica.** Monta `schema = getHtmlSchema(options)` uma vez (lança como ele, para opções inválidas) e o guarda, com `idPrefix` e o resolvedor de rótulos, na extensão interna `rtContent` (`editor.storage.rtContent`). `RteHtmlSchemaOptions.embedProviders` e `mediaHosts` passam a aceitar `readonly` (alargamento compatível). `features.search`/`slashCommands` são aceitos e ignorados até a 03c. Lista e ordem: `rtContent`, `doc`, `paragraph`, `text`, `heading`, `blockquote`, `horizontalRule`, `hardBreak`, `bulletList`, `orderedList`, `listItem`, `listKeymap`, `textAlign`, `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`, `link`, `undoRedo`, `dropCursor`, `gapCursor`; depois, por recurso ligado: colors (`rtTextColor`, `rtHighlight`), code (`codeBlock`), tables (4), tasks (2), media (`rtImage`, `rtVideo`), embeds (`rtEmbed`, só com provedor ativo), newsBlocks (7 nós + `rtLang`); por fim `options.extensions`. Nome repetido (entre as nossas e as do consumidor) lança `TypeError`.
- **`validateHtml`.** Sem DOM, só leitura do esquema (`Object.hasOwn` em toda busca). `canonical`: cada atributo é igual a `normalizeAttribute(regra, valor)` (booleano = `''`); `style` igual a `applyStyleFrom` (com `styleFrom`) ou a `sanitizeStyle(styles, style)` e não vazio. `accepted`: valores só precisam ser aceitos; `style` com `styleFrom` é ignorado (é regenerado) e, sem `styleFrom`, nenhuma declaração pode ser descartada. Os dois modos conferem obrigatórios, classes, `ensureTokens` e `requireChild`. Comentário, `doctype` e texto em `script`/`style` são `unexpected-node`.
- **Comandos** (tipados por *module augmentation* do `@tiptap/core`; só existem com o recurso ligado; devolvem `false` para entrada inválida): `setLink({ href, target? })` (normaliza por `getLinkAttributes`) e `unsetLink`; `setTextColor(name)`, `unsetTextColor`, `setHighlight(name)`, `unsetHighlight`; `setCodeBlock`/`toggleCodeBlock({ language? })` e `setCodeBlockLanguage(id | null)`; os de tabela do `@tiptap/extension-table`; `toggleTaskList`, `toggleTaskItemChecked`; `setImage(attrs)`, `updateImage(attrs)`, `setImageSize({ width })` (altura pela proporção), `setImageAlign(align)`; `setVideo(attrs)`, `updateVideo(attrs)`; `setEmbed(url, { caption? })` (via `toEmbed` com os provedores ativos), `updateEmbed({ caption })`; `setPullquote({ author?, role? })`, `updatePullquote`, `unsetPullquote`; `setCallout(variant)` (título = rótulo atual da variante), `setCalloutVariant(variant)` (troca também o título se ele for o rótulo padrão da variante anterior), `unsetCallout` (título igual a rótulo padrão é descartado; outro vira parágrafo); `insertReadAlso()` (título + um item vazio, cursor no item); `setLang({ lang, dir? })`, `unsetLang`.
- **Teclado (fora os oficiais):** em `rtTaskItem` e `rtReadAlsoItem`, `Enter` divide (tarefa nova desmarcada); `Enter` no **início** de um item com texto insere um item vazio com os atributos padrão **antes**, e o item atual (marcado ou não) continua com o cursor; `Enter` em item vazio sai da lista para um parágrafo (no fim, depois dela; no meio, **divide** a lista com o parágrafo entre as partes); `Backspace` no início transforma o item em parágrafo (dividindo a lista se preciso). No "Leia também", cujo `aside` só aceita título + lista, essas saídas **dividem a caixa**: a parte de antes fica com o título, a de depois ganha título vazio (preenchido na serialização) e o parágrafo fica entre as duas; sem itens restantes, um título editado vira parágrafo e o igual ao rótulo padrão some (opção `splitContainer` do teclado de item, ligada só no "Leia também"); `Mod-Enter` alterna a tarefa; `Tab` não é capturado em lugar nenhum, inclusive no bloco de código (`enableTabIndentation: false`: sem armadilha de teclado, WCAG 2.1.2); `Enter` no fim de um título de caixa vai para o primeiro bloco da caixa.
- **NodeViews (só DOM, criados pela `EditorView`):** `rtTaskItem` → `<li class="rt-task" data-checked><span contenteditable="false" class="rte-task__check"><input type="checkbox" aria-label="…"></span><span class="rte-task__text">[conteúdo]</span></li>`, checkbox habilitado só com o editor editável, `aria-label` = `labels.taskCheckbox(texto)` atualizado a cada mudança, `mousedown` sem roubar a seleção. `rtImage` → figura com `img`, legenda e 4 alças `<span class="rte-image__handle rte-image__handle--nw|ne|sw|se" aria-hidden="true">`, classe `rte-image--selected` quando o nó está selecionado. Classes `rte-*` são da UI (o CSS é da spec 05); nenhum NodeView usa `innerHTML`.
- **Redimensionamento:** `pointerdown` (botão primário) numa alça → `preventDefault`, `setPointerCapture` se existir, guarda início, tamanho (atributos ou, sem eles, o tamanho exibido) e a escala `largura do atributo ÷ largura exibida`; `pointermove` → `computeResize` com `dx`/`dy` convertidos pela escala, `minWidth` da opção e `maxWidth` = largura da área do editor × escala (teto 10000), aplicado como prévia nos atributos `width`/`height` do `img`; `pointerup` → **uma** transação `setNodeMarkup` (um passo de desfazer); `pointercancel` ou `Escape` → restaura sem transação. `stopEvent` devolve `true` para eventos das alças; `ignoreMutation` devolve `true`; `destroy` remove os ouvintes.
- **Realce:** o plugin recalcula as decorações dos blocos de código alterados e de todos quando uma linguagem termina de carregar (transação só com *meta*, `addToHistory: false`); ao ver uma linguagem do catálogo ainda não registrada no documento (carga inicial ou mudança), chama `load()` uma vez, registra o `id` e os aliases no `lowlight` do editor e ignora falha de carga (sem novas tentativas); nada roda depois de `destroy`. Catálogo padrão (`id` · gramática do `highlight.js`): bash, c, cpp, csharp, css, diff, go, graphql, html (`xml`), java, javascript, json, kotlin, markdown, php, python, ruby, rust, scss, shell, sql, swift, typescript, yaml; aliases: `sh`→bash, `c++`→cpp, `cs`→csharp, `golang`→go, `xml`/`xhtml`→html, `js`/`jsx`/`mjs`→javascript, `kt`→kotlin, `md`→markdown, `py`→python, `rb`→ruby, `rs`→rust, `ts`/`tsx`→typescript, `yml`→yaml.

## 7. Testes

### 7.1 Ambiente
- Vitest: o `vitest.config.mts` do core inclui `extensions/src` e `code-languages/src`; arquivos de editor começam com `// @vitest-environment jsdom`. O ajudante `extensions/src/testing/editor.ts` (fora do build) monta o editor num `div` do `document.body` e supre o que falta no jsdom 27.4 (`Range.prototype.getClientRects`/`getBoundingClientRect`, `document.elementFromPoint`; `setPointerCapture` é opcional no NodeView).
- `tsconfig.lib.json`/`tsconfig.spec.json`, `tsup.config.ts`, `package.json` (`exports["./extensions"]`, peers), `tsconfig.base.json` (alias `@cds/rte-core/extensions`) e o `@nx/dependency-checks` do core (sai a exceção "peers ainda sem uso") são atualizados.

### 7.2 Contrato (lição 9)
1. Editor com `createEditorExtensions()` (tudo ligado, provedores padrão, `codeLanguages: RTE_CODE_LANGUAGES`); `setContent(all-features.html)`; `getRteHtml(editor)` **é igual byte a byte** ao arquivo (ponto fixo).
2. `validateHtml(saída, getHtmlSchema(), { mode: 'canonical' })` devolve `[]`; ids de título únicos.
3. `validateHtml(editor.getHTML(), schema, { mode: 'accepted' })` devolve `[]` (quem usa `getHTML()` produz HTML aceito pelo sanitizador; só faltam os ids).
4. **Mutação** (prova que o teste falha): para cada caso, a lista da fábrica com **uma** extensão trocada por `.extend()` produz ao menos uma violação do tipo esperado e quebra o item 1 — atributo novo em `paragraph` (`unknown-attribute`), classe `rt-desconhecida` em `rtCallout` (`invalid-class`), `heading` renderizando `h5` (`unknown-element`), `rtTextColor` com `style` de outra cor (`invalid-style`), `link` com `rel` fora da ordem canônica (`non-canonical-attribute`), `rtImage` sem `alt` (`missing-required-attribute`), `rtEmbed` sem `sandbox` (`missing-required-attribute`).
5. **Esquema mais restrito** (o sentido inverso): um esquema derivado sem `mark` (ou sem `col.styles.width`) acusa violação na saída do fixture.
6. **Recurso desligado:** para cada um de `colors`, `code`, `tables`, `tasks`, `media`, `embeds`, `newsBlocks`, o fixture carregado num editor com o recurso desligado sai sem violação contra `getHtmlSchema({ features: { [r]: false } })`; também com `idPrefix: 'doc-'`, com `embedProviders: []` e com um provedor do consumidor.
7. **JSON:** `editor.getJSON()` do fixture é gravado em `fixtures/content/all-features.json` e conferido (drift; regenerar com `UPDATE_FIXTURES=1 npx nx test core --skip-nx-cache`).

### 7.3 Cobertura do fixture
O conjunto de (tag), (tag, atributo), (tag, classe de `values`), (tag, propriedade de `styles`/`styleFrom`) e cada padrão de classe presentes na saída do fixture, **somado às exceções declaradas** (`caption`, `thead`), é **igual** ao do `getHtmlSchema()` padrão. Esquema que cresce sem fixture, ou fixture com algo fora do esquema, falha. O fixture contém no mínimo: os 3 níveis de título com os 4 alinhamentos distribuídos, título repetido (sufixo `-2`) e título vazio; todas as marcas; links `https` com e sem `target`, `mailto:`, `tel:`, relativo e fragmento; as 8 cores de texto e as 6 de marca-texto; `span` com cor e `lang` juntos (saem como `span` aninhados, cor por fora) e `lang` com `dir`; código com e sem linguagem; tabela com cabeçalho e `scope`, `colspan`, `rowspan` e largura de coluna; tarefas marcada e desmarcada; imagem nos 4 alinhamentos, com e sem legenda/crédito, com `srcset`/`sizes`, sem `width`/`height` e decorativa; vídeo com `poster` e duas `track` (uma `default`); embeds de YouTube (16 / 9 e Shorts 9 / 16), Vimeo e Spotify (sem `aspect-ratio`) com e sem legenda; citação em destaque com autor e cargo, só autor e só cargo; as 4 caixas; "Leia também" com dois links; `ol start`, `hr`, `br`, `blockquote`, lista aninhada; texto com `&`, `<`, `"` e espaço não separável.

### 7.4 Leitura tolerante (A1)
`fixtures/content/tolerant-cases.json` (`{ name, input, expected }[]`, saída canônica com opções padrão) cobre no mínimo: `h1`→`h2` com id; `h5`/`h6`→`h4`; `<p><img></p>` e `<p> <img> </p>` sem parágrafo vazio; `p` com texto e `img` (divide); `img` sem `alt`; `<a href>` sem `target` continua sem `target` (lição 10); `href="site.com"` normalizado para `https://site.com/`; `javascript:`/`data:` em `href`/`src` descartados (texto fica); `target="_BLANK"` com `rel` garantido; tarefas no formato do Tiptap (inclusive aninhadas e com dois parágrafos); `<mark data-color="#ff0">` → `yellow`; `<span style="color: red">` → sem cor; `data-rt-color` com `style` falso → `style` regenerado; `language-js` → `language-javascript` (com catálogo) e mantido como `js` (sem catálogo); `<ol start="0" type="a">` → `<ol>`; tabela do Tiptap (`style`, `colwidth`, `col` com `min-width`); `iframe` do YouTube `www.youtube.com/embed/ID` → embed `nocookie`; `iframe` de host desconhecido e com `srcdoc` → descartados; `id` colado em título → recalculado; `text-align: start` → sem estilo; `figure` genérica com `figcaption`; caixa sem título → título sintetizado; "Leia também" com `li > p`; `video > source`; `<b style="font-weight:normal">` do Google Docs. Os mesmos casos rodam no Vitest e no Playwright (seção 7.6).

### 7.5 Unitários e propriedade
- Fábrica: lista e ordem por recurso; `TypeError` para nome repetido; opções inválidas lançam como `getHtmlSchema`; rótulos por função lidos a cada inserção sem recriar extensões (lição 4); nenhuma extensão muda o próprio `options`.
- Serializador: escapes, elementos vazios, ordem de atributos, ids (sufixos, fallback `section`, corte em 80, prefixo), títulos vazios de caixa, igualdade com o `editor.getHTML()` do jsdom após normalizar `style` (via `sanitizeStyle`/`applyStyleFrom`) e ignorar ids.
- Comandos, teclado das tarefas e do "Leia também", lição 14 (substitui parágrafo vazio), `setImageSize` mantendo a proporção.
- NodeViews no jsdom: estrutura, `update`, `aria-label`, checkbox desabilitado sem edição, arrasto simulado com `PointerEvent` (uma transação, `Escape` cancela).
- Realce: com catálogo de teste (gramáticas carregadas por `load()` falso), decorações aparecem depois do `load`, linguagem desconhecida não chama `highlightAuto`, falha de `load` não lança, `getRteHtml` nunca contém `hljs`.
- **fast-check:** (a) documentos JSON gerados com atributos arbitrários (inclusive `javascript:`, `data:`, `vbscript:`, ofuscados com maiúsculas, TAB/LF, `\`, `//`) → a saída nunca contém esses esquemas em `href`/`src`/`srcset`/`poster`, e as únicas violações `accepted` possíveis são `missing-required-attribute` em atributo de URL (elemento inerte); (b) `serializeRteHtml(parse(serializeRteHtml(doc)))` igual a `serializeRteHtml(doc)` (idempotência).
- `/code-languages`: ids e aliases casam o padrão, sem colisão; catálogo congelado; o módulo não importa gramática no topo.
- SSR (`extensions/src/ssr.spec.ts`, ambiente `node`, sem `window`/`document`): importar `/extensions` e `/code-languages`, `createEditorExtensions()`, `new Editor({ element: null, content: all-features.json })` e `serializeRteHtml(editor.state.doc)` igual a `all-features.html`.

### 7.6 Navegador real (Playwright, Chromium, Firefox e WebKit)
Harness `e2e/core/helpers/editor-bundle.ts` (esbuild IIFE `window.RteEditorLab` com `Editor`, `createEditorExtensions`, `getRteHtml`, `validateHtml`, `getHtmlSchema`, `RTE_CODE_LANGUAGES`), página com CSS mínimo de teste para as alças; requisições externas (iframes dos embeds) abortadas por `page.route`. Em `e2e/core/editor-*.spec.ts`:
- **E1 contrato:** fixture carregado → `getRteHtml` igual ao arquivo; `validateHtml(editor.getHTML(), schema, { mode: 'accepted' })` vazio (CSSOM real de cada motor); árvore DOM de `getRteHtml` igual à de `editor.getHTML()` após normalizar `style` e ignorar ids.
- **E2 colagem tolerante:** cada caso de `tolerant-cases.json` por `view.pasteHTML(input)` num documento vazio → `expected`.
- **E3 redimensionamento:** arrastar cada um dos 4 cantos com o mouse muda `width`/`height` mantendo a proporção (±1 px); limite `minWidth`; `Escape` no meio do arrasto cancela; um `undo` restaura o tamanho anterior (lição 17: rolar até a alça e esperar o foco).
- **E4 tarefas:** clicar e usar `Space` no checkbox alternam `checked=""` na saída; `Enter`, `Enter` em item vazio e `Backspace` no início se comportam como a seção 6; `aria-label` presente.
- **E5 realce:** bloco `language-javascript` ganha decorações `hljs-*` depois da carga sob demanda; `getRteHtml` sem `hljs`.
- **E6 links e títulos:** digitar `site.com ` cria `<a href="https://site.com/">` sem `target`; `getRteHtml` logo após criar o editor já traz os ids (lição 10).

Achados da execução: Chromium e WebKit movem o `style` para o **fim** dos atributos quando o `getHTML()` do Tiptap adota os nós num documento novo (o Firefox mantém a posição); o `normalizeForCompare` do E1 recoloca o `style` como último atributo. No Firefox, `Tab` parte do cursor: com o cursor no texto de uma tarefa, pula o checkbox desse item (antes no DOM) e `Shift+Tab` o alcança; o E4 começa num parágrafo antes da lista e confere os dois sentidos (nota para a spec 05).

## 8. Requisitos

- **R1. Correção herdada da 03a (primeira tarefa).** Em `packages/core/src/embeds/validate-provider.ts`, um `srcPattern` cujo caractere logo depois do prefixo `^https://<host escapado>/` seja `?`, `*`, `+` ou `{` é recusado (quantificador ali torna a `/` opcional ou repetível e `^https://a\.com/?.*$` aceitaria `https://a.com.outro-provedor.net/x`, desfazendo o pareamento host × padrão na união do `iframe`). Testes: `/?`, `/{0}`, `/*` e `/+` recusados em `getHtmlSchema` (lança) e em `toEmbed` (provedor ignorado). Atualizar o comentário de `schema/features.ts`, a 03a §6 e a decisão 14 do ADR 0003 ("… + `/`, sem quantificador logo depois").
- **R2.** Entry `/extensions` com a API da seção 6; `.`, `/embeds` e `/html` sem Tiptap (lint, B1); `sideEffects: false` mantido.
- **R3.** Dependências como B2–B5: peers opcionais no core, devDependencies exatas na raiz, `check:licenses` e `notices` verdes (peers fora dos avisos, decisão 10 do ADR 0003).
- **R4.** A saída de cada recurso é a da seção 4, byte a byte, e o fixture é ponto fixo de `getRteHtml` (seção 7.2).
- **R5.** Serialização como a seção 5: sem DOM, igual em Node, jsdom e nos 3 motores; `editor.getHTML()` aceito pelo esquema.
- **R6.** Ids de título sempre presentes, únicos e válidos pela regra do esquema, inclusive na carga inicial e sem montar o editor (lição 10).
- **R7.** Leitura tolerante da seção 7.4, inclusive por colagem em navegador real.
- **R8.** Toda validação de atributo usa o esquema montado pela fábrica ou as funções da 03a (`normalizeAttribute`, `isAllowedUrl`, `getLinkAttributes`, `toEmbed`, `isAllowedClass`); nenhuma lista paralela de tags, atributos, classes ou estilos.
- **R9.** Links: política do editor (`protocols`, `allowRelative`, `defaultRel`, `forceRel`, `blockedDomains`, `target`) aplicada na leitura, nos comandos, no autolink e na renderização; `<a>` sem `target` nunca ganha `target`.
- **R10.** Realce sob demanda (B15): nenhuma gramática no bundle do `/extensions` nem no topo do `/code-languages`; decorações nunca serializadas.
- **R11.** NodeView de imagem e de tarefa como a seção 6, só DOM, sem `innerHTML`, sem acesso a DOM no topo dos módulos.
- **R12.** Fábrica (B18): uma fonte da lista; recursos desligados não registram nós, marcas nem comandos; valores dinâmicos por função.
- **R13.** Contrato, mutação, cobertura e recursos desligados como 7.2 e 7.3; `validateHtml` e `isAllowedClass` públicos e testados.
- **R14.** Segurança: nenhum `javascript:`/`data:` chega a atributo de URL por leitura, comando ou JSON (propriedade); `iframe` só com os valores fixos da 03a; `srcdoc` nunca lido; nenhum `innerHTML` em `extensions/src` (regra de lint `no-restricted-syntax`).
- **R15.** SSR: importar `/extensions` e `/code-languages` e serializar a partir de JSON funciona em Node sem DOM (7.5); `.` continua passando o `ssr.spec.ts` atual.
- **R16.** Orçamento: `tools/check-size.mjs` aceita `external` por cenário (com testes em `check-size.test.mjs`); cenários novos `extensions` (`dist/extensions/index.js`, `*`, externos `@tiptap/*`, `lowlight`, `highlight.js`, `highlight.js/*`) e `code-languages` (`*`), e `html` remedido com o `validateHtml`; orçamento = medido + cerca de 16% na primeira medição (regra do ADR 0003); o tamanho com Tiptap incluído é medido e registrado no ADR 0004 (informativo). Medido (min+gzip): `extensions` 26123 B (orçamento 30080), `code-languages` 34511 B (39744; pior caso, com as 24 gramáticas embutidas pelo esbuild), `html` 31018 B (35712), `embeds` 2912 B (3392, recalculado pela fórmula depois do validador de provedor); `extensions` sem externos: 512904 B min, 165672 B gzip.
- **R17.** Verificação em navegador real E1–E6 nos 3 motores.

## 9. Critérios de aceite

- [x] R1 feito primeiro, com testes, e 03a §6, ADR 0003 (decisão 14) e o comentário de `features.ts` corrigidos. _Evidência: `e059e35` é o 1º commit da execução (testes em `to-embed.spec.ts` e `get-html-schema.spec.ts`; `features.ts`, 03a e ADR 0003 no mesmo commit)._
- [x] `npx nx run-many -t lint,typecheck,build,test,verify-package` verde (publint/attw com o entry `/extensions`); `npm run check:rules`, `check:licenses`, `notices` sem drift, `test:tools` verdes. _Evidência (2026-10-03): `Successfully ran targets lint, typecheck, build, test, verify-package, size for 5 projects`; `check:rules` saída 0; `licenças ok`; `git diff --exit-code THIRD-PARTY-NOTICES.md` saída 0; `test:tools` `# pass 67 / # fail 0`._
- [x] Contrato 7.2 verde, inclusive os 7 casos de mutação e o esquema mais restrito; cobertura 7.3 verde; os 7 recursos desligados e as variações de opção verdes. _Evidência: `contract.spec.ts (26 tests)` e `coverage.spec.ts (2 tests)` verdes no `nx test core --skip-nx-cache` (`Tests 805 passed (805)`)._
- [x] `fixtures/content/all-features.html` é ponto fixo; `all-features.json` sem drift; `tolerant-cases.json` verde no Vitest. _Evidência: `contract.spec.ts` (ponto fixo e "editor.getJSON() do fixture está em dia") e `tolerant.spec.ts (67 tests)` verdes._
- [x] Propriedades fast-check (7.5) verdes; SSR do `/extensions` verde em `node`. _Evidência: `properties.spec.ts (2 tests)` e `extensions/src/ssr.spec.ts (2 tests)` verdes._
- [ ] E1–E6 verdes em Chromium, Firefox e WebKit (`npx playwright test -c e2e`) e no CI. _Local verde: `npx playwright test -c e2e --workers=4` → `295 passed`, `23 skipped` (embeds de rede sem `E2E_NETWORK` e pulos do tema). Uma 1ª rodada teve 1 falha de infraestrutura no Firefox (fechar o contexto estourou 30 s em `E2: h1 vira h2 com id`), que passou ao repetir o arquivo (33/33) e a suíte inteira. Falta a execução no CI (PR)._
- [ ] Orçamentos `extensions`, `code-languages` e `html` no `packages/core/size-budget.json`, verdes no CI. _Local verde (`nx run core:size`: `tamanhos (min+gzip) dentro do orçamento`; `extensions` 26123/30080, `code-languages` 34511/39744, `html` 31018/35712). Falta a execução no CI (PR)._
- [x] ADR 0004 registra B1–B23, os números medidos e os desvios; README do core documenta o `/extensions` (instalação dos peers na mesma versão, `getRteHtml` × `getHTML()`, id muda com o texto do título, legenda em texto puro), o `/code-languages` e o `validateHtml`; CLAUDE.md ganha o comando `UPDATE_FIXTURES=1` e a pasta `fixtures/content/`. _Evidência: `docs/decisions/0004-extensoes-de-conteudo.md`, `packages/core/README.md` e `CLAUDE.md` neste commit._
- [x] `docs/html-schema.md` sem drift (a 03b não muda o esquema). _Evidência: `markdown.spec.ts (4 tests)` verde e `git diff 9ae5d99 HEAD -- docs/html-schema.md` vazio._

## 10. Consequências para as specs seguintes

- **04:** consome `fixtures/content/all-features.html` ("atravessa o sanitizador sem perda" = `sanitize(fixture) === fixture`) e `validateHtml`; constrói o filtro de classes sobre `isAllowedClass`; continua dona dos interpretadores que transformam.
- **05:** `value` = `getRteHtml(editor)`; importa `/extensions` por `import()` (lição 8); declara os peers de B2 como obrigatórios; repassa `features`, `extensions`, `linkPolicy`, provedores e rótulos (`RTE_LABELS` compõe `RTE_CONTENT_LABELS`); cria o `Editor` com `injectCSS: false` (CSP); fornece o CSS das alças, das tarefas e das classes `hljs-*`; o campo de largura nos detalhes da imagem é a alternativa ao arrasto (WCAG 2.5.7); `format: 'json'` usa os nomes de B19 e `serializeRteHtml` no servidor.
- **06:** o mesmo fixture alimenta a comparação visual editor × página.
- **08:** matriz de CI com Tiptap 3.31.4 (mínimo) e o último 3.x, todos os `@tiptap/*` na mesma versão.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Atualização do Tiptap mudar `renderHTML`/`parseHTML` de uma extensão oficial estendida | Fixture ponto fixo e contrato no CI com o mínimo e o último 3.x (spec 08) |
| Consumidor com `@tiptap/*` em versões diferentes (peers exatos) | README com o comando de instalação na mesma versão; o npm falha alto (B3) em vez de duplicar o ProseMirror |
| Serializador próprio divergir da semântica do `DOMSerializer` | Ele **usa** o `DOMSerializer` (só troca o documento); E1 compara as árvores DOM nos 3 motores |
| Id de título mudar quando o texto muda e quebrar âncoras externas | Documentado; determinismo e segurança valem mais (B8) |
| `{ dom, contentDOM }` da tarefa depender do documento global fora do serializador | Só é chamado pelo `DOMSerializer` (serializador, `getHTML`, área de transferência) em navegador ou jsdom; testado nos três caminhos |
| jsdom sem layout (seleção, coordenadas, captura de ponteiro) | Ajudante com supressões mínimas; comportamento de layout só é aceito pelo E2E (lição 12) |
| Import dinâmico das gramáticas não virar *chunk* no bundler do consumidor | Medido no cenário `code-languages`; o app da spec 07 confere os *chunks* do Angular |
