---
title: SSR e CSP
description: O que o editor e a exibição fazem no servidor, a hidratação e uma CSP estrita que funciona.
---

# SSR e CSP

## O que roda no servidor

- **`rte-editor`** renderiza só uma **casca**: a moldura e um editável falso (`role="textbox"`, com nome acessível e `aria-busy`), com o placeholder quando o valor é vazio. O HTML do valor **não** aparece no HTML do servidor, e o `Editor` do Tiptap só é criado no navegador, depois da hidratação.
- **`[rteContent]`** (do `@cds/rte-render`) é o que mostra o texto sem JavaScript: o HTML do servidor já traz o conteúdo, o sumário e os `href` de âncora corretos. Para o texto que o leitor lê, é ele, não o editor, que você usa na página pública (veja [Exibição](guia/exibicao)).

Os pormenores estão nas seções "SSR e hidratação" do [README do `rte-angular`](https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/angular/README.md) e do [README do `rte-render`](https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/render/README.md).

## Hidratação sob CSP estrita

Desligue a hidratação incremental e não use `withEventReplay()`: o _event replay_ injeta um `<script>` inline, que `script-src 'self'` barra. No `angular.json`, use também `optimization.styles.inlineCritical: false`, porque o CSS crítico seria um `<style>` inline. A configuração abaixo repete as mesmas opções do editor e da exibição:

<!-- example: examples/ssr-e-csp/app.config.server.ts#servidor -->

Se `provideRteRender` ficar sem `sanitize` no modo padrão, a diretiva lança na criação; no servidor, com o `ErrorHandler` padrão, o erro vai para o log e o artigo sai vazio. Olhe o log se uma página renderizar sem texto.

## A CSP recomendada

A mesma política estrita do site e do demo, com os hosts de mídia e os provedores de embed que o seu app usa:

<!-- example: examples/ssr-e-csp/csp.ts#csp -->

Mande-a como **cabeçalho** de resposta. Uma `<meta http-equiv="Content-Security-Policy">` não aceita `frame-ancestors`, `report-uri` nem `sandbox` e só vale para o que vem depois dela; prefira o cabeçalho. O que a CSP deve liberar a mais para cada recurso (`connect-src` do envio, `img-src blob:` na prévia, `frame-src` dos embeds) está em [Envio e mídia](guia/envio-e-midia) e [Embeds](guia/embeds). O resumo de segurança está em [Segurança](guia/seguranca).

## Ruído conhecido no Chromium

Ao carregar conteúdo, o Chromium relata uma violação `style-src-attr` por atributo `style` presente no HTML, mesmo sem aplicá-lo (o conteúdo chega íntegro); Firefox e WebKit não relatam. A exibição reaplica os estilos permitidos por CSSOM, o que também gera um relatório `style-src-attr` por elemento com `style` na inserção. Quem usa `report-uri` ou `report-to` vê esse ruído; `script-src*` nunca deve aparecer. O detalhe está na seção "CSP" do README do `rte-angular`.

## Trusted Types

A exibição passa o HTML ao DOM por uma só porta, compatível com `require-trusted-types-for 'script'; trusted-types angular angular#unsafe-bypass`. A constante `TRUSTED_TYPES` do exemplo acima é esse complemento; ele é opcional.
