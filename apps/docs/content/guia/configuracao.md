---
title: Configuração
description: Onde colocar provideRichText, o que configurar por componente e qual valor vence.
---

# Configuração

## Onde colocar o provider

`provideRichText` devolve `EnvironmentProviders`. Ele vale no `app.config` (para todo o app) ou nos `providers` de uma **rota** (só para ela), nunca nos `providers` de um componente.

<!-- example: examples/configuracao/app-config.ts#raiz -->

Numa rota, só as telas daquela rota recebem a configuração:

<!-- example: examples/configuracao/route-providers.ts#rota -->

## Erro comum: provider no componente

O compilador recusa. O exemplo abaixo faz parte do build do site com `@ts-expect-error`: se um dia o erro sumisse, o build falharia.

<!-- example: examples/configuracao/component-wrong.ts#errado -->

## Entradas do componente

Cada `rte-editor` aceita entradas próprias, entre elas `placeholder`, `toolbar`, `labels`, `theme`, `options`, `showCharCount` e `showWordCount`:

<!-- example: examples/configuracao/entradas.ts#entradas -->

## Qual valor vence

Quando a mesma opção aparece em mais de um lugar, vale a primeira definida, nesta ordem: entrada do componente, _provider_ da rota, _provider_ da raiz, padrão.

<!-- example: examples/configuracao/precedencia.example.ts#precedencia -->

O exemplo vivo mostra dois editores: o primeiro dentro da rota com _provider_ (rótulos em português, barra `minimal`), o segundo sem ele (padrões):

<!-- live: configuracao -->

## Opções lidas uma vez

As opções de criação, a entrada `options` e o campo `editor` do _provider_, valem quando o editor é criado. Mudar depois não recria o editor. Já `toolbar`, `labels` e `theme` valem ao vivo.

## Rótulos, barra e política de links

- **Rótulos:** `labels` troca o idioma; `RTE_LABELS_PT_BR` e `RTE_LABELS_ES` vêm de `@cds/rte-angular/i18n`.
- **Barra:** `toolbar` aceita um preset (`minimal`, `article`, `full`), uma lista de grupos ou `false` para esconder a barra.
- **Política de links:** `editor.linkPolicy` define os protocolos aceitos, o `rel`, os domínios bloqueados e o `target`.

O tema ganha uma página própria numa próxima parte do guia. Para instalar, veja a [Instalação](guia/instalacao).
