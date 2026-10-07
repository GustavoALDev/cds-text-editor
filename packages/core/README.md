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
