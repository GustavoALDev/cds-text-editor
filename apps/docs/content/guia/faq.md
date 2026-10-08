---
title: Perguntas frequentes
description: Respostas curtas para as dúvidas que mais aparecem.
---

# Perguntas frequentes

## O `provideRichText` não compila no `providers` do meu componente. E agora?

Ele devolve `EnvironmentProviders`, que só vale no `app.config` ou nos `providers` de uma rota. Veja [Configuração](guia/configuracao).

## Pus `provideRichText` na rota e sumiram as opções da raiz.

O provider da rota **substitui** o da raiz por inteiro, sem mesclar. Repita na rota o que quer manter. Veja "Qual valor vence" em [Configuração](guia/configuracao).

## Onde fica a sanitização?

No servidor, na gravação, com as mesmas opções do editor. A do navegador é segunda barreira. Veja [Segurança](guia/seguranca).

## Preciso de `bypassSecurityTrustHtml` para exibir o texto?

Não. `[rteContent]` cuida disso. Veja [Exibição](guia/exibicao) e [Segurança](guia/seguranca).

## O sumário (`rte-toc`) aparece vazio.

Ele depende de títulos com id `rt-<slug>`, que o editor gera ao serializar. HTML de outra origem, sem esses ids, não gera sumário; reserialize o documento no editor (ou migre o HTML). E editar o texto de um título muda o id, o que quebra âncoras externas. Veja [Exibição](guia/exibicao) e [Migração](guia/migracao).

## O `checkRteTheme` reprovou a minha cor. Posso confiar nele?

O contrário: ele **nunca reprova uma cor válida**. A derivação do tema já garante contraste para sementes válidas; o relatório existe para cor inválida e para a verificação no CI de quem integra. Veja [Tema](guia/tema).

## Qual a diferença entre `required` e `rteRequired`?

O `required` nativo do Angular mede a string HTML, e `<p></p>` já a deixa preenchida. O `rteRequired` considera vazio um documento sem texto e sem mídia. Veja [Formulários](guia/formularios).

## O limite de caracteres não barra a digitação no formulário reativo.

Nesse caminho o limite do validador não chega ao editor: ligue `[maxLength]` no elemento. Veja [Formulários](guia/formularios).

## O envio de imagem falha por CORS.

O navegador envia o arquivo para o endereço do `endpoint`, então ele precisa estar em `connect-src` e responder com os cabeçalhos CORS (ou ficar na mesma origem, atrás de um proxy do seu servidor). Veja [Envio e mídia](guia/envio-e-midia) e [SSR e CSP](guia/ssr-e-csp).

## Dá erro de CSP no console do Chromium com `style-src-attr`.

É o desvio conhecido do Chromium ao carregar conteúdo com `style`. O conteúdo chega íntegro e não é script. Veja [SSR e CSP](guia/ssr-e-csp).

## O editor aparece vazio no servidor.

No servidor ele renderiza só uma casca; o texto sem JavaScript é papel da exibição. Veja [SSR e CSP](guia/ssr-e-csp).

## Os nomes `@cds/rte-*` e a Tiptap.

Os nomes são provisórios e os pacotes ainda não foram publicados. O projeto é independente e **não é afiliado à Tiptap nem ao ProseMirror**. Veja [Instalação](guia/instalacao) e [Migração](guia/migracao).
