---
title: Exibição
description: Mostrar o HTML do editor numa página, sem carregar o editor, com sumário e âncoras.
---

# Exibição

Para mostrar o texto publicado, use o `@comodeviaser/rte-render`: a diretiva `[rteContent]` põe o HTML na página com a mesma aparência do editor, sem carregar o editor, e funciona no servidor (SSR) e sem JavaScript. A referência completa está no [README do `@comodeviaser/rte-render`](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/packages/render/README.md) e nas páginas [`api/render`](api/render) e [`api/render-toc`](api/render-toc).

## Diretiva e sumário

`provideRteRender` recebe o sanitizador, e `rte-toc` monta o sumário a partir do HTML já tratado. Passe ao sanitizador as **mesmas opções do editor** (provedores de _embed_, `mediaHosts`, `allowRelativeMedia`, `linkPolicy` com `protocols` e `allowRelative`, `idPrefix`); com outras, a exibição remove mais ou menos que o editor. Sem `sanitize`, a diretiva lança na criação.

<!-- example: examples/exibicao/display.ts#opcoes -->

<!-- example: examples/exibicao/display.ts#exibicao -->

O CSS vem na ordem de sempre (`theme.css`, `content.css` e `render.css`; veja o [Início rápido](guia/inicio-rapido)).

## Os ids dos títulos

O sumário depende dos ids `rt-<slug>` dos títulos, e **quem os gera é o editor, na serialização** (`getRteHtml`, e portanto o `value`). Duas consequências:

- **HTML de outra origem sem esses ids não gera sumário.** Texto importado, colado de outro sistema ou escrito à mão chega sem `id`, e o sanitizador só deixa passar os ids que ele aceita (os `rt-`). Sem `id`, não há âncora para onde apontar.
- **Editar o título muda o id.** O id é calculado do texto (`Primeiros passos` vira `rt-primeiros-passos`, e repetidos ganham `-2`, `-3`). Quem renomeia um título quebra os links externos que apontavam para ele. Se isso importa, não renomeie títulos de textos já publicados.

Os links de âncora do conteúdo e do sumário resolvem contra o endereço do documento, não contra o `<base href>`, então funcionam sob qualquer prefixo (como este site, em `/comodeviaser-editor/`). Para cabeçalho fixo, ajuste `--rte-scroll-margin`.

## Exemplo vivo

Edite um título e veja o sumário e a exibição acompanharem. Clicar numa entrada rola até o título.

<!-- live: exibicao -->

## O sumário no servidor

Quem pré-calcula o sumário (para um índice, uma busca ou um e-mail) usa `extractToc`, de `@comodeviaser/rte-core/html`, sobre o HTML salvo:

<!-- example: examples/exibicao/display.ts#servidor -->

## Quando usar o modo `trusted`

Por padrão o HTML passa pelo sanitizador do navegador, uma segunda barreira; a que conta é a do servidor, na gravação. O modo `trusted` pula essa etapa e vale **só** para HTML que o servidor sanitizou com `createSanitizer`. Veja [Segurança](guia/seguranca).
