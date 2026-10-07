# ADR 0016: Desempenho, orçamentos finais, relatórios de API e fechamento da spec 05

- Status: aceita (2026-10-07)
- Spec de origem: `docs/specs/05d2-desempenho-e-api.md` (parte 9 de 9 da spec 05)

## Contexto

A 05d2 prova com números que o `rte-editor` completo cabe nos orçamentos de desempenho, decide o `updateOn`/adiamento (Z5), refaz os orçamentos de tamanho, congela a superfície pública em relatórios do `api-extractor` e fecha a spec 05. Verificada no jsdom (zoneless e zone.js) e no Chromium local; os 3 navegadores e o Linux são a rodada do CI do PR.

## Decisão

### (a) Decisões da spec

Z1–Z15 valem como escritas na spec (fonte única). Desvios e achados abaixo.

### (b) Relatórios de API (Z6–Z8)

- **Motor:** `@microsoft/api-extractor` 7.59.4 (exato, raiz) sobre os `.d.ts` publicados (`dist`) dos 15 entries; o spike não achou incompatibilidade com o TypeScript 6.0.3 (o plano B pelo compilador não foi necessário). A instalação exigiu npm 11.
- **Referências entre pacotes:** `tools/api-report.mjs` cria junções temporárias em `node_modules` e `paths` para os `@cds/rte-*`, que entram como externos (sem isso viravam `ae-forgotten-export` falsos); a limpeza é garantida mesmo em falha.
- **Relatório:** o extractor sufixa `.public.api.md`; o script o renomeia para `<entry>.api.md` (`packages/*/api/`) e o compara à parte (`localBuild: true`). `UPDATE_API=1` regrava; sem ele, diferença falha (CI). Chunks com hash dão o mesmo relatório (teste em `tools/api-report.test.mjs`).
- **Cache do alvo `api`:** o desenho original dos `inputs` era cego à mudança (achado da revisão: o cache acertava com a API alterada). Correção: `production` + `^production` + `dependentTasksOutputFiles` (`**/*.d.ts`, transitivo) + `api/**` + o script + `UPDATE_API`.
- **Regra do `ɵ`:** todo export `ɵ` exige `@internal` (`check:rules`). Exceção da R6: `static ɵcmp/ɵfac` gerados pelo compilador do Angular nos `.d.ts` não podem ser marcados; o relatório falha com `ɵ` público fora desses estáticos.

### (c) Superfície pública

- Tipos usados pela API e antes não exportados passaram a ser exportados (aditivo) ou ficaram `@internal` (commit `59e90ea`): ajudantes do rodapé de contadores e do anunciador de limite, regras de mídia, tipos de alvo e do controlador de diálogos, tipos internos de `floating`, `slash` e `toolbar/state`, portas e tipos de `upload`, diretivas de upload em `/validators`; no `render`, `ɵinjectFragmentBase`, `ɵmergeRenderLabels`, `mergeRenderLabels` e internos de `rte-content`, `rte-toc` e `toc-tree`.
- Membros de template do `RteEditor` e dos componentes (usados só pelo HTML): `@internal`.
- `RteDialogController` e `RteCountValidator` são exportados **como valor** com `@internal`: o rollup do ng-packagr perde `export type` de classes e o `.d.ts` precisa bater com o JS.
- Core: `RteTokensRule` exportado (antes `TokensRule` era um tipo local não exportado: sem quebra, sem alias).
- Os reexports dos tipos do esquema em `/html` e `/extensions` duplicam a superfície nos relatórios; aceito.
- Guarda `internalLeaks()` no script: falha se um tipo `@internal` vaza em assinatura pública.

### (d) Desempenho (Z1–Z5)

Chromium local, `--workers=1`, máquina com carga leve; números **preliminares** (`docs/superpowers/plans/2026-10-07-angular-05d2-notas.md`).

| Medida                                       | Mediana (ms) | p95 (ms)     | Orçamento (ms)         |
| -------------------------------------------- | ------------ | ------------ | ---------------------- |
| Base N8 (sem `?full`), frio                  | 10,8 a 13,0  | 15,8 a 25,8  | n/a                    |
| Completo frio, com render                    | 15,2 a 16,1  | 20,1 a 25,0  | 50                     |
| Completo quente (teclas 251–300), com render | 45,7 a 62,7  | 61,8 a 68,3  | 50                     |
| Busca capada ("1000+")                       | 14,4 a 16,2  | 20,8 a 22,3  | 50                     |
| Criação completa                             | 81 a 102     | 100 a 143    | 300                    |
| Criação vazia, `minimal`                     | 9,3 a 9,5    | 12,6 a 13,6  | 50                     |
| INP (teclado real)                           | 56 a 96      | n/a          | 200 (p98, conservador) |
| Gravação do rascunho                         | 0,9 a 2,5    | n/a          | 16                     |

- **Degrau quente:** depois de ~150–200 transações tudo sobe junto (~3,5x: `dispatch` 3,6 para 12 ms, leitura de `valid` 7,7 para 27 ms, `tick` 2,8 para 10 ms); o p95 quente (~62 a 68 ms) passa de 50. Não é GC (coleta forçada a cada 50 teclas não o remove). Ceder ao navegador entre as teclas (`setTimeout(0)` fora da medida) também não o remove. Um laço de CPU sem relação com o editor (2 milhões de iterações) foi de 2,0 para 7,5 ms (~3,7x) no mesmo ponto: o degrau é do ambiente (CPU sob carga sustentada), não do pacote.
- **Decisão (Z5):** `valueEmission` **não** acionada; a emissão síncrona do D8 segue a única; orçamento de 50 ms mantido. Ele só reprova com `RTE_PERF_ENFORCE=1`, que é só local (no CI é informativo, Z4).
- **Pendência com dono:** confirmar no CI Linux e em máquina ociosa (spec 08). Se o degrau se confirmar fora desta máquina, reabrir a Z5: `valueEmission: 'idle'` corta ~70% do custo.

### (e) Criação e destruição (Z9–Z11)

Mediana por ciclo, jsdom, `minimal` (30 ciclos): `show.set` até o construtor 8 ms; construtor até `afterNextRender` 28 (`full`: 115); `createEditorExtensions` ~3; `new Editor` até `editorReady` ~23 (extensões 7, `EditorView` 10); até estabilizar (`@defer` dos menus) ~50; total 109 a 143 (com `[floatingMenus]="false"`: 60); destruição 0,4. O custo evitável aparente é a renderização dos 6 menus flutuantes (~50 ms no jsdom); no Chromium `editorReady` e `.rte-floating` coincidem (17,8 ms, barra `full`), então é custo do DOM do jsdom e não foi alterado (refatorar arriscaria N21–N24). Sem ouvinte de `document`/`window` nem temporizador sobrevivendo à destruição (`editor.listeners.spec.ts`).

- **Z10:** `editor.lifecycle.spec.ts` sem o `90_000`, com guarda de crescimento (mediana dos 10 últimos ciclos <= 3x a dos 10 primeiros); 100 ciclos cabem no timeout padrão.
- **N46 (desvio da Z11):** a referência é o estado **depois do aquecimento** (a primeira criação difere do estável: 14 popovers/563 nós contra 13/533). Chromium, 100 alternâncias depois de 10: heap depois de GC 7,5, 8,6 e 9,0 MB (aquecimento, 50, 100; delta 50 a 100 = 0,40 MB, limite 1 MB); `JSEventListeners` 316 constante; `Editor` vivo 0 com o editor escondido.
- **Retenção pelo Signal Forms:** com `[formField]`, o último `Editor` destruído fica vivo até o próximo `FormField` ser criado (sinal de módulo, `computed` do `FieldNode`, `FormField.destroyRef`). É comportamento do Angular, constante (1 vivo após 100 ciclos); por isso o N46 usa a rota `lifecycle` sem formulário.

### (f) Tamanhos finais (Z12, D26)

`ceil(medido x 1,15 / 64) x 64` sobre o build final (commit `fbbd9a4`); só mudaram:

| Pacote / cenário                    | Antes             | Depois            |
| ----------------------------------- | ----------------- | ----------------- |
| angular `editor`                    | 39168             | 43520             |
| angular `whole`                     | 39360             | 43712             |
| angular `floating`                  | 8576              | 7424              |
| angular `slash-menu`                | 2048              | 2240              |
| angular `search`                    | 2944              | 3200              |
| core `whole`                        | 10560             | 10944             |
| core `schema`                       | 6272              | 6336              |
| core `links`                        | 3136              | 3264              |
| core `html`                         | 35712             | 36224             |
| core `extensions`                   | 39680             | 40448             |
| theme `whole`                       | 6656              | 6784              |
| theme `parse` / `presets` / `check` | 2048 / 512 / 4608 | 1984 / 448 / 4992 |

O salto do `editor` vem do que as partes 05b2 a 05d1 colocaram no principal (ARIA, contadores, upload, rascunho).

### (g) Pendências da spec 05 (com dono)

- **CI do PR (3 navegadores):** N1–N46, suítes e E2E em Chromium, Firefox e WebKit; INP só no Chromium. Dono: o CI do PR da 05d2.
- **Degrau quente:** confirmar fora desta máquina e, se persistir, reabrir a Z5. Dono: spec 08.
- **Leitores de tela reais** (menu `/`, busca, barra, diálogos) e teclado virtual. Dono: spec 08.
- **Demo, site de docs e exemplos de servidor.** Dono: spec 07.
- **Congelamento para release, versão 1.0 e publicação** (os relatórios `api/` são a base). Dono: spec 09.

## Consequências

- **Toda mudança de API pública** atualiza o relatório no mesmo commit (`UPDATE_API=1`); o CI falha com relatório desatualizado.
- Mudança que afete o custo por tecla ou de criação roda o N45 com `RTE_PERF_ENFORCE=1`.
- Changesets: `minor` para `@cds/rte-angular` e `@cds/rte-core` (tipos novos exportados), `patch` para `@cds/rte-render` (só `@internal`/JSDoc).
