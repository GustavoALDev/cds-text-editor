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

| Cenário (import do consumidor)                                  | Medição min / min+gzip (B) | Orçamento (B) | Data       |
| --------------------------------------------------------------- | -------------------------- | ------------- | ---------- |
| `whole` (`export *`)                                            | 11007 / 4898               | 5632          | 2026-10-02 |
| `apply` (`applyRteTheme`, puxa o plano B)                       | 7442 / 3460                | 4096          | 2026-10-02 |
| `create` (`createRteTheme`)                                     | 5645 / 2737                | 3072          | 2026-10-02 |
| `parse` (`parseColor`)                                          | 2956 / 1450                | 2048          | 2026-10-02 |
| `presets` (`RTE_THEME_PRESETS`)                                 | 476 / 304                  | 512           | 2026-10-02 |
| `check` (`checkRteTheme`, `warnIfPoorTheme`, `suggestRteColor`) | 8761 / 3994                | 4608          | 2026-10-02 |

Medição com esbuild (`bundle`, `minify`, `treeShaking`, ESM) sobre `packages/theme/dist/index.js`, gzip nível 9; orçamentos em `packages/theme/size-budget.json` (medição + cerca de 10 %, arredondada para cima ao próximo múltiplo de 0,5 kB), verificados por `tools/check-size.mjs` (`nx run theme:size`, no CI via `nx affected`).

A spec (R11) pede JS de no máximo 3 kB min+gzip e autoriza ajustar após medir. O pacote inteiro mede 4,9 kB e o caminho de `applyRteTheme` 3,5 kB, acima do alvo literal, porque o plano B (cálculo em OKLab/OKLCH no JS, equivalente ao CSS de cores relativas), o parser de cores e o verificador de contraste são inerentes a um fallback autocontido, sem dependências. O `sideEffects` declara só `*.css` e o JS é tree-shakeable (provado em `tools/check-size.test.mjs`): cada consumidor paga só pelo que importa (`parseColor` 1,4 kB, `createRteTheme` 2,7 kB, presets 0,3 kB), por isso o orçamento é por cenário e não um único número. Um ajuste feito ao medir: `STATIC_SPECS` em `check-theme.ts` era uma constante de módulo com chamadas no inicializador, o que impedia o esbuild de descartar `STATIC_TOKENS` e a lógica de avisos de quem só importava `parseColor` ou os presets; virou função (`staticSpecs()`), sem mudança de comportamento (`parse` 1785 para 1450 B, `presets` 650 para 304 B, `create` 2863 para 2737 B, `apply` 3583 para 3460 B).

Opções futuras (não adotadas, mudariam a API ou o comportamento): (1) entry point `@cds/rte-theme/dev` para `checkRteTheme`, `warnIfPoorTheme` e `suggestRteColor`, que tiraria cerca de 1,1 kB do pacote inteiro (4898 B contra 3792 B sem eles); (2) carregar o plano B sob demanda (import dinâmico), de modo que o caminho nativo de `applyRteTheme` não o inclua, economia estimada de 2 a 2,5 kB no cenário `apply` (estimativa a partir de `create`, 2,7 kB, e `supportsRelativeColors`, 0,6 kB), ao custo de tornar o fallback assíncrono.

#### Resultado por navegador

| Navegador | Versão        | Cores relativas nativas? | `light-dark()` | `@property` | Grade de contraste          | ΔE máx por grupo                                      |
| --------- | ------------- | ------------------------ | -------------- | ----------- | --------------------------- | ----------------------------------------------------- |
| Chromium  | 153.0.8010.12 | sim                      | sim            | sim         | 0 falhas (nativo e plano B) | linear 0; texto 0,0028; neutros 0,0035; bordas 0,0032 |
| Firefox   | 155.0         | sim                      | sim            | sim         | 0 falhas (nativo e plano B) | todos os grupos 0                                     |
| WebKit    | 26.6          | sim                      | sim            | sim         | 0 falhas (nativo e plano B) | linear 0; texto 0,0028; neutros 0; bordas 0           |

Grade de contraste (Tarefa 10, `e2e/theme/contrast-grid.spec.ts`, medida na cor exibida via canvas 8 bits): 223 sementes sRGB, 148 fora do sRGB e 12 sementes junto ao limiar do `on-*` (Y = 0.1791005), em claro e escuro, com as três cores de papel iguais à semente (cobre primary, secondary e tertiary). Cada motor roda a grade com o CSS nativo e com o plano B forçado (`force: true`); todas as 6 combinações dão 0 falhas nos 3 motores. Menores razões encontradas, tomadas sobre todas as grades e as duas variantes (nativo e plano B) de cada motor: C1 4,582 (sementes de limiar), C2a 5,134, C2b 5,742, C3a 5,53, C3b 5,25, C4 5,53, C5a 16,41, C5b 7,01, C6a 11,51 e C6b 4,54. C1 4,582 ocorre nas sementes de limiar, idêntico nos 3 motores. C6b ocorre na grade fora do sRGB com CSS nativo: 4,543 no Chromium e 4,540 no Firefox e no WebKit (diferença de arredondamento do motor); no plano B o mínimo de C6b é 4,706 nessa grade. Os demais mínimos coincidem nos 3 motores até a terceira casa; os valores exatos por grade e variante saem na saída do teste. O teste também prova qual plano rodou (variáveis derivadas inline iguais a `createRteTheme` no plano B; nenhuma inline no nativo). "Sim" em `@property` indica `CSSPropertyRule` disponível.

ΔE máx por grupo (Tarefa 12, `e2e/theme/fallback-equivalence.spec.ts`): distância euclidiana em OKLab entre a cor exibida (8 bits, canvas) com o CSS nativo e com o plano B forçado, em 72 sementes únicas (30 de marca/extremos, 30 espalhadas da grade sRGB, as 12 de limiar e 5 fixas, já sem repetições) × claro/escuro × neutros tingidos e cinza, mais 7 trios de sementes diferentes (Angular, `#1d8811`/`#e51e3a`/`#4071d9`, `#00bcd4`/`#ff5722`/`#8bc34a` e os presets ocean, forest, sunset, monochrome). Grupos: linear (`on-*`, `*-hover`, `*-active`), texto (`*-text`, `focus`), neutros (`surface`, `surface-raised`, `text`, `text-muted`, `border`, `*-subtle`) e bordas (`*-border`). Piores casos: texto 0,0028 (`focus`, `#006666`, escuro, 122,150,150 nativo contra 122,149,149 no plano B; Chromium e WebKit), neutros 0,0035 (`primary-subtle`, `#ff8800`, escuro, cinza; Chromium), bordas 0,0032 (`primary-border`, `#66ffb3`, escuro; Chromium). O Firefox deu ΔE 0 em todos os grupos e o WebKit 0 fora do texto.

Estes números SUBSTITUEM os do spike (neutros <= 0,019 e `*-border` <= 0,041): o plano B do spike tinha um erro de digitação na matriz direta do OKLab (linha `m`, 0,0883024619 em vez de 0,1073969566), e o porte em TypeScript usa a matriz correta. Os limites de R7 valem com folga larga (a medição fica cerca de 5 vezes abaixo de 0,019 e 12 vezes abaixo de 0,041). Por isso o teste usa limites mais apertados que os da spec (linear 0,002; texto 0,004; neutros e bordas 0,006): com 0,019 e 0,041 uma constante de neutro alterada não seria detectada.

Piso de quantização: o lado nativo é lido já resolvido em 8 bits (canvas) e o plano B sai em hex de 8 bits, então ΔE nunca é "exatamente 0" por construção quando os arredondamentos divergem em 1 unidade de um canal. Um passo de 1/255 a partir de `#808080` vale ΔE 0,0015 (R), 0,0029 (G) e 0,0015 (B); perto do preto chega a 0,06 (a raiz cúbica do OKLab amplia o escuro). Todos os desvios medidos (0,0028 a 0,0035) são esse piso de 1 unidade; os derivados lineares ficam em 0 nos 3 motores. Mutações verificadas: trocar a quantidade do `hover` de 0,14 para 0,15 no plano B faz o grupo linear falhar (ΔE 0,0086); alterar o teto de croma dos neutros de 0,006 para 0,012 (e `border` de 0,02 para 0,03) faz o grupo de neutros falhar; uma alteração de 0,001 no teto (0,006 para 0,007) fica abaixo do piso e não é detectável.

Mistura em OKLab (ver "Desvios da fórmula do spike"): com sementes de papel diferentes e neutros `gray`, o plano B e o CSS nativo concordam (ΔE dentro dos mesmos limites, 3 motores; antes da correção chegava a 0,111 em `secondary-border`). Os números acima valem depois dessa correção. O teste também confere o matiz de `*-subtle` e `*-border` pela distância (a, b) do OKLab até o raio de matiz da semente (robusta à quantização de 8 bits): máximos medidos, iguais nos 3 motores, 0,0018 em cinza, 0,0068 na borda tingida e 0,0112 no `subtle` tingido; limites 0,004, 0,010 e 0,016. Voltar o CSS para `color-mix(in oklch)` faz esse teste falhar nos 3 motores (borda tingida 0,031 e 15,5 graus; `subtle` cinza 0,0145 e 29,7 graus).

As misturas em OKLab que saem do gamut sRGB são recortadas canal a canal tanto no plano B quanto nos motores (por exemplo, a borda de `#ff0000` ultrapassa 0,099 em R linear; ΔE máx medido 0,0032 nos 3 motores). Se um motor futuro aplicar o mapeamento de gamut do CSS Color 4 no lugar do recorte, pode aparecer ΔE de até ~0,018 em sementes saturadas: ainda abaixo de 0,041 da spec, mas acima do 0,006 apertado daqui, e é onde olhar primeiro. Risco conhecido nas atualizações de motor: perto do preto um passo de 8 bits vale até 0,06 de ΔE, então bordas muito escuras podem exceder o limite fixo por pura quantização; uma forma `max(limite do grupo, ΔE de 1 passo)` fica adiada.

#### Comportamentos verificados em navegador real

Tarefa 11 (`e2e/theme/behavior-*.spec.ts`), com Chromium 153, Firefox 155 e WebKit 26.6. "✓" = passa; "skip" = não roda no motor, com o motivo.

| Comportamento                                                                          | Chromium | Firefox                        | WebKit                         |
| -------------------------------------------------------------------------------------- | -------- | ------------------------------ | ------------------------------ |
| R3 valor inválido cai no padrão Angular (inline, nativo e plano B, sem erros)          | ✓        | ✓                              | ✓                              |
| R4 prioridade padrão < `:root` < ancestral < instância (sementes e `--rte-radius`)     | ✓        | ✓                              | ✓                              |
| R4 camadas: CSS sem camada vence sem `!important`; derivadas não vêm de `:root`        | ✓        | ✓                              | ✓                              |
| R5 formatos (hex, rgb, hsl, oklch, display-p3, nome, `var()`) e `parseColor` no canvas | ✓        | ✓                              | ✓                              |
| R6 modos auto, inherit (reage em tempo de execução), light, dark                       | ✓        | ✓                              | ✓                              |
| `applyRteTheme`: nativo, plano B, listener de `prefers-color-scheme`, cleanup, WeakMap | ✓        | ✓                              | ✓                              |
| Neutros `tinted` e `gray`, semente cinza                                               | ✓        | ✓                              | ✓                              |
| R8 `forced-colors: active` (borda, foco, superfície e texto distinguíveis)             | ✓        | ✓                              | ✓                              |
| R8 `prefers-contrast: more` (foco 3px, borda com contraste >= 3)                       | ✓        | ✓                              | ✓                              |
| R10 custo de troca da primary (limite 0,5 ms Chromium, 2 ms Firefox/WebKit)            | ✓        | ✓                              | ✓                              |
| CSP restritiva (`style-src 'self'; script-src 'self'`), sem violações                  | ✓        | ✓                              | ✓                              |
| SSR: importação em Node sem DOM                                                        | ✓        | skip (teste só de Node, 1 vez) | skip (teste só de Node, 1 vez) |

Custo de trocar `--rte-primary` com recálculo forçado (mediana por troca, 10 lotes de 30 trocas; a mediana individual do Firefox e do WebKit é limitada pela resolução do relógio): Chromium 0,31 ms, Firefox 0,03 ms, WebKit 0,27 ms (execução em paralelo com outros testes; varia entre execuções).

Observações: o Firefox não reavalia `@media (forced-colors | prefers-contrast)` de folhas já carregadas quando a emulação do Playwright muda, então os testes de R8 emulam e recarregam o conteúdo. Um valor inválido na instância é descartado e cai no valor herdado (ancestral ou `:root`), e só então no padrão, como em qualquer propriedade registrada. Os testes de R8 emulam a preferência e recarregam o conteúdo em todos os motores (o Firefox não reavalia `@media` de uma folha já carregada depois da emulação do Playwright: sonda de CSS simples confirmou matchMedia verdadeiro com `getComputedStyle` antigo), então a reação ao vivo a uma mudança de preferência NÃO é coberta por esses testes. O teste de custo (R10) tem até 2 novas tentativas, porque runners do GitHub são mais lentos e a medição usa um DOM trivial (limite inferior); os limites não mudaram. Em forced-colors, valores do plano B aplicados inline vencem os overrides do tema (comportamento documentado).

## Desvios da fórmula do spike

O pacote difere do spike T6 (`docs/specs/referencias/t6-tema`, somente leitura) em quatro pontos; o golden (`tools/gen-theme-golden.mjs`) aplica os quatro em memória, exigindo exatamente uma ocorrência de cada.

1. Matriz OKLab: erro de digitação na linha `m` de `linearToOklab` do spike (0,0883024619 em vez de 0,1073969566). O ΔE do plano B contra o nativo, medido com a matriz correta, é 0 a 0,0035 (o spike publicava 0,019 e 0,041).
2. Degrau do `on-*`: a rampa `clamp((WHITE_Y - y) * 1000)` tinha 0,001 de largura e deixava ~35 mil cores sRGB com texto cinza; o ganho passou a 1e9.
3. Limiar do `on-*`: 0.1791 ficava a 5,6e-9 de uma cor de 8 bits (Chromium, Firefox e WebKit decidem diferente por precisão de ponto flutuante); 0.1791005 fica a >= 1,28e-7 de toda cor de 8 bits.
4. Espaço da mistura de `*-subtle` (12%) e `*-border` (45%): `color-mix(in oklch)` interpolava o matiz entre a semente do papel e a superfície, que carrega o matiz da primary mesmo com croma ínfimo; o matiz de cada papel era puxado em direção ao da primary (primary verde + secondary vermelha dava borda ocre). Passou a `color-mix(in oklab)`, linear em L, a, b: uma superfície acromática mantém exatamente o matiz da semente. Medição (matiz OKLCH da cor exibida contra o da semente, trios de matizes distantes #1d8811/#e51e3a/#4071d9, #8514f5/#f637e3/#0546ff, #ea580c/#db2777/#9333ea, #0369a1/#0e7490/#4f46e5 e #00bcd4/#ff5722/#8bc34a, claro e escuro, tingido e cinza, Chromium, Firefox e WebKit iguais): antes, desvio máximo de 155 graus (`secondary-subtle`, #ff5722 com primary #00bcd4) e 96 graus na borda; depois, 5,1 graus na borda (tingido), 2,9 graus em cinza e 33 graus no `*-subtle` tingido (a superfície tingida pela primary é quase todo o `subtle`, por desenho). Esses números são piores casos sobre os trios medidos, não limites gerais: uma varredura ampla (4096 sementes × primarias amostradas, croma da semente >= 0,05) chega a cerca de 78 graus no `subtle` tingido com croma ~0,010 (desvio ~0,013 em OKLab, visualmente desprezível porque a superfície tingida domina o `subtle`) e a 17 graus na borda tingida com croma ~0,022. As diferenças de contraste são nulas na grade (mínimos C6a 11,51 e C6b 4,54, iguais aos anteriores).

## Teste de propriedade

`packages/theme/src/property.spec.ts` (fast-check 4.10.2, devDependency exata), 5000 execuções por propriedade, semente fixa `20261002` (`FC_SEED` e `FC_RUNS` sobrescrevem localmente). A suíte inteira do tema roda em ~8 s (o arquivo de propriedades, ~7 s).

- **Contraste**: trios independentes de sementes (hex de 8 bits, `rgb()`/`hsl()`, `oklch` fora do gamut com C até 0,4, L extremo, cinzas e um gerador adversarial com as ~centenas de milhares de cores de 8 bits a |Y - 0,1791005| < 0,002, mais as de < 2e-6): nenhuma das 72 verificações falha e `ok === true`.
- **Boa formação**: sementes e lixo (ASCII, unicode, fragmentos `rgb(`, números enormes, até 400 caracteres): `createRteTheme` nunca lança e emite exatamente as 37 chaves `--rte-*` em `#rrggbb`; `parseColor` devolve `null` ou 3 canais finitos em [0, 1]; `invalid` lista exatamente os campos dados e ilegíveis.
- **Fidelidade de matiz**: distância de `secondary-border`/`secondary-subtle` ao raio de matiz da semente (croma >= 0,08, qualquer primary, claro/escuro). Varredura de 200 mil casos por vizinhança (duas sementes): gray border 0,0062 (quantização do hex; a mistura ideal em ponto flutuante dá 0), gray subtle 0,0023, tinted border 0,0088, tinted subtle 0,0126. Limites do teste: gray 0,008/0,004; tinted 0,012/0,016. Uma mistura polar os estoura (contraexemplo `#002700` com desvio 0,036).
- **Determinismo e equivalências**: mesma entrada, mesma saída, independente da ordem das chaves; `dark: true` = `mode: 'dark'`; `neutral: 'gray'` só altera neutros, `-subtle` e `-border` (on/hover/active/text idênticos).
- **onLevel**: só devolve 0 ou 1 fora de 1e-9 de `WHITE_Y`; nenhuma cor de 8 bits a menos de 1e-7 do limiar.

Mutações verificadas: `STEP_GAIN = 1000` falha o contraste (contraexemplo `["#5974b4","hsl(0 0% 0%)","#000000"]`), `WHITE_Y = 0.19` idem, `WHITE_Y = 0.1791` falha a propriedade de distância ao limiar (`#2d870b`, 3,8e-8; o defeito original é de precisão entre motores, invisível ao contraste em JS), mistura polar falha a fidelidade de matiz. Nenhum contraexemplo foi encontrado no código real (sementes fixa, 1, 424242, 987654321 e 272929841, estas com 20 mil execuções).

## Consequências

- Os padrões continuam os validados pelo spike (0 falhas de contraste); nada muda no código.
- A origem oficial das cores permanece não verificada até o autor consultar as diretrizes de marca.
- O CI precisa instalar Firefox e WebKit do Playwright, e o ambiente local também.

## Pendências do autor

- Confirmar as cores de marca oficiais do Angular (diretrizes do press kit) e decidir se os padrões mudam.
