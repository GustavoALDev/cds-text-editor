# @cds/rte-core

Núcleo do editor: extensões Tiptap, utilitários e esquema do HTML.

**Status: em construção.** Ainda sem versão publicada.

Instalação (nome provisório, escopo `@cds` ainda não confirmado): `npm i @cds/rte-core`

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

## Entry points

- `@cds/rte-core`: esquema do HTML, links, títulos, texto, imagem, rascunho e paleta (sem DOM, roda em Node/SSR).
- `@cds/rte-core/embeds`: `toEmbed` e os provedores padrão (YouTube, Vimeo, Spotify).
- `@cds/rte-core/html`: `htmlToText`, `extractToc` e `validateHtml` sem DOM (usa `htmlparser2`, cerca de 22 kB gzip; fora do entry `/` de propósito).
- `@cds/rte-core/extensions`: extensões Tiptap, `createEditorExtensions` e o serializador canônico (`getRteHtml`, `serializeRteHtml`). Exige os peers do Tiptap (ver abaixo).
- `@cds/rte-core/code-languages`: catálogo de linguagens de código com gramáticas do `highlight.js` carregadas sob demanda.

Os entries `.`, `/embeds` e `/html` não importam Tiptap: quem só usa o esquema ou o sanitizador no servidor não precisa instalar os peers.

## Esquema do HTML

`getHtmlSchema` devolve o contrato do HTML (tags, atributos, estilos) como dados congelados e serializáveis em JSON. O sanitizador e a renderização derivam tudo dele. A referência gerada fica em [`docs/html-schema.md`](../../docs/html-schema.md); a decisão, em [ADR 0003](../../docs/decisions/0003-esquema-do-html.md).

```ts
import { getHtmlSchema } from '@cds/rte-core';

const schema = getHtmlSchema({
  features: { tables: false },
  linkPolicy: { blockedDomains: ['evil.example'] },
});
schema.elements['a'].attributes['href']; // regra do href
```

`isAllowedClass(spec, token)` diz se uma classe é aceita por um elemento do esquema (`classes.values` ou `classes.patterns`):

```ts
import { getHtmlSchema, isAllowedClass } from '@cds/rte-core';

const code = getHtmlSchema().elements['code'];
isAllowedClass(code, 'language-javascript'); // true
isAllowedClass(code, 'hljs'); // false
```

### `validateHtml`

Confere um HTML contra o esquema, sem DOM, e devolve a lista de violações (vazia = conforme). O modo `canonical` (padrão) exige a forma exata que o editor produz; o modo `accepted` só exige valores aceitos (o que o sanitizador deixaria passar).

```ts
import { getHtmlSchema } from '@cds/rte-core';
import { validateHtml } from '@cds/rte-core/html';

validateHtml('<p class="x">a</p>', getHtmlSchema());
// [{ kind: 'invalid-class', tag: 'p', path: 'p[0]', name: 'class', value: 'x' }]
validateHtml(editor.getHTML(), getHtmlSchema(), { mode: 'accepted' }); // []
```

`validateHtml` só lê; os interpretadores que transformam o HTML ficam com o sanitizador (`@cds/rte-sanitizer`).

## Extensões do editor (`/extensions`)

### Instalação

O core declara o Tiptap como **peers opcionais**. Para usar o `/extensions`, instale todos os pacotes **na mesma versão** (as extensões do Tiptap exigem `@tiptap/core`/`@tiptap/pm` exatos; versões desencontradas falham na instalação em vez de duplicar o ProseMirror). Piso: 3.31.4.

```bash
npm i @tiptap/core@3.31.4 @tiptap/pm@3.31.4 @tiptap/extensions@3.31.4 \
  @tiptap/extension-document@3.31.4 @tiptap/extension-paragraph@3.31.4 @tiptap/extension-text@3.31.4 \
  @tiptap/extension-heading@3.31.4 @tiptap/extension-bold@3.31.4 @tiptap/extension-italic@3.31.4 \
  @tiptap/extension-underline@3.31.4 @tiptap/extension-strike@3.31.4 @tiptap/extension-code@3.31.4 \
  @tiptap/extension-subscript@3.31.4 @tiptap/extension-superscript@3.31.4 @tiptap/extension-blockquote@3.31.4 \
  @tiptap/extension-horizontal-rule@3.31.4 @tiptap/extension-hard-break@3.31.4 @tiptap/extension-list@3.31.4 \
  @tiptap/extension-text-align@3.31.4 @tiptap/extension-link@3.31.4 @tiptap/extension-code-block@3.31.4 \
  @tiptap/extension-table@3.31.4 lowlight@3.3.0 highlight.js@11.11.1
```

Não use `@tiptap/starter-kit` junto: ele fixa o `@tiptap/core` em `dependencies` e pode instalar uma segunda cópia do ProseMirror. O `@cds/rte-angular` (spec 05) declara esses peers como obrigatórios.

### Uso

```ts
import { Editor } from '@tiptap/core';
import {
  createEditorExtensions,
  getRteHtml,
  RTE_CONTENT_LABELS,
} from '@cds/rte-core/extensions';
import { RTE_CODE_LANGUAGES } from '@cds/rte-core/code-languages';

const editor = new Editor({
  element: host,
  extensions: createEditorExtensions({
    features: { embeds: false },
    linkPolicy: { forceRel: ['ugc'] },
    codeLanguages: RTE_CODE_LANGUAGES,
    labels: () => RTE_CONTENT_LABELS['pt-BR'], // lido a cada uso
  }),
  content: '<h1>Título</h1><p>Texto</p>',
});

getRteHtml(editor); // '<h2 id="rt-titulo">Título</h2><p>Texto</p>'
```

As opções são as de `getHtmlSchema` (`features`, `embedProviders`, `idPrefix`, `mediaHosts`, `allowRelativeMedia`) mais `linkPolicy`, `codeLanguages` (padrão `[]`: sem realce), `labels`, `image.minWidth` e `extensions` (do consumidor, no fim da lista; nome repetido lança `TypeError`). Recurso desligado não registra nós, marcas nem comandos.

### `getRteHtml` × `getHTML()`

- **`getRteHtml(editor)` é a saída oficial**: serializada sem DOM, igual byte a byte em Node, jsdom e nos navegadores, com ids de título e títulos de caixa preenchidos. `serializeRteHtml(doc, { idPrefix, labels })` faz o mesmo a partir de um documento (inclusive no servidor, de JSON, sem DOM).
- `editor.getHTML()` continua funcionando e é **aceito** pelo esquema, mas não é canônico: não tem ids de título, e o `style` sai no formato do CSSOM de cada navegador (`color: rgb(…);`, posição variável).

### Comportamentos a conhecer

- **O id do título muda com o texto.** Os ids (`rt-<slug>`, com sufixo `-2`, `-3`… para repetidos) são calculados na serialização a partir do texto dos títulos em ordem; ids colados são ignorados. Editar o texto de um título quebra âncoras externas para ele. `getRteHeadings(doc)` devolve os mesmos ids.
- **Legenda em texto puro.** Legenda e crédito de imagem/vídeo/embed e autor/cargo da citação são atributos de texto: formatação dentro deles não é preservada.
- **Links e linguagens canônicos no JSON.** O `href` guardado é sempre o canônico da política; um `href` perigoso vindo de JSON perde o link na primeira edição que passa por ele. O texto de `<caption>` de tabela colada é descartado.
- **Parser próprio.** A fábrica instala o parser do esquema com um ajuste de espaços; um `clipboardParser`/`domParser` próprio em `editorProps` pula esse ajuste.
- **CSS e CSP.** As extensões não trazem CSS. Criar o `Editor` com `injectCSS: false` (CSP) e fornecer o CSS das alças da imagem, das tarefas e das classes `hljs-*` fica com o `@cds/rte-angular` (spec 05).

### Produtividade: busca, comandos `/`, limite e placeholder

Quatro recursos sem UI (a interface é da spec 05). Nenhum chega ao HTML: tudo o que mostram são decorações, e `getRteHtml`/`getHTML()` não mudam. `rtPlaceholder` e `rtCharLimit` entram sempre; `rtSearch` e `rtSlashCommand` seguem `features.search` e `features.slashCommands` (padrão `true`). O estado sai de getters puros e congelados (`getSearchState`, `getSlashMenuState`, `getCharLimitState`), que funcionam em Node sem DOM.

**Busca e substituição.** Busca **literal** (sem expressão regular), `caseSensitive` e `wholeWord` (padrão `false`), sobre o texto de cada bloco de texto, atravessando marcas e sem cruzar blocos nem `hardBreak`. Fora da v1: atributos (legenda, crédito, `alt`, autor) e busca sem diacríticos. No máximo **1000** resultados indexados e decorados (`capped: true`); a consulta é cortada em 1000 unidades. Comandos: `setSearchQuery`, `setSearchOptions`, `clearSearch`, `nextSearchMatch`/`previousSearchMatch` (circulares, selecionam e rolam até o resultado sem focar o editor), `replaceSearchMatch` e `replaceAllSearchMatches` (sem teto, **um** passo de desfazer; o texto é literal e quebras de linha viram espaço fora de bloco de código). Com o editor não editável a substituição devolve `false`. O core não registra atalhos (`Mod-F`, `F3`). Em cadeia (`chain()`), os comandos de busca devolvem `false` quando a transação já tem busca ou mudou o documento: chame-os em sequência. Classes: `rte-search-match` e `rte-search-match--active`.

**Comandos `/`.** O menu abre **só quando um `/` é digitado** (não por colagem, `setContent` ou cursor movido), no início do bloco ou depois de espaço, em parágrafo e fora de código. Fecha por espaço na consulta, mais de 30 caracteres, cursor fora da faixa, `Escape` (o mesmo `/` não reabre) ou item executado. Com o menu aberto e itens: `ArrowDown`/`ArrowUp` circulares, `Enter` executa, `Escape` fecha; `Tab` não é capturado. A extensão tem `priority: 1000`. Executar apaga `/consulta` e roda o comando numa transação (um passo de desfazer). Itens sem comando (`image`, `video`, `embed`) chamam `slash.onUiItem(id, editor)`, de forma **síncrona dentro da atualização da vista** (plugin view do ProseMirror): se o `onUiItem` precisar despachar algo no editor, adie o despacho (por exemplo, `queueMicrotask(() => editor.commands.…)`); abrir um diálogo não precisa disso. Com o menu aberto e itens, o `Enter` é sempre consumido, mesmo que o comando do item falhe ao executar (o parágrafo nunca é dividido depois de a consulta ser apagada). Os itens embutidos somem quando o recurso está desligado ou o comando não roda ali; `slash.items` (lista ou função sobre os embutidos já filtrados) acrescenta ou troca itens, com `id` único (`^[a-z][a-zA-Z0-9-]{0,39}$`). Os rótulos vêm de `RTE_SLASH_LABELS` (pt-BR, en, es; padrão `en`) e `slash.labels` pode ser uma função, lida a cada uso; uma função que lança conta como ausente. Os itens `bulletList` e `orderedList` significam "transformar em lista" (somem dentro de lista do mesmo tipo) e o item `paragraph` nunca aparece. Classe: `rte-slash-query`.

**Desfazer depois de substituir ou de um comando `/`.** Substituir e executar um item `/` fecham o grupo do histórico antes (não se fundem com a digitação anterior), mas o que for digitado em até **500 ms** depois entra **no mesmo passo** de desfazer (o `newGroupDelay` do histórico do ProseMirror): um `Mod+Z` logo em seguida desfaz o comando e essa digitação juntos. O `/consulta` volta como antes.

**Limite de caracteres.** `charLimit` é um número, `null` ou uma função lida a cada verificação. Só a **entrada direta** é barrada quando aumentaria a contagem acima do limite: digitação fora de composição (recusada), colagem (cortada no maior prefixo que cabe) e soltar conteúdo externo (recusado). Conteúdo inicial, `setContent`, comandos, composição IME e arrasto interno **nunca** são barrados: o estado fica `overLimit` e o formulário invalida em vez de truncar em silêncio. Apagar é sempre permitido. Exemplo de IME: com o limite em 10 e 10 caracteres no texto, compor "日本語" com o método de entrada não é recusado nem desfeito; ao confirmar, `getCharLimitState(editor)` devolve `overLimit: true`. Exceção conhecida: uma autocorreção que chega como digitação e **aumenta** uma palavra exatamente no limite é recusada, como o `maxlength` nativo. `rejected` conta as entradas recusadas ou cortadas (para `aria-live`). `charLimit` estático inválido lança `RangeError`; o da função, inválido, vale como "sem limite".

**Contagem.** Caracteres = pontos de código do texto de `htmlToText(getRteHtml(editor))`, sem quebras de linha; palavras = `countWords` do mesmo texto. `getRteTextStats(doc)` calcula sem serializar, por bloco de topo, com igualdade provada por propriedade. No servidor, que só tem o HTML: `countCharacters(htmlToText(html))` (e `countWords(htmlToText(html))`) dá o mesmo número.

**Placeholder.** A opção `placeholder` (texto ou função, lida a cada atualização da vista) vira a decoração `rte-placeholder` com `data-placeholder` (mais `rte-placeholder--doc` no documento vazio) e `aria-placeholder` no elemento editável. Os títulos vazios de caixa e de "Leia também" mostram o rótulo que a serialização escreveria. Aparece também com o editor somente leitura; texto vazio desliga. O CSS das classes `rte-*` é do consumidor (por exemplo, `.rte-placeholder::before { content: attr(data-placeholder) }`).

Decisões, desvios e números: [ADR 0005](../../docs/decisions/0005-extensoes-de-produtividade.md) e a spec 03c.

Detalhes e decisões: [ADR 0004](../../docs/decisions/0004-extensoes-de-conteudo.md) e a spec 03b.

## Linguagens de código (`/code-languages`)

`RTE_CODE_LANGUAGES` lista 24 linguagens (congeladas). Cada uma carrega a gramática do `highlight.js` por `import()` só quando um bloco de código a usa; linguagem fora do catálogo fica sem realce (nunca há detecção automática). O realce é feito por decorações e nunca entra no HTML.

```ts
import {
  RTE_CODE_LANGUAGES,
  defineCodeLanguage,
} from '@cds/rte-core/code-languages';

const elixir = defineCodeLanguage({
  id: 'elixir',
  name: 'Elixir',
  aliases: ['ex'],
  load: () =>
    import('highlight.js/lib/languages/elixir').then((m) => m.default),
}); // lança TypeError para id ou alias inválido

createEditorExtensions({ codeLanguages: [...RTE_CODE_LANGUAGES, elixir] });
```

Num bundler com divisão de código, cada gramática vira um _chunk_ separado.

## Links

```ts
import { normalizeHref, getLinkAttributes } from '@cds/rte-core';

normalizeHref('site.com'); // 'https://site.com/'
normalizeHref('javascript:alert(1)'); // null
getLinkAttributes(
  'https://site.com/',
  { forceRel: ['nofollow', 'ugc'] },
  { target: '_blank' },
);
// { href: 'https://site.com/', rel: 'nofollow ugc noopener noreferrer', target: '_blank' }
```

## Embeds

```ts
import { toEmbed } from '@cds/rte-core/embeds';

toEmbed('https://youtu.be/dQw4w9WgXcQ?t=42');
// { provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42', title: 'YouTube', width: 640, height: 360, aspectRatio: '16 / 9' }
```

O `src` é sempre montado pelo provedor e revalidado pelo core; URL desconhecida devolve `null`.

## Sumário e texto

```ts
import { extractToc, htmlToText } from '@cds/rte-core/html';

extractToc('<h2 id="rt-intro">Introdução</h2>');
// [{ id: 'rt-intro', text: 'Introdução', level: 2 }]
htmlToText('<p>Olá</p><script>x()</script>'); // 'Olá'
```

`htmlToText` devolve texto (escape antes de voltar ao HTML). Os dois aceitam `maxDepth` (padrão 256): acima disso a leitura é truncada, sem lançar.

## Rascunho

```ts
import { createDraftStore, createLocalDraftStorage } from '@cds/rte-core';

const drafts = createDraftStore({
  storage: createLocalDraftStorage(),
  key: 'post-42',
});
drafts.save('<p>texto</p>'); // false se o armazenamento falhar
drafts.load(); // { html, savedAt } | null (expirado, inválido ou ausente)
drafts.clear(); // chame no logout em computadores compartilhados
```

Repositório: cds-text-editor (monorepo). Licença MIT.
