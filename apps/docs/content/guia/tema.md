---
title: Tema
description: A escada de personalização de 0 a 4, o modo inherit para sites com tema claro e escuro, os presets e o playground.
---

# Tema

Você informa até três cores (`primary`, `secondary`, `tertiary`) e o resto (hover, fundo suave, borda, texto legível, foco, neutros, claro e escuro) é **derivado em CSS**, com contraste acessível por construção. O pacote `@cds/rte-theme` não depende de Angular e não precisa de _build_ de tema. A tabela completa de variáveis está no [README do tema](https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/theme/README.md#escada-de-personalização-níveis-0-a-4) e a API em [`api/theme`](api/theme); a decisão está no ADR 0002.

## A escada, do mais simples ao mais fino

| Nível | O que você faz | Onde |
| --- | --- | --- |
| 0 | Nada: vale a paleta do Angular e o modo `auto` | — |
| 1 | As três sementes | `--rte-primary`, `--rte-secondary`, `--rte-tertiary` |
| 2 | Forma e tipografia | `--rte-radius`, `--rte-density`, `--rte-font-sans`, `--rte-font-mono`, `--rte-font-size`, `--rte-line-height` |
| 3 | Tokens finos | `--rte-surface`, `--rte-text`, `--rte-border`, `--rte-focus`, `--rte-danger`, … |
| 4 | CSS dos componentes | classes estáveis `rte-*` (BEM) |

Os exemplos usam uma **classe envolvente**, `.meu-tema`, em vez de `:root`, para não mudar o resto do site. Sementes e nível 2 também valem em `:root`, em qualquer ancestral ou na própria instância (a cascata normal), então o mesmo CSS serve para o tema do app inteiro.

### Nível 1: as sementes

Qualquer cor CSS vale, inclusive `oklch()` e `var()`. Um valor inválido (`banana`) é descartado e vale o do ancestral ou, sem nenhum, o padrão do Angular.

<!-- example: src/styles/exemplos-tema.css#sementes -->

### Nível 2: forma e tipografia

Raio e densidade **não existem em `RteTheme`**: são CSS deste nível, não opções do `applyRteTheme` nem do `[theme]`. `--rte-density` é um número (1 é o padrão) e `--rte-radius` e `--rte-font-size` são comprimentos.

<!-- example: src/styles/exemplos-tema.css#forma -->

### Nível 3: tokens finos, só mirando `.rte-root`

Os tokens derivados e os do nível 3 são declarados em `.rte-root`. Por isso a regra precisa **mirar `.rte-root`**; declarar `--rte-danger` ou `--rte-surface` no ancestral não funciona, porque a regra do próprio `.rte-root` ganha. (A exceção é `--rte-focus-width`, que também segue a cascata, menos sob `prefers-contrast: more`.)

<!-- example: src/styles/exemplos-tema.css#fino -->

### Nível 4: CSS dos componentes

As classes `rte-*` são API pública. Todo o CSS do pacote fica em `@layer`, então o seu CSS sem camada sempre vence, sem `!important`.

<!-- example: src/styles/exemplos-tema.css#componentes -->

## Claro e escuro: use `inherit`

O modo padrão, `auto`, segue o claro e escuro do **sistema** e ignora o botão de tema do seu site. Se o site tem o próprio tema, use `mode: 'inherit'`: o editor **herda o `color-scheme` do ancestral** e acompanha o site. Declare o `color-scheme` no `<html>` (por exemplo `html[data-theme='dark'] { color-scheme: dark; }`) ou, como no exemplo, num contêiner:

<!-- example: src/styles/exemplos-tema.css#escuro -->

No CSS nativo o `inherit` segue o ancestral mais próximo que declara `color-scheme`, não necessariamente o `<html>`; no plano B (navegadores sem cores relativas) o JavaScript lê o do `<html>`. Declare o esquema no `<html>` ou use `light` e `dark` explícitos para os dois caminhos não divergirem.

## Pelo Angular

`provideRichText({ theme })` define o tema da aplicação e `[theme]` o de uma instância; os dois se mesclam por chave (a instância vence). O tema é aplicado ao host por CSSOM, compatível com CSP estrita.

<!-- example: examples/tema/niveis.ts#js -->

## Verificar o contraste: `checkRteTheme` é uma guarda

Para sementes **válidas**, a derivação já garante contraste (ao menos 4,5 para o texto sobre a cor, em todas as cores sRGB de 8 bits). Por isso `checkRteTheme` é uma **guarda**, não uma etapa obrigatória: o relatório serve a cor inválida, a verificação no CI de quem muda as cores e, se um dia reprovar, `suggestRteColor` propõe a semente mais próxima que passa.

<!-- example: examples/tema/checar.ts#guarda -->

Em desenvolvimento, `warnIfPoorTheme` já avisa no console, mas só para valores inválidos.

## Veja funcionando

Marque e desmarque as caixas: com a classe aplicada, o editor ganha sementes, raio, densidade e os tokens finos; com o site escuro, o editor muda de esquema junto do contêiner, enquanto o resto desta página não muda.

<!-- example: examples/tema/live.html#template -->

<!-- live: tema -->

## Presets e playground

O pacote traz cinco presets em `RTE_THEME_PRESETS`, todos aprovados por `checkRteTheme` nos dois modos. O playground do demo mostra as três cores, o raio, a densidade e o contraste em tempo real e gera o CSS ou o TypeScript para copiar. Abra-o já num preset:

- [Angular (padrão)](demo/theme?preset=angular)
- [Ocean](demo/theme?preset=ocean)
- [Forest](demo/theme?preset=forest)
- [Sunset](demo/theme?preset=sunset)
- [Monochrome](demo/theme?preset=monochrome)

Próximo: [Envio e mídia](guia/envio-e-midia).
