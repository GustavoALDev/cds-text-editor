---
title: Instalação
description: Versões exigidas, comando de instalação, os cinco pacotes e a ordem do CSS.
---

# Instalação

## Requisitos

- Angular `>=22.2.1 <23` (a 22.2.1 é a versão verificada para Reactive e Template Forms).
- npm 7 ou superior, que instala os peers sozinho.
- O componente funciona sem zona (zoneless) e com `zone.js`, que não é um peer.

## Comando

Os peers obrigatórios saem direto dos `package.json` publicados, então o comando não diverge dos pacotes:

<!-- generated: install-command -->

Os pacotes ainda não foram publicados, e o nome `@cds/*` é provisório.

## Os cinco pacotes

| Pacote               | Quando usar                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `@cds/rte-angular`   | O componente `rte-editor`, os formulários, a barra e os diálogos.                            |
| `@cds/rte-core`      | O esquema do HTML, as extensões do Tiptap e as funções de texto, sempre junto do componente. |
| `@cds/rte-theme`     | O tema (`theme.css` e `createTheme`), sempre junto do componente e da exibição.              |
| `@cds/rte-render`    | Exibir o HTML do editor sem carregar o editor, com sumário.                                  |
| `@cds/rte-sanitizer` | Sanitizar o HTML na exibição ou no servidor; instalado à parte para o modo `sanitize`, na mesma versão do `@cds/rte-render`. |

Para só exibir texto, instale `@cds/rte-render`, `@cds/rte-core`, `@cds/rte-theme` e `@cds/rte-sanitizer` (`npm install @cds/rte-render @cds/rte-core @cds/rte-theme @cds/rte-sanitizer`). O tema entra mesmo sem editor: o `content.css` e o `render.css` usam os tokens `--rte-*` sem valor de reserva.

## CSS

O pacote não injeta CSS em tempo de execução, o que é compatível com CSP estrita. Inclua os arquivos pelo especificador dos `exports`, **nesta ordem**: tema, conteúdo, editor (e, para a exibição, o `render.css`):

<!-- generated: styles-order render -->

- `theme.css`: os tokens `--rte-*`.
- `content.css`: a aparência do conteúdo (`rt-*`), a mesma no editor e na exibição.
- `editor.css`: só o funcional da edição, a barra e os menus.
- `render.css`: só o que é de leitura (rolador de tabela, sumário).

Em vez do `angular.json`, você pode usar `@import` no CSS global com os mesmos especificadores. Nunca aponte para um caminho dentro de `node_modules`.

Depois da instalação, siga a [Configuração](guia/configuracao) ou volte ao [Início rápido](guia/inicio-rapido).
