# CLAUDE.md

Monorepo `cds-text-editor`: editor de texto rico para Angular 22+ sobre Tiptap 3 (Nx 23 + npm workspaces). Pacotes em `packages/`: `core`, `sanitizer`, `theme` (build com tsup) e `angular`, `render` (build com ng-packagr). Decisões em `docs/decisions/` (ADR 0001).

## Regra principal

**Nenhum recurso é feito sem teste automatizado e verificação em navegador real.**

## Fluxo de trabalho

spec → plano (`writing-plans`) → implementação → verificação. As specs ficam em `docs/specs/`; `docs/specs/README.md` é o índice e define a ordem.

## Comandos

```bash
npm ci                                                  # instalar (use o lockfile); exige npm >= 11 (engine-strict)
npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size       # lint, build, testes e npm pack + publint + attw
npm run check:rules                                     # regras do repositório (tools/check-repo-rules.mjs)
npm run check:licenses                                  # gate de licenças
npm run check:pack                                      # verify-package em todos os pacotes
npm run check:size                                      # orçamento de tamanho por cenário (nx run theme:size, tools/check-size.mjs; no angular o rollup divide o entry `.` num reexportador mais um chunk compartilhado: `editor`/`whole` usam `externalChunks: "dynamic"` (só os `import()` ficam fora; `true` deixaria o chunk compartilhado fora e o entry mediria ~0) e os chunks do `@defer` usam `externalChunks: true` com `entry` com `*`)
npm run test:tools                                      # testes de tools/
npm run notices                                         # regenera THIRD-PARTY-NOTICES.md
npx playwright test -c e2e                              # E2E nos 3 navegadores (chromium, firefox, webkit); --project=firefox para um só
e2e/with-browser-libs.sh npx playwright test -c e2e     # idem em WSL/Ubuntu sem sudo (libs em ~/.cache/playwright-libs; ver e2e/README.md)
npx nx test theme                                       # unitários + propriedade do tema; FC_SEED=<n> FC_RUNS=<n> mudam a semente/execuções do fast-check
npx changeset                                           # registrar mudança de pacote
UPDATE_FIXTURES=1 npx nx test core --skip-nx-cache     # regenera fixtures/content/all-features.json (drift do JSON do fixture)
```

CI: `.github/workflows/ci.yml` roda no PR e no push para `main` (check:rules, test:tools, notices sem drift, `nx affected -t lint typecheck build test verify-package size`, check:licenses (depois do build, para ler o `dist`), `typecheck:e2e`, E2E nos 3 navegadores com `playwright install --with-deps`).

Ambiente: `/tmp` pode ser um tmpfs pequeno; use `export TMPDIR=$HOME/.cache/tmp` (e `NX_DAEMON=false` se o daemon do Nx atrapalhar).

## Core (`packages/core`)

- Entries: `/` (esquema, links, títulos, texto, imagem, rascunho, paleta, `isAllowedClass`), `/embeds` (`toEmbed` e provedores), `/html` (`htmlToText`, `extractToc`, `validateHtml`, `inspectRteHtml`; único com `htmlparser2`), `/extensions` (extensões Tiptap, `createEditorExtensions`, `getRteHtml`/`serializeRteHtml`) e `/code-languages` (gramáticas do `highlight.js` sob demanda), mais o arquivo `styles/content.css` (aparência do conteúdo `rt-*`, compartilhada entre o editor e a spec 06). Só `/extensions` e `/code-languages` importam `@tiptap/*`/`lowlight`/`highlight.js` (lint); esses pacotes são peers opcionais do core e devDependencies exatas na raiz.
- Fixtures de conteúdo compartilhados em `fixtures/content/` (raiz): `all-features.html` (escrito à mão, ponto fixo de `getRteHtml`), `all-features.json` (gerado; regenerar com `UPDATE_FIXTURES=1 npx nx test core --skip-nx-cache`) e `tolerant-cases.json` (leitura tolerante, no Vitest e no Playwright). Consumidos pelas specs 04 e 06 sem importar código do core.
- Testes do editor em `packages/core/extensions/src/*.spec.ts` com `// @vitest-environment jsdom`; navegador real em `e2e/core/editor-*.spec.ts`.
- `docs/html-schema.md` é gerado do esquema e conferido por teste; regenerar: `UPDATE_SCHEMA_DOC=1 npx nx test core --skip-nx-cache`.
- Orçamento de tamanho por cenário em `packages/core/size-budget.json` (`nx run core:size`). Decisões: ADR 0003 (esquema) e ADR 0004 (extensões).

## Sanitizador (`packages/sanitizer`)

- Entry único `.` (`sanitizeRichText`, `createSanitizer`, `RteSanitizeError`); engine própria sobre `htmlparser2`, sem allowlist própria (tudo vem do esquema do core pelos interpretadores do entry `.`). Importa só `@cds/rte-core` (`.`) e `htmlparser2`; os testes podem usar `@cds/rte-core/html`.
- Testes em `packages/sanitizer/src/*.spec.ts` (ambiente `node`; `xss.spec.ts` com o corpus de `src/testing/xss-corpus.ts`; `properties.spec.ts` com `FC_SEED`/`FC_RUNS`); cobertura mínima 95% (`cd packages/sanitizer && npx vitest run --coverage`); navegador real em `e2e/sanitizer/`.
- Orçamento de tamanho por cenário em `packages/sanitizer/size-budget.json` (`npx nx run sanitizer:size`; o `npm run check:size` só confere o tema). `fixtures/content/editor-corpus.json` é gerado pelo core: `UPDATE_FIXTURES=1 npx nx test core --skip-nx-cache`.
- Decisões: ADR 0006; modelo de ameaças em `docs/security.md`. Mudar o esquema, `sanitizeStyle` ou `serializeTokens` afeta a segurança e exige changeset.

## Tema (`packages/theme`)

- Testes de navegador do tema: `e2e/theme/*.spec.ts` (contraste, ΔE plano B × nativo, comportamentos, CSP, SSR); o harness/fixtures ficam em `e2e/theme/helpers/` e `e2e/fixtures/`.
- `theme.css` e o plano B em TypeScript (`derive.ts`, `create-theme.ts`) **precisam andar juntos**: qualquer mudança de fórmula ou constante vai nos dois. As constantes de calibração (ganho e limiar do degrau, tetos L/C dos neutros `NEUTRAL_SPEC`, `STATE_AMOUNTS`, `TEXT_TARGETS`, `MIX_PCT`, tokens estáticos) são conferidas literal a literal entre CSS e TS por `theme-css.spec.ts`; as fórmulas, pelo golden (`tools/gen-theme-golden.mjs`) mais o E2E de equivalência (`e2e/theme/fallback-equivalence.spec.ts`), que sozinho não enxerga mudanças abaixo da quantização de 8 bits.
- As fórmulas de `docs/specs/referencias/t6-tema` têm 4 desvios documentados (matriz OKLab, degrau do `on-*`, limiar 0,1791005, mistura em OKLab): ver ADR 0002, "Desvios da fórmula do spike".
- Orçamento de tamanho por cenário em `packages/theme/size-budget.json` (`npm run check:size`).

## Angular (`packages/angular`)

- Entries: `.` (`RteEditor` com `openDialog(kind)`, `provideRichText`, `RTE_LABELS`, `RTE_LABELS_EN`, `RTE_TOOLBAR_PRESETS`, `RTE_DIALOG_LANGUAGES`, `RteDialogKind`, `focusFloatingMenu()` e a entrada/provider `floatingMenus`), `/i18n`, `/validators` (único que importa `@cds/rte-core/html`; também `rteUploadsFinished`/`rteImagesHaveAlt` e as diretivas), `/upload` (`httpUploadAdapter`; sem `@angular/*` em tempo de execução nem import do principal), `/testing` (`getRteEditor`) e o arquivo `styles/editor.css` (só o funcional da edição, a barra e os menus). A aparência do conteúdo `rt-*` fica em `packages/core/styles/content.css`; ordem de inclusão: `theme.css` → `content.css` → `editor.css`. Barra, foco itinerante e menus em `popover` são próprios (`src/toolbar/`, sem `@angular/aria`/CDK). Ícones Lucide incorporados: o aviso fica em `tools/third-party-embedded.json` (vira seção de `THIRD-PARTY-NOTICES.md`). Sem CVA: Reactive/Template Forms usam o caminho nativo do `FormValueControl` (Angular >= 22.2.1).
- Comandos: `npx nx test angular` (zoneless) e `npx nx test-zone angular` (a mesma suíte com `zone.js`); um arquivo: `npx nx test angular --include=<arquivo>.spec.ts` (relativo a `packages/angular/src`); `npx nx run angular:size` (orçamento em `packages/angular/size-budget.json`); app de teste: `npx nx run angular-e2e-app:serve-static` (build + servidor com CSP estrita; `e2e/angular/serve.mjs`). O `vitest-base.config.mts` do pacote (`runnerConfig`) dá 30 s de `testTimeout`/`hookTimeout`.
- Todos os testes unitários ficam em `packages/angular/src/**/*.spec.ts` (inclusive os de `/i18n`, `/validators` e `/testing`, importando pelo alias público); ajudantes em `src/testing-support/` (fora do build). Arquivo que precisa de Node puro começa com `// @vitest-environment node`. O builder roda com `isolate: false`: estado de módulo é compartilhado, então testes zeram as sondas que leem.
- Navegador real: `e2e/angular/editor-*.spec.ts` contra o app de teste em `e2e/angular/app`. O `webServer` do Playwright compila os dois apps (zoneless e zone.js) a cada rodada: a frio leva até ~10 min; use `--workers=4`. No Windows o Firefox com 4 workers às vezes trava: repita o spec com `--project=firefox --workers=2` (ver `e2e/README.md`). Specs da barra e do tema: `e2e/angular/editor-toolbar-*.spec.ts`, `editor-theme.spec.ts` e `editor-content-css.spec.ts`. Menus flutuantes: `e2e/angular/editor-floating*.spec.ts` (rota `floating` do app, com contêiner de rolagem e segunda instância).
- Grafo: `angular` depende de `core` e `theme` (tag `scope:angular`; `applyRteTheme`/`warnIfPoorTheme` no tema por instância, spec 05b1 U15); `render` de `core` e `sanitizer`. Guardas por lint (D25): sem `@Input`/`@Output`/`@HostListener`/`@HostBinding`, `ngOnChanges`, `zone.js`, globais de DOM, texto literal em template; componentes OnPush, `ViewEncapsulation.None`, `templateUrl`, sem `styles`.
- Diálogos (`src/dialogs/`, `<dialog>` modal carregado por `@defer` num chunk separado, `fesm2022/cds-rte-angular-rte-dialogs-<hash>.mjs`): testes com `installDialogShim()` (`src/testing-support/`); E2E `e2e/angular/editor-dialogs*.spec.ts` (rota `dialogs` do app). Os menus flutuantes (`src/floating/`) também ficam num `@defer` (`fesm2022/cds-rte-angular-rte-floating-menus-<hash>.mjs`; o `RteEditor` os consulta pelo token `RTE_FLOATING_MENUS`, nunca pela classe; teste `floating-defer.spec.ts`; `Escape` é uma extensão Tiptap de prioridade mínima, `floating/escape-extension.ts`). Cenários de tamanho `editor`/`whole` medem sem os chunks; `dialogs` e `floating` medem cada chunk.
- Envio de arquivos (spec 05c2a, `src/upload/`): config, validação, rótulos, `input.ts` (colar/soltar mínimo, prioridade 1100, sempre `preventDefault` em arquivo solto) e a fachada (`facade.ts`, `editor-bindings.ts`: `uploads`/`pendingUploads`/`imagesMissingAlt`, gestos em buffer antes do chunk) ficam no principal; a maquinaria (gerenciador, marcadores, ordem, chegada, progresso, leitura da resposta `response.ts`, bandeja `upload-tray`, `rte-upload.ts`) fica no chunk `fesm2022/cds-rte-angular-rte-upload-<hash>.mjs`, carregado por `import()` só com config de upload (`forbiddenContent` do `check-size` guarda a fronteira; sem nova tentativa após falha de carga). Os formulários de imagem/vídeo/embed ficam no chunk `rte-media-forms` (`@defer` próprio dentro do `<dialog>`, pré-carga em ocioso); o principal não importa `@angular/forms` (guarda `forbiddenImports`). Cenários de tamanho `media`, `upload` (entry) e `upload-runtime` (chunk). App de teste: rotas `upload` e `upload-preview` (CSP com `img-src blob:`), `/__upload` no `serve.mjs`; E2E `e2e/angular/editor-upload-{dialog,paste-drop,states,forms,a11y}.spec.ts` e `editor-media-chunk.spec.ts`. Decisão: ADR 0013 (`docs/decisions/0013-envio-de-arquivos.md`).
- Rascunho e salvamento (spec 05c2b): rascunho em `src/draft/` no chunk `fesm2022/cds-rte-angular-rte-draft-<hash>.mjs` (`@defer` do aviso `<rte-draft-prompt>` + carregador `RTE_DRAFT_LOADER`, só com `draftKey`; o cenário de tamanho `draft` o mede e `forbiddenContent` guarda `__rte_draft_probe__` fora do principal); opções `draftKey`, `draft` (provider), `warnOnUnsaved`, `pasteEmbeds`, `upload.rehostExternal`/`ownHosts`; `isDirty`/`markSaved`/`onMediaRemoved` no principal; re-hospedagem no chunk `rte-upload`. E2E: `e2e/angular/editor-draft.spec.ts`, `editor-draft-save.spec.ts` (N40 só no Chromium) e `editor-paste-external.spec.ts`; rota `draft` do app de teste. Decisão: ADR 0014 (`docs/decisions/0014-rascunho-e-salvamento.md`).
- Diálogos de mídia (`image`/`video`/`embed`, spec 05c1): um componente por formulário em `src/dialogs/forms/` (todos estendem `RteDialogFormBase`; ajudantes em `dialogs/form-helpers.ts`, `media-validate.ts`, `media-rules.ts`, `apply-media.ts`); só no chunk `rte-dialogs` (sem `@cds/rte-core/embeds`), os menus de vídeo/embed só no `rte-floating-menus`. Entry `.`: saída `mediaChange` e `mediaSession` (`RteMediaChange`/`RteMediaSession`, `src/editor/media-session.ts`, rastreador incremental). Botões de `.rte-dialog__actions` seguram o foco do campo (`mousedown` com `preventDefault`). Navegador real: rota `media` do app de teste (CSP com `img-src`/`media-src`/`frame-src` só nela, `e2e/angular/serve.mjs`) e `e2e/angular/editor-media-*.spec.ts` (`image`, `video-embed`, `menus`, `session`, `a11y`, `perf`; mídia de teste `e2e.webm`/`e2e.vtt`, sem MP4).
- Menu `/`, busca e contadores (spec 05d1): `src/slash/` (lista no chunk `fesm2022/cds-rte-angular-rte-slash-menu-<hash>.mjs`; ARIA do editável por `afterRenderEffect` direto no DOM, `textbox` + `aria-activedescendant`, sem `combobox`), `src/search/` (barra no chunk `rte-search`, `Mod-F`/`F3`; é o bloco `@defer` 0 e a lista do `/` o último) e `src/counters/` (rodapé e anúncios do limite, no principal); os dois chunks compartilham o chunk `viewport-watch`. `search` e `slashCommands` vêm ligados por padrão (fim do D1). Validadores `rteSafeLinks`/`rteNoEmptyHeadings` em `/validators` sobre `inspectRteHtml`. Cenários de tamanho `slash-menu`, `search` e `overlay-shared` (chunks); `i18n` e `validators` com tetos próprios. E2E: rota `productivity` do app de teste e `e2e/angular/editor-slash.spec.ts`, `editor-search.spec.ts` e `editor-counters.spec.ts` (N42–N44). Decisão: ADR 0015 (`docs/decisions/0015-menu-busca-e-contadores.md`).
- Decisões: ADR 0007 (`docs/decisions/0007-componente-e-formularios.md`), ADR 0008 (barra e tema), ADR 0009 (diálogos), ADR 0010 (menus flutuantes), ADR 0011 (`docs/decisions/0011-midia.md`, mídia) ADR 0013 (`docs/decisions/0013-envio-de-arquivos.md`, envio de arquivos), ADR 0014 (rascunho) e ADR 0015 (menu `/`, busca e contadores).

## Render (`packages/render`)

- Entries: `.` (`RteContent` com `[rteContent]`/`mode`/`labels`, `renderedHtml()` e `error()`; `provideRteRender`, `RTE_RENDER_LABELS`, `RTE_RENDER_LABELS_EN`; `ɵinjectFragmentBase`/`ɵmergeRenderLabels` são internos, só para o `/toc`), `/toc` (`RteToc`, `RteTocEntry`; único que importa `@cds/rte-core/html`, logo o único com `htmlparser2`: o `.` fica sem ele), `/i18n` e o arquivo `styles/render.css` (rolador, sumário, `scroll-margin`, hosts com `--rte-text`/`--rte-surface`). Ordem de inclusão: `theme.css` → `content.css` → `render.css`. O código publicado **não** importa o `@cds/rte-sanitizer` (o sanitizador é injetado por `provideRteRender`); o HTML só entra no DOM por `bypassSecurityTrustHtml` em `src/content/rte-content.ts` (guardas H19 por lint, provadas por `lint-guards.spec.ts`).
- Comandos: `npx nx test render` (zoneless) e `npx nx test-zone render`; um arquivo: `--include=<arquivo>.spec.ts` (relativo a `packages/render/src`); `npx nx run render:size` (orçamento em `packages/render/size-budget.json`; `content-page` mede só `RteContent` e precisa ficar sem `htmlparser2`, `page` é a página completa com `@cds/*` embutidos via `size-page.mjs`). Testes em `packages/render/src/**/*.spec.ts` (e `toc/`, `i18n/`), ajudantes em `src/testing-support/`.
- Navegador real: `e2e/angular/render-*.spec.ts` (L1 segurança, L2 SSR/hidratação, L3 equivalência editor × página, L4 CSP/Trusted Types, L5 acessibilidade e rolador, L6 sumário e âncoras, L7 desempenho) contra as rotas `render`, `render/artigo` e `render-tt` do app de teste (`render-tt` ganha o cabeçalho de Trusted Types no `serve.mjs`). O `content.css` do core é compartilhado com o editor; o core exporta também `getTableSizing`/`parseColWidth`/`RTE_TABLE_CELL_MIN_WIDTH` (a exibição reproduz a dimensão da tabela com larguras de coluna).
- Grafo: `render` depende de `core` e `sanitizer` (tag `scope:render`); só `toc/src/**` importa `@cds/rte-core/html`. Decisões e rulings: ADR 0012 (`docs/decisions/0012-renderizacao.md`); modelo de segurança da exibição em `docs/security.md`.

## Convenções

- Grafo de dependências: `theme` e `core` não dependem de nenhum pacote do workspace; `sanitizer` depende só de `core`; `angular` de `core` e `theme`; `render` de `core` e `sanitizer`. Os limites são impostos por lint (tags `scope:*` em `eslint.config.mjs`).
- Proibido importar `@angular/*` em `core`, `sanitizer` e `theme`.
- Dependência entre pacotes só via alias de `tsconfig.base.json` (`@cds/rte-*`).
- `tsconfig.spec.json` de cada pacote usa `composite: false`.
- Typecheck: o `build` checa o código; os testes de `core`, `sanitizer` e `theme` são checados pelo target `typecheck` (`tsc -p tsconfig.spec.json --noEmit`) e os de `e2e/` por `npm run typecheck:e2e`.
- TypeScript 6: sem `baseUrl`; `paths` usam o prefixo `./`; os configs do tsup têm `dts.compilerOptions.ignoreDeprecations: '6.0'`.
- Idiomas: documentação em pt-BR; código e nomes públicos em inglês; mensagens das ferramentas (`tools/`, regras de lint) em pt-BR.
- Nomes de pacote `@cds/rte-*` são provisórios. Marcadores `TODO-AUTOR` indicam dados que só o autor conhece (`grep -rn TODO-AUTOR`).
- Sem segredos no repositório.
