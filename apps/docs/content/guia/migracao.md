---
title: Migração
description: Como trazer HTML legado ou de outro editor para o esquema, e o que muda entre versões 0.x.
---

# Migração

## Trazer HTML antigo

O editor só guarda HTML do **esquema** do `@cds/rte-core` (tags, atributos, classes `rt-*` e estilos de uma lista fechada). Tudo o que está fora dele precisa ser filtrado ou convertido antes de entrar no banco. Há dois instrumentos:

- **`validateHtml`** (`@cds/rte-core/html`) só **lê** e devolve a lista do que está fora do esquema; use-o para medir o estrago antes de mexer. No modo `accepted` ele aponta o que o sanitizador descartaria.
- **O sanitizador** (`@cds/rte-sanitizer`) é um **filtro do contrato, não um conversor**: tag fora do esquema é desembrulhada (`<h1>Título</h1>` vira o texto solto `Título`) e nada é reescrito para o equivalente. HTML legado como `h1`, `b` ou `p > img` entra melhor pelo leitor tolerante do editor, que converte esses casos (veja a seção do sanitizador no [README](https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/sanitizer/README.md)).

A função abaixo junta os dois e conta o que ficou de fora, para você revisar antes de gravar:

<!-- example: examples/migracao/migrar.ts#migrar -->

Rode-a em lote sobre o legado, olhe os totais de `descartado` por tipo (por exemplo `<font>`, `style=` e `<div>` solto) e só então grave o `html`. A função é idempotente: migrar o resultado não descarta mais nada.

## Depois de migrar

- Passe os mesmos dados pelo `createSanitizer` do servidor na gravação (veja [Segurança](guia/seguranca)).
- Para transformar um endereço de vídeo ou de áudio do legado em _embed_, use o `toEmbed` de `@cds/rte-core/embeds` (veja [Embeds](guia/embeds)).
- O sumário só existe para títulos com id `rt-…`. HTML de outra origem não os traz, e o sumário fica vazio até o editor reserializar o documento (veja [Exibição](guia/exibicao)).

## Mudanças que quebram, antes da primeira publicação

- **`idPrefix` precisa terminar em hífen.** O prefixo dos ids de título (`rt-` por padrão) agora segue `^[a-z][a-z0-9-]{0,14}-$`, contra _DOM clobbering_; `idPrefix: 'meu'` passa a lançar `RangeError`, e `'meu-'` continua válido. Os ids já gravados não mudam.
- **`linkPolicy.protocols` e `allowRelative` agora valem também no sanitizador** (e no esquema). Um protocolo fora de `https`, `http`, `mailto` e `tel` lança `TypeError`. Se o servidor usava opções diferentes das do editor, o resultado da gravação pode mudar.

## Versões `0.x` e o que é API pública

Os pacotes ainda não foram publicados e o nome `@cds/rte-*` é provisório. Enquanto a versão for `0.x`, uma versão _minor_ pode quebrar a API; leia o changelog antes de atualizar.

**API pública** é o que está nos relatórios `.api.md` de cada pacote (`packages/*/api/`, gerados pelo `api-extractor` e conferidos no CI), as classes CSS `rte-*` e as variáveis `--rte-*` dos níveis 1 a 3 do tema. Exports com prefixo `ɵ` e tudo marcado `@internal` **não** são API pública. A política de versões e de depreciação está em [`docs/support.md`](https://github.com/GustavoALDev/cds-text-editor/blob/main/docs/support.md) e a referência completa em [`api/angular`](api/angular), [`api/core`](api/core) e as demais entradas da seção "Referência da API".
