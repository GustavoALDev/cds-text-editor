---
title: Início rápido
description: Do zero a um editor com validação e a exibição do texto em cinco minutos.
---

# Início rápido

Em cinco passos você instala o editor, liga o CSS, escolhe os rótulos, valida o texto com Signal Forms e exibe o resultado.

## 1. Instale

Os pacotes ainda não foram publicados. O comando traz o componente, o núcleo, o tema e os peers do Tiptap:

<!-- generated: install-command -->

Para exibir o texto sem carregar o editor (passo 5), instale também o `@comodeviaser/rte-render` e o `@comodeviaser/rte-sanitizer` (`npm install @comodeviaser/rte-render @comodeviaser/rte-sanitizer`). A página [Instalação](guia/instalacao) explica cada pacote.

## 2. Inclua o CSS

O pacote não injeta CSS. Liste os arquivos no `angular.json`, nesta ordem (a exibição entra por último):

<!-- generated: styles-order render -->

O editor soma mais de 1 MB ao _bundle_ inicial, acima do orçamento de erro que o `ng new` configura (1 MB): o `ng serve` funciona, mas o `ng build` de produção falha com `bundle initial exceeded maximum budget`. Suba `budgets` (`maximumWarning` e `maximumError` do tipo `initial`) no `angular.json`. Os números de tamanho estão em [Desempenho](guia/desempenho).

## 3. Configure os rótulos

`provideRichText` é opcional; sem ele os rótulos ficam em inglês. Aqui, em português:

<!-- example: examples/inicio-rapido/app.config.ts#config -->

## 4. Use o editor em um formulário

Crie o componente `form-example.ts` com o template em `form-example.html`, ao lado dele (o botão que preenche o campo com texto longo é opcional):

O editor é um controle de formulário. Com Signal Forms, `rteMaxChars` limita o **texto** que a pessoa vê, não a string HTML:

<!-- example: examples/inicio-rapido/form-example.ts#component -->

<!-- example: examples/inicio-rapido/form-example.html#template -->

## 5. Exiba o texto

Crie `display-example.ts`:

`[rteContent]` mostra o HTML do editor sem carregar o editor. O sanitizador deve receber as mesmas opções do editor:

<!-- example: examples/inicio-rapido/display-example.ts#display -->

## Veja funcionando

Digite no editor. O botão preenche o campo com um texto acima do limite de 60 caracteres, como faria um valor vindo da API:

<!-- live: inicio-rapido -->

## 6. Envie imagens (opcional)

O editor só envia arquivos com um adaptador. O caminho completo, com o servidor de exemplo, o _proxy_ do `ng serve` e a exibição da imagem, está em [Envio e mídia](guia/envio-e-midia).

Próximo passo: [Configuração](guia/configuracao).
