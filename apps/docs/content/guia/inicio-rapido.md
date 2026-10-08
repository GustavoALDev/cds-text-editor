---
title: Início rápido
description: Do zero a um editor com validação e a exibição do texto em cinco minutos.
---

# Início rápido

Em cinco passos você instala o editor, liga o CSS, escolhe os rótulos, valida o texto com Signal Forms e exibe o resultado.

## 1. Instale

Os pacotes ainda não foram publicados, e o nome `@cds/*` é provisório. O comando traz o componente, o núcleo, o tema e os peers do Tiptap:

<!-- generated: install-command -->

Para exibir o texto sem carregar o editor, acrescente o `@cds/rte-render` e o `@cds/rte-sanitizer`. A página [Instalação](guia/instalacao) explica cada pacote.

## 2. Inclua o CSS

O pacote não injeta CSS. Liste os arquivos no `angular.json`, nesta ordem (a exibição entra por último):

<!-- generated: styles-order render -->

## 3. Configure os rótulos

`provideRichText` é opcional; sem ele os rótulos ficam em inglês. Aqui, em português:

<!-- example: examples/inicio-rapido/app.config.ts#config -->

## 4. Use o editor em um formulário

O editor é um controle de formulário. Com Signal Forms, `rteMaxChars` limita o **texto** que a pessoa vê, não a string HTML:

<!-- example: examples/inicio-rapido/form-example.ts#component -->

<!-- example: examples/inicio-rapido/form-example.html#template -->

## 5. Exiba o texto

`[rteContent]` mostra o HTML do editor sem carregar o editor. O sanitizador deve receber as mesmas opções do editor:

<!-- example: examples/inicio-rapido/display-example.ts#display -->

## Veja funcionando

Digite no editor. O botão preenche o campo com um texto acima do limite de 60 caracteres, como faria um valor vindo da API:

<!-- live: inicio-rapido -->

Próximo passo: [Configuração](guia/configuracao).
