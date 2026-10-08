---
title: Embeds
description: Colar o endereço de um vídeo ou áudio de uma plataforma, escolher os provedores aceitos e liberar a CSP.
---

# Embeds

Um _embed_ é um `iframe` de uma plataforma (YouTube, Vimeo, Spotify) que a pessoa insere colando o **endereço da página**. O `iframe` nunca vem da URL colada: quem monta o `src` é um **provedor**, de uma lista fechada, e o core revalida o resultado. Endereço de fora da lista não vira nada. A referência completa está no [README do `@cds/rte-core`](https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/core/README.md) e na página [`api/core-embeds`](api/core-embeds).

> O site não embute `iframe` (a CSP dele não tem `frame-src`), então os exemplos desta página são só compilados. A [demonstração](demo/) mostra os embeds funcionando.

## Do endereço ao embed

`toEmbed` faz a conversão, no navegador ou no servidor. Devolve o `src`, o título e a proporção, ou `null`:

<!-- example: examples/embeds/to-embed.ts#to-embed -->

No editor, a pessoa usa o diálogo de embed ou, com `pasteEmbeds`, cola uma única URL suportada num parágrafo vazio.

## Provedor próprio

Para aceitar outra plataforma, registre um `RteEmbedProvider`. O core recusa provedor inseguro (host IP ou `localhost`, `srcPatterns` sem âncora ou sem o host literal). A lista `embedProviders` **substitui** a padrão: repita os provedores que quer manter.

<!-- example: examples/embeds/provedor.ts#provedor -->

Use as **mesmas** opções no sanitizador do servidor e da exibição (veja [Segurança](guia/seguranca) e [Exibição](guia/exibicao)): um provedor que só o editor conhece teria o `iframe` removido na gravação.

## CSP

O `iframe` do _embed_ exige `frame-src` com os hosts dos provedores ativos (`https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com` nos padrões, mais os seus). O `iframe` sai com `style="aspect-ratio"`, que o Chromium pode relatar como `style-src-attr` só ao carregar conteúdo. Veja [SSR e CSP](guia/ssr-e-csp).

Carregar um _embed_ revela o leitor à plataforma. Se isso importa, reduza a lista de provedores ou desligue o recurso com `features: { embeds: false }`.
