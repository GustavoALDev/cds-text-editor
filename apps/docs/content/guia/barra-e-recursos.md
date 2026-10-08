---
title: Barra e recursos
description: Presets da barra, recursos que ligam e desligam itens, menus flutuantes, menu `/`, busca, contadores e diálogos.
---

# Barra e recursos

A barra de ferramentas, os menus que aparecem junto ao texto e os recursos opcionais se configuram por entradas do `rte-editor` e por `provideRichText` (a [Configuração](guia/configuracao) explica qual valor vence). Esta página mostra o caminho de cada um; a referência completa está no [README do `@cds/rte-angular`](https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/angular/README.md#barra-de-ferramentas) e em [`api/angular`](api/angular).

## Presets e grupos

`toolbar` aceita um preset (`minimal`, `article`, o padrão, ou `full`), uma lista de grupos ou `false` (sem barra). Os presets estão congelados em `RTE_TOOLBAR_PRESETS`. Um grupo é uma lista de ids na ordem de exibição; um id desconhecido ou repetido é ignorado, com aviso em desenvolvimento. Mudar `toolbar` depois da criação vale na hora: só a interface muda e o editor não é recriado.

<!-- example: examples/barra-e-recursos/presets.ts#barra -->

## Recursos (`features`)

`features` liga e desliga recursos (`colors`, `tasks`, `code`, `tables`, `newsBlocks`, `media`, `embeds`, `search`, `slashCommands`; todos ligados por padrão). Um recurso desligado esconde o item da barra e o comportamento que ele traz. Diferente de `toolbar`, as opções de criação (`options`, onde mora `features`) são lidas **uma vez**: para mudá-las, recrie o editor, como no exemplo vivo abaixo.

## Menus flutuantes, menu `/`, busca e contadores

- **Menus flutuantes** (texto, link, tabela, imagem, vídeo e _embed_) aparecem junto do conteúdo sem tirar o foco do editável. `[floatingMenus]="false"` desliga todos; um objeto liga ou desliga por tipo, e mudar ao vivo não recria o editor.
- **Menu `/`:** digitar `/` no início de um bloco (ou depois de espaço) abre a lista de comandos. Desligue com `features: { slashCommands: false }`.
- **Busca e substituição:** `Ctrl+F` (`⌘F`) com o foco no editor, o item `search` do preset `full` ou `openSearch()`. Atenção: com a busca ligada (o padrão), o `Ctrl+F` do navegador passa ao editor quando o foco está nele; `features: { search: false }` devolve a tecla ao navegador.
- **Contadores:** `showCharCount` e `showWordCount` (ou `provideRichText({ counters })`) desenham o rodapé; com limite, uma região viva anuncia a proximidade e o excesso.

## Diálogos

Link, idioma, autor da citação, tabela e as mídias abrem um `<dialog>` modal, carregado sob demanda. Além dos itens da barra, `openDialog(kind)` abre um por código e devolve `false` quando não é aplicável naquele momento (sem editor, recurso desligado, outro diálogo aberto):

<!-- example: examples/barra-e-recursos/recursos.ts#recursos -->

O diálogo de link usa a **mesma política de links** do editor; os de mídia estão em [Envio e mídia](guia/envio-e-midia).

## Veja funcionando

Troque o preset: o editor é recriado por `@for`/`track` (as opções são lidas uma vez) e o valor é mantido por `[(value)]`.

<!-- example: examples/barra-e-recursos/live.html#template -->

<!-- example: examples/barra-e-recursos/live.ts#live -->

<!-- live: barra-e-recursos -->

O demo tem esta mesma troca com as _features_ por caixa de seleção: [demo/toolbar](demo/toolbar). Próximo: [Idiomas](guia/idiomas).
