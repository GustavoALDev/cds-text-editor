# API estável 09c — API estável, versionamento sem publicação e prontidão para a 1.0: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Executar num branch criado do `main` depois do merge da 08b (PR #24), num worktree com `node_modules` PRÓPRIO** (a T1 instala tarballs e muda `package.json`/lockfile; nunca numa junção de `node_modules` para outro worktree). Conferir antes: `ls -la node_modules` (se for junção, `npx -y npm@11 ci` próprio); `ls docs/decisions` (o desta parte é o **0023**; o 0022 fica reservado à 09b; **a spec exige a 07d mesclada e o ADR 0020 existe** — se `docs/decisions/0020*` ou o guia da 07d (`apps/docs/content/guia/` com mais que `configuracao`, `inicio-rapido`, `instalacao`) faltar no `main`, PARAR e avisar o dono: as renomeações da AP3 tocam o guia); `git log --oneline -3` mostra a 08b.

**Goal:** fechar a superfície pública dos 5 pacotes (TS, CSS, HTML gravado) num estado prometível por semver, com dependências internas exatas, versões planejadas e verificáveis (`0.1.0` nos 5, sem publicar), política de suporte/depreciação escrita, guardas de API no CI e uma lista "pronta para 1.0" que separa o que é do agente do que é do dono.

**Architecture:** só `package.json`/config, renomeações mecânicas, JSDoc, três ferramentas novas em `tools/` (`css-api.mjs`, `api-diff.mjs`, `release-plan.mjs`, todas puras e testadas por `node --test`), regras novas no `tools/check-repo-rules.mjs` e documentos. Nenhum recurso novo, nenhum teste de navegador novo: as suítes existentes provam que a renomeação foi completa.

**Tech Stack:** Nx 23, npm workspaces (npm 11), tsup, ng-packagr, `@microsoft/api-extractor`, Changesets, `node --test`, Vitest, Playwright (Chromium local).

**Spec:** `docs/specs/09c-api-estavel-e-prontidao.md` (vinculante; AP1–AP15, R1–R8, §6 testes, §9 riscos). Contexto: `docs/specs/09-release-governanca.md`, `09b-publicacao.md` (adiada), ADR 0016 (relatórios de API; itens `@internal` reexportados), 0019 (matriz/relatórios), 0021.

## Global Constraints

- **Worktree/branch:** o do executor (criado do `main` pós-08b). `git add <arquivos>` por caminho, nunca `-A`/`.`/`-u`. Commits em pt-BR terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Sem push**: push, PR e merge são do fluxo do autor.
- **Decisões do dono, não reabrir:** `provideRichText` é MANTIDO (nem renomear nem alias); o componente segue `rte-editor`/`RteEditor`. Publicação no npm, nome/escopo do pacote (`@cds/rte-*` provisório), consumidor real, teste de 15 minutos, execução do roteiro de leitor de tela e proteção de branch são do dono: marcar `TODO-AUTOR`, **não decidir, não executar** (nenhum `gh api`/`curl -X PUT`).
- **Proibido nesta parte:** `changeset version`, `changeset publish`, `npm publish`, alterar o campo `version` dos pacotes (ficam `0.0.0`), recurso novo nos pacotes, `@deprecated`/alias para nomes antigos (nada foi publicado).
- **npm da máquina é 10.x** (o repo exige >= 11): instalar/rodar scripts da raiz com `npx -y npm@11 <cmd>` (ex.: `npx -y npm@11 run check:rules`). Testes de `test:tools` não usam rede nem npm real.
- **Comandos pesados** (build, `nx`, Playwright, `consumer.mjs`, `ng`): `bash "C:/Users/Gustavo Alves Leite/.claude/heavy.sh" <cmd>`, com `export NX_DAEMON=false TMPDIR=$HOME/.cache/tmp RTE_CONSUMER_DIR=$HOME/.cache/cds-rte-consumer/demo RTE_NPM="npx -y npm@11"`. Uma execução pesada por vez. **Nunca matar processos em massa** (`taskkill /IM`, `pkill -f node`); se algo travar, achar o PID específico. **Nunca `python -`**: auxiliares em `.mjs`. JSON de API do GitHub (se o dono pedir algo): gravar em arquivo e ler com `node -e`.
- **Playwright local:** só Chromium (`--project=chromium --workers=2`; Firefox/WebKit só no CI). O `webServer` compila os dois apps a cada rodada (a frio ~10 min).
- **Renomeação grande roda SOZINHA** (T2): nenhuma outra tarefa, worktree ou sessão mexendo em arquivos do repositório ao mesmo tempo.
- **Relatórios** (`packages/*/api/*.api.md`, `*.css-api.md`) regravam só com `UPDATE_API=1` e sempre no mesmo commit da mudança que os causou.
- **Idiomas:** documentação e JSDoc em pt-BR; código e nomes públicos em inglês; mensagens de ferramentas em pt-BR.
- **Série N:** não há testes de navegador novos (nenhum N novo).
- **`CLAUDE.md`:** só a T6 mexe (a T2 só faz a substituição mecânica de nomes nele, ver T2).
- **ADRs antigos (`docs/decisions/*`) e specs (`docs/specs/*`) não são reescritos**, nem pelas renomeações.

## Review Focus

1. Nome antigo escondido em lugar que nenhum teste de tipo vê (bloco de código de Markdown do guia/READMEs, `examples/`, `apps/docs/examples`, strings de `e2e/`): a regra do `check:rules` varre texto, não só `.ts`, e o compilador dos exemplos do site/`consumer-snippets` reprova.
2. Substituição por palavra inteira atingindo identificador legítimo (`Rgb` em comentário/variável local, `DraftStore` dentro de `RteDraftStoreFoo` ou de `clearLocalDrafts`): a regra e a substituição usam `\b` + não precedido por `Rte`/`RTE_`; teste cobre o falso positivo.
3. `api-diff` lendo relatório com CRLF (Windows) ou reformatado pelo api-extractor como se fosse remoção: normalização de EOL e comparação por declaração.
4. `changeset status` com `fixed` e os 34 changesets antigos (theme só `patch`): o plano tem de sair `0.1.0` nos 5 (e `0.0.1` para o theme é erro).
5. `npm install` dos tarballs buscando `@cds/rte-core@0.0.0` no registro: `npm ls @cds/rte-core` precisa de uma versão só, vinda do tarball.

(Cada linha tem o teste na tarefa dona: 1 e 2 em T2; 3 em T4; 4 em T1; 5 em T1.)

## Ordem, dependências e paralelismo

```
T1 (deps exatas + fixed + release-plan + spike) ──► T2 (renomeações AP3/AP4 + regra de nomes; SOZINHA)
T2 ──► T3 (JSDoc + @packageDocumentation + AP2/AP8 no api-report)
T3 ──► T4 (css-api.mjs + api-diff.mjs + CI)          T3 ──► T5a (docs de política; só texto)
T4 + T5a ──► T5b (5 changesets consolidados, depois dos nomes finais)
T5b ──► T6 (prontidão, ADR 0023, specs, CLAUDE.md)
```

- **Sequência rígida** T1 → T2 → T3. Depois da T3, **T4** (tools/, `ci.yml`, `packages/*/api`, `project.json`) e **T5a** (só `docs/`, `SECURITY.md`, `CONTRIBUTING.md`, `.changeset/README.md`) não compartilham arquivos e podem andar em paralelo (a trava `heavy.sh` serializa o que for pesado). T5b e T6 por último (T6 lê tudo).
- As 6 tarefas da AP15 seguem a numeração do plano: T1 = AP12+AP13; T2 = AP3+AP4; T3 = AP8+AP2; T4 = AP7+AP9; T5 = AP1/5/6/10/11 + changesets; T6 = AP14 + ADR 0023 + fechamento. A T5 tem duas metades (5a/5b) no mesmo PR.
- Notas para o ADR 0023 (desvios, listas, saídas de comando) acumulam no corpo dos commits até a T6 (sem arquivo novo antes).

## Resumo

1. Dependências internas exatas, `fixed`, `release-plan.mjs`, spike do `consumer.mjs` — primeira
2. Renomeações da lista fechada, `RteHeadingLevel`/`RteSchemaLinkPolicy`/`readonly`, opções sem uso, regra de nomes antigos — sozinha
3. JSDoc completo, `@packageDocumentation`, teste de prefixo (AP2) e de `(undocumented)` (AP8)
4. `css-api.mjs`, relatórios CSS, `api-diff.mjs`, alvo `api` e CI
5. `docs/support.md`, `SECURITY.md`, `open-core.md`, `CONTRIBUTING.md`, `.changeset/README.md` e os 5 changesets consolidados
6. `docs/release/prontidao-1.0.md` + regra, ADR 0023, §6 da spec 09, índice de specs, `CLAUDE.md`

---

## Tarefa 1: dependências internas exatas, `fixed`, `release-plan.mjs` e spike do consumidor (AP12, AP13 sem os changesets finais; R5)

**Roda primeiro e sozinha** (o spike expõe cedo problema de instalação).

**Arquivos:**
- Criar `tools/release-plan.mjs` + `tools/release-plan.test.mjs`.
- Modificar `packages/angular/package.json`, `packages/sanitizer/package.json`, `packages/render/package.json` (e o lock), `packages/angular/ng-package.json`, `packages/render/ng-package.json`, `.changeset/config.json`, `tools/check-repo-rules.mjs` + `check-repo-rules.test.mjs`, `.github/workflows/ci.yml` (passo `release-plan`), `package.json` (script `"release-plan"`), `tools/consumer.mjs` + `consumer.test.mjs` só se o spike exigir (reserva da §9).
- Config do `@nx/dependency-checks`: localizar com `grep -rn "dependency-checks" --include=eslint.config.mjs --include=.eslintrc* packages eslint.config.mjs` e ajustar (`ignoredDependencies`/`checkMissingDependencies`) conforme a necessidade.

**Interfaces (Produz):**
- `release-plan.mjs`: `checkReleasePlan({ status, config, packages, env }) -> string[]` (erros em pt-BR). `status` = JSON de `npx changeset status --output <arq>` (`{ releases: [{ name, type, oldVersion, newVersion }] }`); `config` = `.changeset/config.json`; `packages` = os 5 nomes; `env` = `process.env`. Erros: grupo `fixed` ausente/incompleto (deve ser exatamente os 5, num único grupo); alguma `newVersion` >= `1.0.0` sem `env.RTE_ALLOW_1_0 === '1'`; pacote fora do plano. CLI: `node tools/release-plan.mjs [--status <json>]` (sem `--status`, roda `npx changeset status --output <tmp>` e lê); sai 1 com erros.
- `check-repo-rules`: `checkInternalDeps(rootDir) -> string[]` (chamada em `checkRepoRules`): dependência `@cds/rte-*` em `dependencies` deve ser versão exata igual à `version` do pacote referido; `@cds/rte-*` em `peerDependencies`/`peerDependenciesMeta` reprova; toda importação de `@cds/rte-X` em `packages/<p>/src` (fora de `*.spec.ts`) exige `X` em `dependencies` de `<p>`; `ng-package.json` de pacote com `@cds/rte-*` em `dependencies` precisa listá-lo em `allowedNonPeerDependencies`.

**Testes primeiro:**
- [ ] `release-plan.test.mjs`: (a) 5 pacotes `0.0.0 → 0.1.0`, `fixed: [[os 5]]` → `[]`; (b) `fixed: []` → erro "grupo fixed"; (c) `fixed` com 4 → erro citando o ausente; (d) um `newVersion: '1.0.0'` → erro, e com `env.RTE_ALLOW_1_0 = '1'` → `[]`; (e) theme `0.0.1` com os outros `0.1.0` passa na checagem de `fixed` mas o teste do config real (abaixo) exige `fixed`; (f) CLI com `--status` de exemplo sai 0/1.
- [ ] `check-repo-rules.test.mjs` (fixtures em diretório temporário, como os casos existentes): dependência interna `^0.0.0` reprova; `0.0.1` com o referido em `0.0.0` reprova; `peerDependencies` com `@cds/rte-core` reprova; import de `@cds/rte-core` em `src` sem estar em `dependencies` reprova; `ng-package.json` sem `allowedNonPeerDependencies` reprova; cenário correto passa; import só em `*.spec.ts` não exige dependência.
- [ ] Teste do repositório real (em `release-plan.test.mjs`): o `.changeset/config.json` real tem `fixed` com os 5 nomes dos `packages/*/package.json`.

**Implementação:**
- [ ] `package.json`: `angular` → `dependencies: { "@cds/rte-core": "0.0.0", "@cds/rte-theme": "0.0.0" }` (saem dos peers); `sanitizer` → `dependencies: { "@cds/rte-core": "0.0.0" }`; `render` → `dependencies: { "@cds/rte-core": "0.0.0" }`, saem o peer `@cds/rte-sanitizer` e seu `peerDependenciesMeta`; o `render` mantém o sanitizador só como `devDependency`/alias do workspace usado nos `*.spec.ts` (conferir `grep -rn "rte-sanitizer" packages/render --include=*.ts` e o README do render, que deve deixar de pedir o sanitizador como peer).
- [ ] `ng-package.json` de `angular` e `render`: `"allowedNonPeerDependencies": ["@cds/rte-core", "@cds/rte-theme"]` (render: só `@cds/rte-core`). Conferir que o ng-packagr NÃO empacota o core dentro do angular (`dist/packages/angular/fesm2022/*.mjs` com `import ... from '@cds/rte-core'`).
- [ ] `.changeset/config.json`: `"fixed": [["@cds/rte-core","@cds/rte-sanitizer","@cds/rte-theme","@cds/rte-angular","@cds/rte-render"]]`; manter `updateInternalDependencies: "patch"`.
- [ ] `tools/release-plan.mjs`; `check-repo-rules.mjs` (`checkInternalDeps`); script `"release-plan": "node tools/release-plan.mjs"`; passo no `ci.yml` (job principal, depois de `check:rules`): `npm run release-plan` (com `fetch-depth` suficiente para o Changesets comparar com `main`; conferir o `actions/checkout` do job).
- [ ] **Spike de instalação (primeiro passo prático da tarefa, antes de fechar o resto):** com as mudanças de `package.json` aplicadas, `npx -y npm@11 install` na raiz (atualiza o lock; `git diff package-lock.json` só deve tocar as 3 entradas dos pacotes), depois `export ...; bash heavy.sh npx nx run-many -t build -p core theme sanitizer angular render` e `bash heavy.sh node tools/consumer.mjs pack prepare install` (o `rewriteDependencies` troca `@cds/*` de `dependencies` do demo por `file:<tarball>`; o `install` roda `verifyOrigin`). Conferir: (1) `npm ls @cds/rte-core` no `RTE_CONSUMER_DIR` mostra **uma** versão, deduplicada, de origem tarball (nenhum 404 no registro por `@cds/rte-core@0.0.0`); (2) o `package.json` do tarball do angular tem `@cds/rte-core` em `dependencies` e não em `peerDependencies`. Se o npm tentar o registro ou duplicar: aplicar a reserva — `consumer.mjs` passa a instalar os 5 tarballs no mesmo comando e/ou escreve `overrides` na cópia; teste novo em `consumer.test.mjs` com executor falso; anotar a escolha para o ADR 0023.
- [ ] `changeset status` com os 34 changesets antigos ainda presentes: `npx -y npm@11 exec changeset status -- --output=dist/release-status.json` (ou `npx changeset status --output=...`); conferir que os 5 saem `0.0.0 → 0.1.0` (inclusive o theme, que só tinha `patch`: o `fixed` o sobe junto). Se algum sair diferente, investigar antes de seguir (ex.: bump `major` esquecido num changeset antigo) e anotar.

**Verificação:**
- `npx -y npm@11 run test:tools` e `npx -y npm@11 run check:rules`
- `bash heavy.sh npx nx run-many -t lint,typecheck,build,test,verify-package -p core theme sanitizer angular render` (publint/attw + dependency-checks acusam problemas de `dependencies`)
- `bash heavy.sh node tools/consumer.mjs pack prepare install test build` e `npm ls @cds/rte-core` (uma versão) — saída para o ADR 0023
- `bash heavy.sh npx nx run-many -t api` (relatórios não devem mudar; se mudarem por causa de `dependencies`, investigar, não regravar às cegas)

**Commit:** `build(deps): dependências internas exatas, grupo fixed e release-plan (09c T1)` (se o `consumer.mjs` mudar, commit separado: `fix(tools): consumer instala os tarballs com dependências internas exatas (09c T1)`)

---

## Tarefa 2: renomeações da AP3, tipos da AP4 e regra de nomes antigos (R1)

**RODA SOZINHA. Pré-condição: `git status` limpo e nenhuma outra sessão/worktree/processo pesado em andamento.**

**Arquivos (todos os que contiverem os nomes; localizar com `git grep -lw`):** fonte, `*.spec.ts`, `e2e/**`, `apps/{demo,docs,ssr-smoke}/**` (inclusive `apps/docs/examples/**` e `apps/docs/content/**`), `examples/**`, `tools/**` (incl. fixtures e `consumer-snippets`), `packages/*/README.md`, `README.md`, `CLAUDE.md`, `.changeset/*.md` antigos, `packages/*/api/*.api.md` (regravados). Fora: `docs/decisions/**`, `docs/specs/**`, `docs/superpowers/plans/**`.
- Criar/modificar: `tools/check-repo-rules.mjs` + `check-repo-rules.test.mjs` (regra de nomes antigos, `checkOldNames(rootDir)`); `packages/core/src/**` (tipos novos `RteHeadingLevel`, `RteSchemaLinkPolicy`).

**Interfaces (Produz):**
- Mapa `OLD_TO_NEW` único em `tools/check-repo-rules.mjs` (exportado, usado pelo teste e pelo script de renomeação do executor): `DEFAULT_ID_PREFIX→RTE_DEFAULT_ID_PREFIX`, `DEFAULT_LINK_POLICY→RTE_DEFAULT_LINK_POLICY`, `DraftStorage→RteDraftStorage`, `DraftStore→RteDraftStore`, `DraftStoreOptions→RteDraftStoreOptions`, `SrcsetCandidate→RteSrcsetCandidate`, `DEFAULT_EMBED_PROVIDERS→RTE_EMBED_PROVIDERS`, `YOUTUBE_PROVIDER→RTE_YOUTUBE_PROVIDER`, `VIMEO_PROVIDER→RTE_VIMEO_PROVIDER`, `SPOTIFY_PROVIDER→RTE_SPOTIFY_PROVIDER`, `SerializeRteHtmlOptions→RteSerializeHtmlOptions`, `ExtractTocOptions→RteExtractTocOptions`, `HtmlToTextOptions→RteHtmlToTextOptions`, `ValidateHtmlOptions→RteValidateHtmlOptions`, `ApplyRteThemeOptions→RteApplyThemeOptions`, `CheckThemeOptions→RteCheckThemeOptions`, `CreateRteThemeOptions→RteCreateThemeOptions`, `SuggestRteColorOptions→RteSuggestColorOptions`, `ColorParser→RteColorParser`, `Rgb→RteRgb`. Removidos (sem novo nome, também proibidos): `ANGULAR_DEFAULTS`, `CORE_VERSION`, `SANITIZER_VERSION`, `THEME_VERSION`, `RENDER_VERSION`.
- `RteHeadingLevel = 2 | 3 | 4` (core `.`); `RteSchemaLinkPolicy` (interface nomeada do objeto hoje anônimo em `RteHtmlSchemaOptions.linkPolicy`).

**Testes primeiro:**
- [ ] `check-repo-rules.test.mjs`: fixture com `.ts` contendo `DEFAULT_LINK_POLICY` reprova (mensagem pt-BR com arquivo, nome antigo e novo); o mesmo em `.md` de `apps/docs/content` e em bloco de código de README reprova (Review Focus 1); `RTE_DEFAULT_LINK_POLICY` passa; `RteDraftStoreFoo` e `clearLocalDrafts` passam (falso positivo, Review Focus 2); `Rgb` em `RteRgb` passa; o mesmo nome em `docs/decisions/x.md`, `docs/specs/x.md` e `docs/superpowers/plans/x.md` passa; nome removido (`CORE_VERSION`) reprova.
- [ ] Antes de renomear, nos pacotes: adicionar/ajustar testes de tipo que travam o que muda — core: teste `expectTypeOf`/de compilação de que `extractToc(html, { levels: [2, 3] as const })` e `readonly RteHeadingLevel[]` compilam; `RteHeading['level']` e `RteTocEntry['level']` são `RteHeadingLevel`; ficam em `packages/core/src/**/*.spec.ts` (padrão do pacote). Rodam VERMELHOS até a implementação.
- [ ] Teste de que os 4 `*_VERSION` e `ANGULAR_DEFAULTS` não existem mais: `Object.keys(await import('@cds/rte-...'))` nos specs existentes de cada entry (um `expect` por pacote) — substitui os testes antigos que liam `*_VERSION`.

**Implementação (um commit por pacote que DEFINE o nome; cada commit toca o repositório inteiro para aquele grupo e deixa `typecheck`/`build` verdes):**
- [ ] Antes de tudo: `git grep -nw` de cada nome antigo e de cada nome novo (colisão com símbolo existente: parar e decidir com o ADR). Para `Rgb`, listar ocorrências à mão (é palavra comum em comentário/variável local).
- [ ] **Commit 1 — core:** os nomes de core `.`, `/embeds`, `/extensions`, `/html` e `RteHeadingLevel`/`RteSchemaLinkPolicy`, mais os usos em todos os pacotes e apps. Remover `CORE_VERSION` (e seus usos, testes e README). Substituição por script `.mjs` de uso único (não committed) lendo `OLD_TO_NEW`, regex `(?<![A-Za-z0-9_])NOME(?![A-Za-z0-9_])`, só em arquivos de texto rastreados pelo git; conferir o `git diff --stat`.
- [ ] **Commit 2 — theme:** os nomes do tema, `ANGULAR_DEFAULTS` removido (interno se ainda usado: mover a referência para `RTE_THEME_PRESETS.angular`), `THEME_VERSION` removido.
- [ ] **Commit 3 — sanitizer e render:** `SANITIZER_VERSION`, `RENDER_VERSION` removidos; usos de nomes de core em `render`/`sanitizer`.
- [ ] **Commit 4 — angular:** usos remanescentes em `packages/angular` (draft, upload, tema); `provideRichText` NÃO muda.
- [ ] **Commit 5 — AP4:** `readonly T[]` em `RteExtractTocOptions.levels`, `RteSchemaLinkPolicy.*`, `RteEmbedProvider.hosts`/`srcPatterns` e demais parâmetros/opções de lista (varrer `packages/*/api/*.api.md` por `[]` em entradas); `RteHeadingLevel` em `RteHeading.level`, `RteTocEntry.level`, `RteExtractTocOptions.levels`, `RteToc.levels`.
- [ ] **Commit 6 — opções sem uso (AP4):** listar toda propriedade opcional das interfaces `Rte*Options`/config públicas (a partir dos relatórios); para cada uma, `git grep` no código de produção (leitura) e nos `*.spec.ts` (exercício). Sem leitura em produção → remover (interface, JSDoc, README, guia, teste). Sem teste mas com leitura → escrever o teste. Lista (vazia ou não) nas notas do commit para o ADR 0023.
- [ ] **Commit 7 — regra:** `OLD_TO_NEW`/`checkOldNames` no `check-repo-rules.mjs`, varrendo texto de arquivos rastreados (`git ls-files`, pulando binários e a lista de exceções: `docs/decisions/`, `docs/specs/`, `docs/superpowers/`, `tools/check-repo-rules.mjs` e seu teste, `package-lock.json`, `THIRD-PARTY-NOTICES.md` se gerado); chamada em `checkRepoRules` só quando há `package.json` na raiz.
- [ ] Regravar relatórios: `UPDATE_API=1 bash heavy.sh npx nx run-many -t api` (depois do build); conferir `git diff packages/*/api` = só as renomeações/remoções/tipos novos, nada mais. `docs/html-schema.md` e `fixtures/` não devem mudar (se mudarem, é regressão).

**Verificação (depois do último commit, tudo verde):**
- `npx -y npm@11 run check:rules` e `test:tools` (a regra nova prova a completude em texto)
- `bash heavy.sh npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size,api`
- `npx -y npm@11 run typecheck:e2e`
- `bash heavy.sh node tools/consumer.mjs pack prepare install test build check-snippets` (demo) e o `--app docs` (exemplos compilados em modo estrito do site são a prova do guia)
- `bash heavy.sh npx playwright test -c e2e --project=chromium --workers=2` (editor; a frio ~10 min) e o E2E do demo/docs em Chromium (`apps/demo/e2e`, `apps/docs/e2e`; ver `e2e/README.md`/`CLAUDE.md` para o comando)

**Commits:** `refactor(core): renomeia a API pública do core pela convenção Rte (09c T2)`, `refactor(theme): ...`, `refactor(sanitizer,render): remove as constantes de versão (09c T2)`, `refactor(angular): ...`, `refactor(core): readonly e RteHeadingLevel nas entradas (09c T2)`, `refactor: remove opções sem uso (09c T2)`, `test(tools): regra do check:rules contra nomes antigos da API (09c T2)`; o último inclui os relatórios regravados.

---

## Tarefa 3: JSDoc completo, `@packageDocumentation` e testes AP2/AP8 (R2)

**Arquivos:**
- Modificar `tools/api-report.mjs` + `tools/api-report.test.mjs` (verificações novas sobre o texto dos relatórios).
- Modificar o fonte (`packages/*/src/**`, JSDoc e um comentário `@packageDocumentation` no arquivo-raiz de cada entry: 15 entries).
- Regravar `packages/*/api/*.api.md`.

**Interfaces (Produz):**
- `api-report.mjs`: `checkPrefixConvention(reportText, { allow }) -> string[]` (toda declaração exportada que NÃO é função deve começar por `Rte`/`RTE_`; `allow` = lista `{ name, reason }` mantida no próprio teste); `checkDocumentation(reportText, entryName) -> string[]` (erros: relatório sem `@packageDocumentation`, ou com `// (undocumented)` fora de membros de interfaces `Rte*Labels`). Chamadas pelo alvo `api` (modo comparar) além da comparação de texto.

**Testes primeiro:**
- [ ] `api-report.test.mjs` (textos de relatório mínimos): classe/interface/`const`/`type` sem prefixo reprova com nome e entry; função sem prefixo passa (`slugify`); `provideRichText` passa por ser função; exceção listada com motivo passa, sem motivo reprova; `(undocumented)` num membro de `RteDialogLabels` passa e noutro tipo reprova; relatório sem `@packageDocumentation` reprova; com ele passa. Rodam vermelhos até haver o código.
- [ ] Rodar `checkPrefixConvention` contra os 15 relatórios reais e enumerar as violações (deveria restar só o que a AP3 já renomeou; qualquer outra: decidir caso a caso — renomear só se estiver na lista da AP3; senão exceção com motivo no teste e linha no ADR 0023; **não ampliar a lista fechada da AP3 sem avisar o dono**).

**Implementação:**
- [ ] Implementar `checkPrefixConvention`/`checkDocumentation` (parsing por declaração `export declare ...`, tolerante a CRLF) e ligá-las ao `main` do `api-report.mjs`.
- [ ] Fonte: `@packageDocumentation` com uma frase em pt-BR por entry (15); JSDoc curto em pt-BR em cada item que o relatório marca `(undocumented)` (listar: `grep -c "(undocumented)" packages/*/api/*.api.md`). Membros de `Rte*Labels`: documentar a interface (e `RTE_LABELS_EN` como referência), não os membros. Não mudar comportamento nem assinaturas.
- [ ] `UPDATE_API=1 bash heavy.sh npx nx run-many -t build,api`; `git diff packages/*/api` só com comentários novos e remoção de `(undocumented)`; `grep -c "(undocumented)"` zerado fora de `Rte*Labels`.

**Verificação:** `npx -y npm@11 run test:tools`; `bash heavy.sh npx nx run-many -t lint,typecheck,build,test,api`; o site lê o JSDoc: rodar o pipeline do site (`RTE_API_MODEL=dist/api-model node tools/api-report.mjs <pacote>` + `api-documenter` + `node tools/docs-content.mjs`) e `node --test tools/docs-*.test.mjs` para ver que o JSDoc novo passa pelo conversor (TSDoc inválido em `{@link}`/`@param` falha aqui).

**Commit:** `docs(api): JSDoc completo, @packageDocumentation e conferência de prefixo e documentação nos relatórios (09c T3)`

---

## Tarefa 4: superfície CSS pública e guarda de mudança de API (AP7, AP9; R3, R4)

**Pode rodar em paralelo à T5a** (arquivos disjuntos). Pesados via `heavy.sh`.

**Arquivos:**
- Criar `tools/css-api.mjs` + `tools/css-api.test.mjs`; `tools/api-diff.mjs` + `tools/api-diff.test.mjs`.
- Criar `packages/<p>/api/css-public.json` e `packages/<p>/api/<arquivo>.css-api.md` para cada CSS publicado: localizar com `ls packages/*/styles/*.css` (esperados: `theme.css` no theme, `content.css` no core, `editor.css` no angular, `render.css` no render).
- Modificar `packages/*/project.json` (alvo `api` ganha o comando `node tools/css-api.mjs packages/<p>` e `inputs`/`outputs` com `styles/*.css` e `api/css-public.json`; conferir `dependentTasksOutputFiles`/cache, como já avisa o `CLAUDE.md`), `.github/workflows/ci.yml` (passo `api-diff`), `package.json` (scripts `api-diff`), `tools/check-repo-rules.mjs` (todo CSS publicado tem relatório e `css-public.json`).

**Interfaces (Produz):**
- `css-api.mjs`: `extractCssApi(cssText) -> { classes: string[], variables: string[], layers: string[], properties: string[] }` (ordenado, sem duplicata; classes `rte-*`/`rt-*`, variáveis `--rte-*` DECLARADAS, `@layer`, `@property`); `renderCssReport({ file, api, publicList }) -> string` (cada item `public`/`internal`); `checkCssApi({ api, publicList, readmeThemeVars?, guideTokens? }) -> string[]` (erros: item público ausente do CSS; variável do README do tema (tabela dos níveis) fora de `publicList`; classe/variável citada no guia/READMEs fora da lista). CLI: `node tools/css-api.mjs packages/<p>` (compara; `UPDATE_API=1` regrava; exit 1 em divergência).
- `css-public.json`: `{ "classes": [...], "variables": [...], "layers": [...], "properties": [...] }` (lista curta: variáveis dos níveis 1 a 3 do tema; `.rte-root`; as classes que o guia da 07d ensina a mirar; as `rt-*` do esquema são públicas pela AP1(3), derivadas de `docs/html-schema.md`/`content.css`).
- `api-diff.mjs`: `parseReport(text) -> Map<declaração normalizada, texto>`; `diffReports(oldText, newText) -> { added: string[], removed: string[], changed: string[] }`; `requiredBump({ diff, version }) -> 'none'|'patch'|'minor'|'major'` (removido/alterado: `minor` se versão `0.x`, `major` se >= `1.0.0`; só acréscimo: exige ao menos `patch`); `checkApiDiff({ changedReports, changesets, versions }) -> string[]`. CLI: `node tools/api-diff.mjs --base <ref>` (usa `git diff --name-only <base>...HEAD`, `git show <base>:<arquivo>`, e os changesets ADICIONADOS/alterados no PR por `git diff --name-only --diff-filter=AM <base>...HEAD -- .changeset`).

**Testes primeiro (`test:tools`):**
- [ ] `css-api.test.mjs`: CSS mínimo com `.rte-root`, `.rt-callout`, `--rte-primary` declarada, `@layer rte`, `@property --rte-x` → extração exata; `var(--rte-y)` apenas USADA não entra em variáveis declaradas; item público ausente falha; variável da tabela do README fora da lista falha; guia citando `.rte-interna` fora da lista falha; `UPDATE_API=1` regrava, sem ele diverge e falha.
- [ ] `api-diff.test.mjs`: só acréscimo + changeset `patch`/`minor` passa; remoção em `0.x` com changeset `patch` falha e com `minor` passa; remoção com versão `1.0.0` e `minor` falha, com `major` passa; relatório mudado sem changeset do pacote falha (changeset de OUTRO pacote não vale); `@deprecated` novo em linha existente conta como acréscimo; relatório só reformatado/CRLF (mesmas declarações) = sem mudança (Review Focus 3); remoção no `docs/html-schema.md` e em item `public` do CSS tratadas como remoção de API; item `internal` do CSS removido não exige nada.

**Implementação:**
- [ ] Escrever as duas ferramentas pelos testes; `css-public.json` por pacote derivado de: tabela dos níveis do `packages/theme/README.md` (variáveis 1–3), `rte-root`, e classes/variáveis citadas em `apps/docs/content/guia/*.md` e `README`s (a regra "o guia cita fora da lista" falha enquanto a lista estiver incompleta: completar a lista, não afrouxar a regra).
- [ ] Gerar os relatórios CSS: `UPDATE_API=1 node tools/css-api.mjs packages/<p>` (leve, sem build) e ligar no alvo `api`.
- [ ] `ci.yml`: passo `node tools/api-diff.mjs --base origin/${{ github.base_ref }}` só em `pull_request`, no job com `fetch-depth: 0` (conferir o `checkout`); no `push` para `main` o passo é omitido.
- [ ] `checkRepoRules`: cada `styles/*.css` publicado tem `api/<arquivo>.css-api.md` e `api/css-public.json` (teste de fixture).

**Verificação:** `npx -y npm@11 run test:tools` e `check:rules`; `bash heavy.sh npx nx run-many -t api` (TS + CSS verdes = API congelada); prova local do `api-diff`: `node tools/api-diff.mjs --base main` no branch (esperado: lista as mudanças de API da T2/T3 e, sem os changesets finais da T5b, FALHA por falta de changeset — registrar a saída; ela passa depois da T5b).

**Commit:** `feat(tools): relatório de CSS público e guarda api-diff no CI (09c T4)`

---

## Tarefa 5a: documentos de política (AP1, AP5, AP6, AP10, AP11; R6)

**Pode rodar em paralelo à T4.** Só texto (pt-BR).

**Arquivos:** reescrever `docs/support.md`; modificar `SECURITY.md`, `docs/open-core.md` (revisão), `CONTRIBUTING.md`, `.changeset/README.md`, `README.md` raiz (frase "pacotes independentes" → "conjunto de pacotes versionados juntos"), READMEs de `packages/angular` e `packages/core` (aviso das diretivas de validação: não feitas para herança, AP6); `tools/check-repo-rules.mjs` só se algum teste de conteúdo existente reprovar o texto novo.

**Testes primeiro:**
- [ ] `tools/check-repo-rules.test.mjs` ou teste novo `tools/support-doc.test.mjs`: o `docs/support.md` real NÃO contém "independente por pacote" nem "pre enter"; contém `>=22.2.1 <23` e `^3.31.4`; contém as seções "API pública", "Depreciação", "Terceiros", "Angular"; os arquivos `.changeset/README.md` e `CONTRIBUTING.md` não dizem "versão independente". Vermelho até a escrita.

**Conteúdo (decidido pela spec; não inventar além dela):**
- [ ] `docs/support.md`: Versionamento (grupo `fixed` dos 5, mesma versão; `0.x`: quebra em `minor` com nota de migração; sem menção a `pre enter`; canal/`dist-tag` = `TODO-AUTOR` 09b). API pública = AP1 (4 itens + lista do que NÃO é público). Convenção de nomes (AP2). Terceiros (AP5: Tiptap 3, `highlight.js`, tipos Angular; Tiptap 4/`highlight.js` 12 = major da lib; faixa de peers só alarga em `minor`; escotilhas do `Editor` "contrato do Tiptap 3, não da lib"; `@angular/forms/signals`: **conferir na documentação do Angular 22** (context7/`angular.dev`) se ainda é não estável; se for, declarar a exceção do `/validators`). Itens internos exportados (AP6: `@internal`/`ɵ`, sem `stripInternal`, sem `@beta`, reexportações intencionais `clearLocalDrafts`, `RTE_LABELS_EN`, `RteTocEntry`). Depreciação (AP10, texto exato da spec). Angular (AP11: peers `>=22.2.1 <23`, matriz da 08a, regra do Angular 23 "~nov/2026, conferir", 1.0 não espera o 23, largar o 22 só em major e não antes do fim do LTS). Link para `docs/html-schema.md` como contrato.
- [ ] `SECURITY.md`: tabela de versões sem citar tag `next`/canal (`main` pré-1.0 e última `1.x`), com `TODO-AUTOR: canal e dist-tag (09b)`.
- [ ] `docs/open-core.md`: revisar coerência (nomes, "fixed"); compromisso intacto; `TODO-AUTOR` do escopo Pro mantido.
- [ ] `.changeset/README.md` e `CONTRIBUTING.md`: "os 5 pacotes são versionados juntos (`fixed`)"; PR que muda relatório de API/CSS/esquema exige changeset do tipo certo (AP9); mencionar `UPDATE_API=1`.

**Verificação:** `node --test tools/support-doc.test.mjs`, `npx -y npm@11 run check:rules`, `node tools/check-links.mjs` se aplicável aos READMEs (ver `CLAUDE.md`), conferir links relativos à mão.

**Commit:** `docs(politica): suporte, depreciação, API pública e versionamento conjunto (09c T5a)`

---

## Tarefa 5b: 5 changesets consolidados (AP13; R5)

**Depois da T2 (nomes finais), T3 e T5a.**

**Arquivos:** apagar os 34 `.changeset/*.md` (menos `README.md`/`config.json`); criar `.changeset/core-1.md`, `sanitizer-1.md`, `theme-1.md`, `angular-1.md`, `render-1.md` (nomes: `<pacote>-estado-final.md`), cada um com frontmatter `"@cds/rte-<p>": minor`.

**Testes primeiro:**
- [ ] Em `tools/release-plan.test.mjs`: teste do repositório real — existem exatamente 5 changesets, um por pacote, todos `minor`, nenhum menciona nome antigo da AP3 (já coberto pela regra, conferir explicitamente), cada texto tem a seção "Segurança" (exigência do Risco §9).
- [ ] `npx -y npm@11 exec changeset status -- --output=dist/release-status.json` e `node tools/release-plan.mjs --status dist/release-status.json` → 5 em `0.1.0`, sem erros (Review Focus 4).

**Implementação:**
- [ ] **Revisão item a item dos 34 originais ANTES de apagar** (spec §9): ler cada um, extrair requisitos de peers, entries, recursos finais, CSS, notas de segurança do R9 (`r9-*.md`), e montar uma tabela temporária (fora do repositório ou no corpo do commit) original → destino (pacote/seção) sem descartar nota de segurança. Textos descrevem o ESTADO FINAL (entries, recursos, CSS `content.css`/`editor.css`/`theme.css`/`render.css`, segurança, requisitos de peers), não a ordem das specs; pt-BR.
- [ ] Apagar os 34 com `git rm`; adicionar os 5; saída do `changeset status` para o ADR 0023.
- [ ] `node tools/api-diff.mjs --base main` agora passa (changesets `minor` cobrem as remoções em `0.x`).

**Verificação:** comandos acima + `npx -y npm@11 run check:rules` + `test:tools`. **Não** rodar `changeset version`.

**Commit:** `chore(changeset): consolida os 34 changesets em 5 que descrevem o estado final (09c T5b)`

---

## Tarefa 6: prontidão para a 1.0, ADR 0023 e fechamento (AP14, AP15; R7, R8)

**Por último (lê tudo).** Aqui — e só aqui — se mexe em `CLAUDE.md`, `docs/specs/README.md` e `09-release-governanca.md`.

**Arquivos:** criar `docs/release/prontidao-1.0.md`, `docs/decisions/0023-api-estavel-e-prontidao.md`; modificar `tools/check-repo-rules.mjs` + teste (regra `checkProntidao`, e `docs/release/prontidao-1.0.md` em `GOVERNANCE_FILES`), `docs/specs/09-release-governanca.md` (§6), `docs/specs/09c-api-estavel-e-prontidao.md` (status), `docs/specs/README.md`, `CLAUDE.md`.

**Interfaces (Produz):**
- `checkProntidao(rootDir) -> string[]`: lê a tabela Markdown `| Item | Dono | Evidência | Estado |` de `docs/release/prontidao-1.0.md`; `Dono` ∈ {`agente`, `dono`}; `Estado` ∈ {`feito`, `aberto`}; linha `feito` exige `Evidência` não vazia; linha `dono` e `aberto` exige `TODO-AUTOR` na linha.

**Testes primeiro:**
- [ ] `check-repo-rules.test.mjs`: tabela de fixture — dono ausente/inválido reprova; `feito` sem evidência reprova; linha do dono aberta sem `TODO-AUTOR` reprova; tabela válida passa; arquivo ausente (no repositório real) reprova.

**Implementação:**
- [ ] `docs/release/prontidao-1.0.md`: uma linha por pré-condição da AP14. Agente (com evidência = commit/job/ADR; marcar `feito` só o que de fato fechou nesta parte): AP1–AP13 fechadas; CI verde nos 3 motores (job do PR); `check:licenses`/`notices` sem drift; specs 08 e 07 fechadas no que é automático; **≥ 14 dias corridos sem mudança de quebra nos relatórios depois do congelamento (AP9): `aberto`, com a data do commit de congelamento e a data mínima (+14 dias)** — não pode estar `feito` no dia do merge. Dono (todas `aberto` + `TODO-AUTOR`): nome/escopo e titular do `LICENSE` (PB2); conta npm, 2FA e *trusted publishing* (PB3–PB4); publicação `0.x` e consumidor real com checklist verde (PB12–PB14); teste de 15 minutos (07d L10); roteiro de leitor de tela nas combinações da O9 (NVDA + Firefox/Chrome, VoiceOver + Safari macOS e iOS, TalkBack + Chrome), registrado no ADR 0021, sem falha bloqueante aberta, K4 aprovada; proteção do `main` (ADR 0019 g, `.github/branch-protection.json`); rodada `full`/`next` da matriz (ADR 0019 h); GitHub Pages do site e do demo (07c); escopo Pro do `open-core.md`; contato do `CODE_OF_CONDUCT.md`. Nota: a 1.0 só sai com todas marcadas (`RTE_ALLOW_1_0=1` no PR da 1.0, 09b).
- [ ] ADR 0023 (padrão dos ADRs existentes; ler o 0021 para o formato): decisões AP1–AP15 e *rulings* (incl. `provideRichText` mantido por decisão do dono em 2026-10-08); listas fechadas da AP3 e de opções removidas da AP4 (do commit 6 da T2); itens internos e reexportações da AP6; exceções do teste de prefixo (T3); escolha do spike da T1 (saída de `npm ls @cds/rte-core`); saída de `changeset status` (5 em `0.1.0`) e de `release-plan`; exceções pontuais do `api-diff`, se houver; nota de que o 0022 está reservado à 09b; `TODO-AUTOR` dos itens do dono.
- [ ] `docs/specs/09-release-governanca.md` §6: andamento da 09c; PB5, PB6 e PB15 "feito na 09c"; a 09b "encontra dependências, `fixed`, `release-plan` e changesets prontos; o PR de versão só roda `changeset version`".
- [ ] `docs/specs/README.md`: linha da 09c como concluída (com a ressalva do item de 14 dias); `09c-...md`: marcar critérios de aceite.
- [ ] `CLAUDE.md`: alvo `api` cobre TS + CSS (`css-api.mjs`, `css-public.json`, `UPDATE_API=1` regrava ambos); `release-plan` e `api-diff` (no CI); grupo `fixed`, dependências internas exatas (sem peer interno); regra de nomes antigos; `docs/release/prontidao-1.0.md`; ADR 0023; remover menções a versões independentes e a `*_VERSION` se houver.

**Verificação final (tudo, uma vez):**
- `npx -y npm@11 run check:rules`, `test:tools`, `check:licenses`, `notices` (sem drift: `git diff --exit-code THIRD-PARTY-NOTICES.md`), `typecheck:e2e`, `release-plan`
- `bash heavy.sh npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size,api`
- `bash heavy.sh node tools/consumer.mjs pack prepare install test build check-snippets` (demo) e site (`--app docs`)
- `bash heavy.sh npx playwright test -c e2e --project=chromium --workers=2` e E2E do demo/docs em Chromium
- Firefox/WebKit, `compat latest×latest` e `docs`: **[AUTOR/CI]** (o agente prepara; o resultado vem do PR)
- `git status` limpo; nenhum `version` de `package.json` alterado (`git diff main -- packages/*/package.json | grep '"version"'` vazio)

**Commits:** `feat(tools): regra check:rules da lista de prontidão (09c T6)`, `docs(release): lista de prontidão para a 1.0 (09c T6)`, `docs(adr): ADR 0023 API estável e prontidão (09c T6)`, `docs: fecha a spec 09c no índice, na 09 e no CLAUDE.md (09c T6)`

---

## Auto-revisão

- **Cobertura:** AP1/5/6/10/11 → T5a; AP2/AP8 → T3; AP3/AP4 → T2; AP7/AP9 → T4; AP12/AP13 → T1 + T5b; AP14 → T6; AP15 → ordem acima. R1–R8 mapeados (R1 T2, R2 T3, R3/R4 T4, R5 T1/T5b, R6 T5a, R7/R8 T6). §6.1 (testes de ferramentas) cobertos em T1, T2, T3, T4, T6; §6.2 nas verificações.
- **Pontos em que a spec colide com a realidade (avisar o dono):** (1) `docs/decisions/0020*` e o guia da 07d podem não estar no `main`; o "Conferir antes" do topo manda parar. (2) §7 pede todas as linhas do agente marcadas, mas a de ≥ 14 dias depende de tempo: fica `aberto` com data. (3) Um commit por pacote, mas dependentes importam os nomes: cada commit leva os usos do repositório inteiro para manter o build verde.
- **Fora do plano por decisão do dono:** tudo em `TODO-AUTOR` (npm, nome, consumidor, 15 min, leitores de tela, proteção de branch).
