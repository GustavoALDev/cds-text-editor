# ADR 0021: Regressão visual, móvel, leitores de tela, matriz de navegadores e baseline de desempenho

- Status: aceita (2026-10-08)
- Spec de origem: `docs/specs/08b-visual-movel-e-leitores-de-tela.md` (parte 2 de 2 da spec 08); plano `docs/superpowers/plans/2026-10-08-visual-08b.md`

## Contexto

A 08b fecha a spec 08: regressão visual em contêiner, projetos móveis e `visualViewport`, instantâneos ARIA, roteiro manual de leitor de tela, matriz de navegadores, baseline de desempenho do CI Linux e pisos de cobertura. Verificada no Chromium local (Windows) e no CI (Linux: Chromium 153, Firefox 155, WebKit 26.6). O aparelho real, o teclado do sistema e os leitores de tela ficam com o dono (roteiro).

## Decisão

### (a) Decisões O1–O15

Todas tomadas como na spec, salvo os desvios da seção (b).

| # | Decisão | Onde está |
| --- | --- | --- |
| O1 | `toHaveScreenshot` só no contêiner oficial; versão do `@playwright/test` exata (1.63.0) igual à tag da imagem, conferida por `tools/visual-image.test.mjs`; `npm run visual` (`tools/visual.mjs`) | `e2e/visual/`, `tools/visual*.mjs` |
| O2 | Config própria, captura por elemento, `threshold: 0.2` e `maxDiffPixels: 10` globais, teto de 300 KB por arquivo e 20 MB no total (`check:rules`) | `e2e/visual/playwright.config.ts`, `tools/check-repo-rules.mjs` |
| O3 | `visual-update.yml` (ver (d) e (e)) | `.github/workflows/visual-update.yml` |
| O4 | Núcleo nos 3 motores (28 capturas por motor no Firefox e no WebKit; 57 no Chromium, com a matriz de tema, `forced-colors` e `prefers-contrast`) e o playground do demo | `e2e/visual/*.spec.ts`, `apps/demo/e2e/visual/` |
| O5 | Jobs `visual` e `visual-demo` em `ci.yml`; os dois em `.github/branch-protection.json` | `ci.yml` |
| O6 | Projetos `mobile-chromium` (Pixel 7) e `mobile-webkit` (iPhone 15), marca `@mobile`, `@cdp` fora do WebKit | `e2e/playwright.config.ts`, `e2e/angular/editor-mobile-*.spec.ts` |
| O7 | Menus e lista do `/` posicionados pela viewport visual (`readViewport`, `RteViewportWatch`) | `packages/angular/src/floating/` |
| O8 | `editor-aria-snapshot.spec.ts` (N61), 11 testes, o mesmo YAML parcial nos 3 motores | `e2e/angular/` |
| O9 | Roteiro manual de leitor de tela (execução do dono) | `docs/quality/roteiro-leitor-de-tela.md` |
| O10 | Matriz de navegadores no README raiz, com os mínimos por recurso como informativos (MDN browser-compat-data 8.1.5, consulta de 2026-10-08) | `README.md` |
| O11 | Degrau quente: o adendo do CI Linux não mostra degrau; **rodada ociosa local pendente** (seção (g)) | ADR 0016 |
| O12 | `perf-baseline.yml` + `tools/perf-gate.mjs` (ver (f)) | `e2e/perf/baseline.linux.json` |
| O13 | Pisos de cobertura por pacote: angular 88/77, core 95/87, render 87/70, sanitizer 93/87, theme 96/90 (linhas/ramos; `floor(medido no ADR 0019) − 3`) | `tools/coverage-floor.json`, `tools/quality-summary.mjs` |
| O14 | Menu da tabela: saída (b), aceito com prova (seção (c)) | N60 |
| O15 | Tabela §4 da spec com evidência e dono; spec 08 fechada, salvo o roteiro executado | `docs/specs/08-qualidade.md` §6 |

### (b) Desvios e fatos registrados pelas tarefas

- **Gatilho `push` temporário** em `visual-update.yml` e `perf-baseline.yml`: `workflow_dispatch` só dispara de um workflow que já existe no branch padrão. As baselines nasceram de pushes em `feat/spec-08b*` e `visual-bootstrap/**`; o último commit da 08b removeu o gatilho e `BOOTSTRAP` virou `false` nos testes. Depois do merge, a atualização é só por `workflow_dispatch`.
- **`RTE_VISUAL_DRYRUN=1`** confere estados e esperas sem capturar, só local (o Windows não gera baseline); nunca em workflow (teste em `test:tools`).
- **Sem fontes embutidas** (desvio da L1): a imagem fixa já fixa as fontes; uma fonte OFL abriria o _gate_ de licenças e mudaria o que o consumidor vê.
- **Espera de imagens com teto de 2 s:** o Firefox não dispara `load` em imagens preguiçosas fora da tela (primeira rodada: 71 ok, 10 falhas só no Firefox).
- **Desvios da O4:** o erro de envio só é anunciado pela região viva (fora da tela), sem captura; nomes de arquivos de envio são trocados no DOM antes da captura; o aviso de rascunho usa relógio fixo (`page.clock`).
- **Tolerâncias:** nenhuma afrouxada por teste; a global é a da spec (0,2 e 10 pixels). Nenhum `mask`.
- **`visual.mjs`** usa volume nomeado para `node_modules` no contêiner (binários do host são de outra plataforma) e sonda `docker info` (CLI sem daemon também sai com 2).
- **`visual-demo`** baixa o artefato `demo-static`; o `visual-update.yml` reconstrói o demo (`consumer.mjs pack prepare install build`), determinístico e independente do `ci.yml` da mesma ref.
- **Proteção de branch** (`visual` e `visual-demo` incluídos) **não aplicada** (seção (h)).
- **N61:** `aria-describedby` e `aria-activedescendant` não aparecem na árvore do `toMatchAriaSnapshot`; foram conferidos por atributo/nome acessível. O editável **não** tem `aria-describedby` dos contadores (só vem da entrada `ariaDescribedBy`); o plano supunha que tinha.
- **N40/N62 (pagehide):** a restrição ao Chromium saiu; os testes passam sem disparo manual nos 3 motores (o `beforeunload` do reload é entregue nos 3). O fallback `pagehide-manual` continua no teste como anotação, e **reprova no CI** no Chromium (revisão final); no `report.json` do CI a anotação não deve existir.
- **N64:** envio em rede lenta (Chromium, CDP, ~100 kbps, WebM de 200 KB): o `<progress>` cresce, a região viva **não** anuncia percentual (E8/ADR 0013) e o cancelamento a meio aborta.
- **Pinça por CDP:** `Input.synthesizePinchGesture` só funciona sem `gestureSourceType`; fica no `mobile-chromium` (a prova principal é o unitário com `visualViewport` falso).
- **Axe no celular:** dois falsos positivos conhecidos de `scrollable-region-focusable` (o `.tableWrapper` dentro do editável e a lista do `/`, que o axe não reconhece como popup porque o editável é `textbox`, não `combobox`). Filtrados só nesses alvos (seletor ancorado em `(\.tableWrapper|-slash-list)$`); a mesma regra em outro elemento continua reprovando.
- **WebKit móvel do Playwright ≠ Safari do iOS:** sem teclado real nem alças de seleção; o aparelho real é o roteiro.
- **Versões dos motores:** repórter próprio (`e2e/helpers/versions-reporter.ts`, só no CI) grava `browser.version()` em `e2e/test-results/browsers/<projeto>.json`; `quality-summary` ganhou a seção Navegadores.
- **Foco do aviso de rascunho** (pendência do ADR 0014): `setAvailable(null)` devolve o foco ao editável só se o foco estava dentro do aviso; foco em outro campo não é roubado.
- **perf-baseline.yml:** o servidor do app de teste sobe uma vez e é reaproveitado nas 30 rodadas (`RTE_E2E_REUSE_SERVER=1`); sem isso a segunda execução falhava com "already used".

### (c) O14: menu da tabela cobrindo o parágrafo seguinte

N60 nos 3 motores com geometria fixa: Chromium, Firefox e WebKit dão a **mesma** geometria e o **mesmo** `placement` (`below`). Âncora = o `.tableWrapper` (não o `<table>`, que daria 16 px a mais); o menu fica em `âncora.bottom + 8` e cobre a metade do parágrafo seguinte. É a saída (b) da spec: o recuo previsto da M9 (sem espaço acima), **aceito como UX**. Prova de alcance: `Escape` oculta o menu (M6) e clicar no parágrafo coberto move o cursor para lá e o menu some (M4). Sem diferença de medida entre motores, nada a corrigir em `place.ts`/`anchor.ts`. Pendência do ADR 0010 fechada.

### (d) Limitações do O7 (viewport visual)

- Os **menus da barra** (`toolbar/menu.ts`, fechados por clique ou rolagem) seguem pela viewport de **layout**; só os menus flutuantes e a lista do `/` usam a viewport visual.
- Um menu **mais largo que a viewport visual** (zoom extremo) não cabe nem acima nem abaixo e cai no _overlay_ de `positionFloating` (comportamento herdado).
- Simular o teclado mexendo no DOM provaria o simulador: o teclado do sistema, a autocorreção e a composição ficam no roteiro (seção "Seção móvel real").

### (e) Regeneração das capturas e segurança dos workflows (revisão final)

- **`--update-snapshots=changed`**, não `all` após `rm -rf`: apagar e regravar tudo substituía todo PNG por uma versão regerada, com qualquer ruído do rasterizador. O PNG **não é** garantidamente determinístico entre máquinas (o Skia escolhe rasterizadores por CPU); a promessa é só "imagem dentro da tolerância não é regravada". Capturas **órfãs** (sem teste) saem à parte: `expectShot` anota em `RTE_VISUAL_USED` as baselines usadas e `node tools/visual.mjs prune` apaga as demais, só depois de uma rodada inteira verde (arquivo vazio ou ausente não apaga nada).
- **Skia:** `--disable-skia-runtime-opts` nos projetos `visual-chromium` e `visual-demo-chromium`, para o PNG não depender do conjunto de instruções da máquina (o CI já passou por EPYC 7763 sem AVX-512 e por EPYC 9V45 com AVX-512; o `visual-update.yml` registra o modelo do CPU e as flags `avx512` no log). Regerar com o _flag_ não mudou nenhuma captura do Chromium além do playground (que ficou menor, ver abaixo): as 110 comparações da rodada 37828841294 passaram contra as baselines existentes, e uma segunda rodada não gerou _commit_.
- **Playground do demo:** a captura da página inteira ficava em 287/274 KB (teto de 300 KB); passou a capturar só a prévia do editor (40 KB cada).
- **Escrita nos workflows:** `visual-update.yml` e `perf-baseline.yml` fazem `checkout` com `persist-credentials: false`; o `github.token` só existe no passo de commit (cabeçalho `http.extraheader` do git, nunca gravado em `.git/config`), de modo que `npm ci` e os testes rodam sem credencial de escrita. `git pull --rebase origin "$BRANCH"` e _push_ com até 3 tentativas (a corrida entre os dois workflows no mesmo _branch_ já aconteceu: o _commit_ da baseline foi rejeitado por _non-fast-forward_). A guarda normaliza `${TARGET_BRANCH#refs/heads/}` e recusa `main`, `master`, `HEAD`, vazio e o branch padrão do repositório (`github.event.repository.default_branch`, via `env`). Nenhum `${{ }}` dentro de `run:` (conferido por `tools/visual-update-workflow.test.mjs`, que cobre os dois workflows).

### (f) Desempenho: baseline, regra e o que ela não garante

- Baseline do N45 do CI Linux (`e2e/perf/baseline.linux.json`, run 37822212209: 10 execuções por motor, AMD EPYC 9V45; Chromium 153, Firefox 155, WebKit 26.6).
- **Só 1 de 21 métricas tem CV ≤ 3%** e entra na regra: `chromium / criação mediana` (CV 2,67%, mediana 99,3 ms). As demais p95 têm CV de 4,8% a 11,1% e Firefox e WebKit não têm métrica gateável. Uma VM compartilhada não dá a estabilidade que a regra dos 10% pressupõe.
- **Mudança da revisão final:** a regra vira **aviso** por padrão (`::warning::` e seção "Avisos" do resumo); `RTE_PERF_GATE_ENFORCE=1` a torna bloqueante. O critério é `Δ > max(10%, 3·CV)` e `Δ ≥ 2 ms` nas duas voltas. Motor (major) ou CPU diferente da baseline, ou baseline ausente, continua só informativo. Como `ci.yml` rodava o N45 em paralelo com o resto do `verify` (condições diferentes das da baseline, que roda com 1 worker), o N45 saiu da execução geral (`--grep-invert "N45"`) e roda num passo isolado (`--workers=1 --retries=0`, pasta de saída à parte para não apagar o `report.json`).
- **Evolução registrada, não feita:** uma baseline com matriz de VMs (várias execuções em máquinas diferentes, mediana das medianas) é o que permitiria tornar a regra bloqueante com honestidade; hoje a baseline vem de um único tipo de CPU e o CI pode cair em outro.
- **Rodada ociosa do O11 (pendente do dono):** `RTE_PERF_ENFORCE=1 npx playwright test -c e2e e2e/angular/editor-perf-budget.spec.ts --project=chromium --workers=1` em máquina ociosa (na tomada, sem outras cargas, 5 min parada); registrar aqui os números de tecla fria/quente, criação e busca, e a conclusão (ambiente × degrau). `TODO-AUTOR`.

### (g) Execuções do roteiro

Nenhuma ainda. `TODO-AUTOR`: executar o [roteiro](../quality/roteiro-leitor-de-tela.md) nas cinco combinações obrigatórias antes da 1.0 (spec 09) e colar aqui um bloco do "Modelo de registro" por combinação, com o resultado da K4 (aceita/reprovada).

### (h) Pendentes com dono

- **Execução do roteiro** (acima) e a **rodada ociosa do O11**: dono, antes da 1.0 (spec 09).
- **Proteção do branch `main`**: não aplicada (só com confirmação do dono). Com `visual` e `visual-demo` além dos quatro de antes, o comando (com o PAT de arquivo temporário, nunca no repositório):

  ```bash
  curl -X PUT -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/GustavoALDev/cds-text-editor/branches/main/protection \
    --data @.github/branch-protection.json
  ```

  Antes, confirmar que os seis checks já aparecem em um PR (um check exigido que nunca foi reportado trava o merge). "Pipeline obrigatório para merge" fica pendente na spec 08 até a confirmação.
- **Hidratação incremental** do `rte-render`: fora pela CSP (ADR 0012).
- **Motores antigos** (pendência dos ADRs 0010–0013): fora da política de navegadores, sem verificação.

## Consequências

- Um PR que muda CSS pede baseline nova (`visual-update.yml` no próprio branch) e o motivo na descrição; a revisão é pelo diff de imagem.
- Atualizar o Playwright = versão exata + tag da imagem + capturas + baseline de desempenho no mesmo PR; até lá o `perf-gate` fica informativo (motor diferente).
- Baselines nunca no Windows ou no macOS; sem Docker o caminho é o `visual-update.yml`.
- O `perf-gate` avisa, não bloqueia, até existir baseline com matriz de VMs.
- Riscos aceitos: WebKit móvel ≠ Safari do iOS; o rasterizador pode mudar entre versões da imagem (daí a tag exata); a corrida entre workflows de escrita no mesmo branch é absorvida pelo `pull --rebase` com tentativas.
