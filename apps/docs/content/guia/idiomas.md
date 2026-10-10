---
title: Idiomas
description: Rótulos em pt-BR, en e es, a troca de idioma por signal sem recriar o editor e como ajustar um rótulo.
---

# Idiomas

Os textos do editor (barra, nome acessível, _placeholder_, diálogos, menus, mensagens de erro) vêm de `RteLabels`. Sem configuração ficam em inglês. Os pacotes completos estão em `@comodeviaser/rte-angular/i18n`: `RTE_LABELS_PT_BR`, `RTE_LABELS_EN` e `RTE_LABELS_ES` (o `RTE_LABELS` do entry principal é o token de injeção que dá os rótulos em vigor). A referência está em [`api/angular-i18n`](api/angular-i18n) e na seção "Rótulos e idioma" do [README](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/packages/angular/README.md#rótulos-e-idioma).

## Trocar o idioma sem recriar

A entrada `[labels]` aceita um pacote, um objeto parcial **ou uma função**, e é lida dentro de um `computed`: ligue-a a um _signal_ e a troca atualiza no mesmo ciclo a barra, o nome acessível, o _placeholder_ e os diálogos abertos, **sem recriar o editor** e sem mexer no texto.

<!-- example: examples/idiomas/live.ts#troca -->

<!-- example: examples/idiomas/live.html#template -->

Clique nos idiomas e veja o nome do botão de negrito mudar (Negrito, Bold, Negrita) com o mesmo editor:

<!-- live: idiomas -->

## Idioma da aplicação inteira

Para o app todo, passe uma **função** a `provideRichText`. Ela é lida dentro de um `computed`, então pode ler um _signal_ que exista fora de componentes (de módulo, como abaixo):

<!-- example: examples/idiomas/app-labels.ts#provider -->

Duas coisas para lembrar. Primeiro, um `provideRichText` nos `providers` de uma **rota substitui** o da raiz por inteiro, em vez de mesclar: repita ali os rótulos que quiser manter (veja [Configuração](guia/configuracao#qual-valor-vence)). Segundo, as opções de criação (`[options]` e o campo `editor`) são lidas uma vez; só `labels`, `toolbar` e `theme` valem ao vivo.

## Ajustar um rótulo

Um objeto parcial vale: o que faltar cai no inglês. Para trocar só um texto e manter o resto de um pacote, espalhe o pacote e sobrescreva a chave.

<!-- example: examples/idiomas/parcial.ts#parcial -->

Um detalhe do título de caixa vazio: ele é serializado com o rótulo do idioma **atual**, mas a troca de idioma não emite valor; o `value` fica com o título no idioma anterior até a próxima edição.

O demo tem a mesma troca em [demo/i18n](demo/i18n). Próximo: [Tema](guia/tema).
