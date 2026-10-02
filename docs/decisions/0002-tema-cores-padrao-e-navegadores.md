# ADR 0002: Cores padrão do tema e matriz de navegadores

- Status: aceita (2026-10-02)
- Spec de origem: `docs/specs/02-tema.md` (R11; `docs/specs/referencias/plano-geral.md` §7.4)

## Contexto

O pacote `@cds/rte-theme` precisa de três cores padrão de marca (primária, secundária, terciária), das quais deriva a paleta inteira. A spec propõe `#8514f5`, `#f637e3` e `#0546ff`, validadas pelo spike com 0 falhas de contraste. Antes de fixá-las, a Tarefa 1 consultou o press kit do Angular. O tema também usa recursos de CSS recentes (cores relativas, `light-dark()`, `@property`), então é preciso fixar em quais navegadores a verificação roda.

## Decisão

### (a) Cores padrão

Consulta feita em 2026-10-02:

- `https://angular.dev/press-kit` (WebFetch): a página descreve as variações do logotipo (preto, branco, gradiente estático e animado), mas **não publica valores hex**; remete a pastas do Google Drive com as diretrizes de marca (não consultadas).
- Tentativas de baixar o SVG do gradiente em `https://angular.dev/assets/images/logos/angular/angular_gradient.svg` e `.../press-kit/angular_gradient.png` devolveram o HTML da SPA (caminhos inexistentes).
- O HTML de `https://angular.dev/` traz o logotipo inline com gradiente de paradas `#F60A48`, `#F20755`, `#DC087D`, `#9717E7`, `#6C00F5` (e `#E40035`, `#FF31D9`). É o gradiente vermelho-violeta do logotipo, que não equivale ao trio violeta/rosa/azul da spec e não é uma publicação oficial de "cores de marca".

Resultado: **não verificado** (não há hex oficial publicado para violeta/rosa/azul no press kit). Os valores observados no logotipo ficam registrados só como referência.

Decisão: manter os padrões da spec, exportados como `ANGULAR_DEFAULTS` (Tarefa 4):

| Papel     | Hex       |
| --------- | --------- |
| primary   | `#8514f5` |
| secondary | `#f637e3` |
| tertiary  | `#0546ff` |

Nenhum valor foi inventado. Se o autor obtiver as diretrizes oficiais (Drive do press kit) e os hex divergirem, os dois conjuntos devem ser registrados aqui e a troca decidida pelo autor.

### (b) Matriz de navegadores de verificação

Decisão do autor em 2026-10-02: Chromium, Firefox e WebKit rodam **localmente e no CI** (Firefox e WebKit preparados no WSL), via Playwright.

| Navegador | Local (WSL) | CI  |
| --------- | ----------- | --- |
| Chromium  | sim         | sim |
| Firefox   | sim         | sim |
| WebKit    | sim         | sim |

### (c) Tabelas a preencher

Preenchidas pelas Tarefas 10, 12 e 14.

#### Orçamento de tamanho (R11)

| Medição | Orçamento | Data |
| ------- | --------- | ---- |
|         |           |      |

#### Resultado por navegador

| Navegador | Versão | Cores relativas nativas? | `light-dark()` | `@property` | Grade de contraste | ΔE máx por grupo |
| --------- | ------ | ------------------------ | -------------- | ----------- | ------------------ | ---------------- |
|           |        |                          |                |             |                    |                  |

## Consequências

- Os padrões continuam os validados pelo spike (0 falhas de contraste); nada muda no código.
- A origem oficial das cores permanece não verificada até o autor consultar as diretrizes de marca.
- O CI precisa instalar Firefox e WebKit do Playwright, e o ambiente local também.

## Pendências do autor

- Confirmar as cores de marca oficiais do Angular (diretrizes do press kit) e decidir se os padrões mudam.
