# @cds/rte-core

Núcleo do editor: extensões Tiptap, utilitários e esquema do HTML.

**Status: em construção.** Ainda sem versão publicada.

Instalação (nome provisório, escopo `@cds` ainda não confirmado): `npm i @cds/rte-core`

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

## Entry points

- `@cds/rte-core`: esquema do HTML, links, títulos, texto, imagem, rascunho e paleta (sem DOM, roda em Node/SSR).
- `@cds/rte-core/embeds`: `toEmbed` e os provedores padrão (YouTube, Vimeo, Spotify).
- `@cds/rte-core/html`: `htmlToText` e `extractToc` sem DOM (usa `htmlparser2`, cerca de 22 kB gzip; fora do entry `/` de propósito).

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
