# @cds/rte-sanitizer

Guia: [Segurança](../../apps/docs/content/guia/seguranca.md)

Sanitizador do HTML do editor. Uma função pura, sem DOM e igual em Node e no navegador: recebe HTML não confiável e devolve só o que o esquema do `@cds/rte-core` aceita, na forma canônica que o editor produz. A saída nunca executa nada, o HTML do editor atravessa sem mudar nenhum byte e sanitizar é idempotente. A engine é própria, sobre o `htmlparser2` (ADR 0006).

Ainda sem versão publicada (nome provisório, escopo `@cds` ainda não confirmado).

## Instalação

```bash
npm i @cds/rte-sanitizer @cds/rte-core
```

`@cds/rte-core` é dependência com a mesma versão exata do sanitizador (instalada junto). A outra dependência direta é o `htmlparser2`.

## Uso no servidor

A sanitização que vale é a do servidor, **na gravação**, com as **mesmas opções do editor**. Crie o sanitizador uma vez (o esquema é montado nessa hora) e reutilize:

```ts
import { createSanitizer } from '@cds/rte-sanitizer';
import { editorOptions } from './editor-options'; // o mesmo objeto da fábrica do editor

const sanitize = createSanitizer(editorOptions);

app.post('/posts', (req, res) => {
  const html = sanitize(req.body.html);
  // grave `html`
});
```

`createSanitizer` aceita o mesmo objeto de opções do editor (`features`, `linkPolicy`, `mediaHosts`, provedores de embed…) e ignora o que não é do esquema. Opções inválidas lançam na criação.

### Limites e `RteSanitizeError`

O sanitizador nunca trunca: acima do limite ele lança `RteSanitizeError`. O limite vale para a **entrada**; a saída pode ser maior (`&` vira `&amp;`, NBSP vira `&nbsp;`) e re-sanitizar uma saída grande pode lançar. **No servidor, recuse a saída acima do tamanho que você guarda** (`sanitize(html).length <= limite`). `maxInputLength` (padrão 1 000 000 unidades UTF-16) e `maxDepth` (padrão 256, aceita de 1 a 512) são opções. A saída só é estável sob o parser do Chromium se a profundidade do ponto de inserção mais `maxDepth` ficar ≤ 512 (os ancestrais contam, inclusive no SSR); o padrão deixa folga ([modelo de ameaças](../../docs/security.md)). Opção inválida lança `RangeError` e entrada que não é `string`, `TypeError`.

```ts
import { RteSanitizeError } from '@cds/rte-sanitizer';

try {
  return sanitize(req.body.html);
} catch (error) {
  if (error instanceof RteSanitizeError) {
    switch (error.code) {
      case 'input-too-long':
        return res.status(413).send(`HTML maior que ${error.limit}`);
      case 'max-depth':
        return res.status(422).send(`Aninhamento acima de ${error.limit}`);
    }
  }
  throw error;
}
```

## Uso pontual

```ts
import { sanitizeRichText } from '@cds/rte-sanitizer';

sanitizeRichText('<p onclick="x()">oi <script>alert(1)</script></p>'); // '<p>oi </p>'
```

Sem opções usa um sanitizador padrão criado na primeira chamada; com opções equivale a `createSanitizer(opções)(html)`, que remonta o esquema a cada chamada. Para muitas chamadas, prefira `createSanitizer`.

## Texto e tempo de leitura

O sanitizador não reexporta utilitários do core. Para o texto puro e o tempo de leitura:

```ts
import { readingTime } from '@cds/rte-core';
import { htmlToText } from '@cds/rte-core/html';

const minutes = readingTime(htmlToText(html));
```

## O que ele é e o que não é

É um **filtro do contrato, não um conversor** (S11): tag fora do esquema é desembrulhada (`<h1>Título</h1>` vira o texto solto `Título`) e nada é reescrito para o equivalente. HTML legado (`h1`→`h2`, `b`→`strong`, `p > img`→`figure`) entra pelo leitor tolerante do editor, inclusive em Node com `new Editor({ element: null })`.

## Segurança

O que ele protege, o que não protege, as hipóteses de uso e a CSP recomendada estão em [`docs/security.md`](../../docs/security.md). A decisão e os números estão no [ADR 0006](../../docs/decisions/0006-sanitizador.md).

## API

Os relatórios da superfície pública (gerados pelo `api-extractor` e conferidos pelo alvo `nx run sanitizer:api`; após uma mudança intencional, `UPDATE_API=1 npx nx run sanitizer:api`) ficam em `packages/sanitizer/api/`:

- [`rte-sanitizer.api.md`](api/rte-sanitizer.api.md): `@cds/rte-sanitizer`

Exports com prefixo `ɵ` e tudo marcado `@internal` ficam fora dos relatórios e não são API pública.

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

Repositório: cds-text-editor (monorepo). Licença MIT.

> Projeto independente, **não afiliado à Tiptap nem ao ProseMirror**.
