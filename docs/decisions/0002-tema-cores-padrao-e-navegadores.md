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

Procedimento no WSL (Ubuntu, sem sudo), verificado em 2026-10-02:

1. `npx playwright install firefox webkit` (baixa para `~/.cache/ms-playwright`).
2. Extrair as bibliotecas de sistema ausentes de `.deb` em `~/.cache/playwright-libs/root` (`apt-get download` + `dpkg -x`, sem root). Pacotes além dos do Chromium: `libgtk-4-1 libgtk-4-common libgraphene-1.0-0 libsoup-3.0-0 libsoup-3.0-common libsecret-1-0 libsecret-common libmanette-0.2-0 libenchant-2-2 libhyphen0 libharfbuzz-icu0 libharfbuzz-subset0 libwoff1 libavif16 libwebp7 libwebpdemux2 libwebpmux3 libjpeg-turbo8 libjpeg8 libopenjp2-7 libtiff6 libxslt1.1 libflite1 libopus0 libevent-2.1-7t64 libbacktrace0 libgles2 libwayland-server0 libgudev-1.0-0 libevdev2 libhidapi-hidraw0 libdecor-0-0 libunibreak6 libxkbcommon-x11-0 libxcb-xkb1 libxss1 libjson-glib-1.0-0 libjson-glib-1.0-common glib-networking glib-networking-common glib-networking-services libgstreamer-plugins-base1.0-0 libgstreamer-plugins-bad1.0-0 libgstreamer-plugins-extra1.0-0 libgstreamer-gl1.0-0 libabsl20260107 liblerc4 libdeflate0 libjbig0 libdav1d7 libgav1-2 liborc-0.4-0t64 libyuv0 libcairo-script-interpreter2`.
3. Rodar via `e2e/with-browser-libs.sh npx playwright test -c e2e`. O script exporta `LD_LIBRARY_PATH=$HOME/.cache/playwright-libs/root/usr/lib/x86_64-linux-gnu:$HOME/.cache/playwright-libs/root/lib/x86_64-linux-gnu`, desliga a validação de dependências do Playwright (`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`, pois ela usa `ldconfig -p`) e ajusta o wrapper `MiniBrowser` do WebKit para preservar o `LD_LIBRARY_PATH`. Detalhes em `e2e/README.md`.

### (c) Tabelas a preencher

Preenchidas pelas Tarefas 10, 12 e 14.

#### Orçamento de tamanho (R11)

| Medição | Orçamento | Data |
| ------- | --------- | ---- |
|         |           |      |

#### Resultado por navegador

| Navegador | Versão        | Cores relativas nativas? | `light-dark()` | `@property` | Grade de contraste          | ΔE máx por grupo |
| --------- | ------------- | ------------------------ | -------------- | ----------- | --------------------------- | ---------------- |
| Chromium  | 153.0.8010.12 | sim                      | sim            | sim         | 0 falhas (nativo e plano B) | Tarefa 12        |
| Firefox   | 155.0         | sim                      | sim            | sim         | 0 falhas (nativo e plano B) | Tarefa 12        |
| WebKit    | 26.6          | sim                      | sim            | sim         | 0 falhas (nativo e plano B) | Tarefa 12        |

Grade de contraste (Tarefa 10, `e2e/theme/contrast-grid.spec.ts`, medida na cor exibida via canvas 8 bits): 223 sementes sRGB, 148 fora do sRGB e 12 sementes junto ao limiar do `on-*` (Y = 0.1791005), em claro e escuro, com as três cores de papel iguais à semente (cobre primary, secondary e tertiary). Cada motor roda a grade com o CSS nativo e com o plano B forçado (`force: true`); todas as 6 combinações dão 0 falhas nos 3 motores. Menores razões (iguais nos 3 motores, salvo indicação): C1 4,58 (limiar), C2a 5,13, C2b 5,74, C3a 5,53, C3b 5,25, C4 5,53, C5a 16,42, C5b 7,01, C6a 11,51, C6b 4,54 (wide, nativo; Chromium 4,543, Firefox e WebKit 4,540); mínimos exatos por grade e variante estão na saída do teste. "Sim" em `@property` indica `CSSPropertyRule` disponível.

ΔE máx por grupo: coluna reservada para a Tarefa 12 (paridade entre motores); não medida na Tarefa 10.

## Consequências

- Os padrões continuam os validados pelo spike (0 falhas de contraste); nada muda no código.
- A origem oficial das cores permanece não verificada até o autor consultar as diretrizes de marca.
- O CI precisa instalar Firefox e WebKit do Playwright, e o ambiente local também.

## Pendências do autor

- Confirmar as cores de marca oficiais do Angular (diretrizes do press kit) e decidir se os padrões mudam.
