# ADR 0001: Escopo, nome, versões e ferramentas

- Status: aceita (2026-10-02)
- Spec de origem: `docs/specs/01-projeto-da-lib.md` (R19)

## Contexto

O projeto é um editor de texto rico para Angular 22+ sobre Tiptap 3, publicado como cinco pacotes independentes. Era preciso fixar nome/escopo, versões das ferramentas, o gerenciador de monorepo e as ferramentas de build, e registrar o que a montagem do workspace (tarefas 1 a 7 da spec 01) revelou. Os dados abaixo foram lidos de `package.json`, `package-lock.json` e `node_modules` em 2026-10-02.

## Decisão

### (a) Nome e escopo

- Pacotes `@cds/rte-core`, `@cds/rte-sanitizer`, `@cds/rte-theme`, `@cds/rte-angular`, `@cds/rte-render`. Repositório sugerido: `cds-text-editor`. Versão independente por pacote (Changesets, sem `fixed`/`linked`).
- A organização npm `cds` **não foi confirmada**. O escopo `@cds` é **provisório**. Plano B: pacotes `cds-text-editor-*` sem escopo (por exemplo `cds-text-editor-core`). A troca é só de nome (`package.json`, alias em `tsconfig.base.json`, READMEs, regras em `tools/`).

### (b) Versões fixadas

| Item                                                                                                              | Versão               | Observação                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Node                                                                                                              | 22.23.3 (em uso)     | `engines`: `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0`, o mesmo intervalo exigido por `@angular/core` 22.2.1; o mínimo é o Node 22 LTS 22.22.3 |
| npm                                                                                                               | 11.x (>=11, exigido) | `engines.npm` `>=11` + `engine-strict=true` no `.npmrc`; ver (f) 2 e 3                                                                    |
| Nx (`nx`, `@nx/angular`, `@nx/js`, `@nx/eslint`, `@nx/eslint-plugin`, `@nx/playwright`, `@nx/vite`, `@nx/vitest`) | 23.2.1               |                                                                                                                                           |
| Angular (`@angular/*`, CLI, build)                                                                                | 22.2.1               | fixado exato                                                                                                                              |
| TypeScript                                                                                                        | 6.0.3                | fixado exato                                                                                                                              |
| Vitest                                                                                                            | 4.1.11               | **não** 5: o Vitest 5 fica fora do peer `^3 \|\| ^4` de `@nx/vitest` 23.2.1                                                               |
| `@vitest/coverage-v8`                                                                                             | ~4.1.0               | acompanha o Vitest                                                                                                                        |
| Playwright (`@playwright/test`)                                                                                   | 1.63.0               |                                                                                                                                           |
| ng-packagr                                                                                                        | 22.1.1 (`~22.1.0`)   |                                                                                                                                           |
| tsup                                                                                                              | 8.5.1                |                                                                                                                                           |
| ESLint                                                                                                            | 9.39.5 (`^9.8.0`)    |                                                                                                                                           |
| angular-eslint                                                                                                    | 22.5.0               |                                                                                                                                           |
| publint                                                                                                           | 0.3.25               |                                                                                                                                           |
| @arethetypeswrong/cli (attw)                                                                                      | 0.18.5               |                                                                                                                                           |
| license-checker-rseidelsohn                                                                                       | 4.4.2                |                                                                                                                                           |
| @changesets/cli                                                                                                   | 3.0.3                |                                                                                                                                           |

### (c) Tiptap

Faixa de peer **provisória** `^3.0.0` para `@tiptap/core` e `@tiptap/pm` (em `@cds/rte-core`). Última 3.x publicada na verificação: `@tiptap/core` 3.31.4. A faixa final e o peer de ProseMirror são definidos na spec 08. O Tiptap já entra no workspace a partir da spec 03 (instalado pelo npm 11 como peer automático de `@cds/rte-core`: hoje `@tiptap/core` e `@tiptap/pm` 3.31.4).

### (d) Nx + npm e ferramentas de build

- Nx 23 com npm workspaces (`packages/*`); sem pnpm/yarn.
- `core`, `sanitizer` e `theme`: build com **tsup** (ESM + `.d.ts`), via `nx:run-commands`.
- `angular` e `render`: build com **ng-packagr** (`@nx/angular:package`).
- Testes com Vitest; lint com ESLint 9 (flat config) e `@nx/enforce-module-boundaries`; E2E com Playwright em `e2e/`.
- Verificação de pacote (`verify-package`): `npm pack`, publint e attw. Licenças: `license-checker-rseidelsohn` + `THIRD-PARTY-NOTICES.md`.
- Versionamento e changelog: Changesets (`access: public`, `baseBranch: main`, `updateInternalDependencies: patch`).

### (e) `@angular/aria`

Registro apenas (`npm view @angular/aria version dist-tags --json`, 2026-10-02): `latest` = **22.2.1** (versão estável existe); `next` = 22.3.0-next.0; `v21-lts` = 21.2.14. Será usado só na spec 05.

### (f) Compatibilidade `@nx/*` × Angular 22 × ng-packagr

Verificada pelos builds, lints e testes funcionando em 2026-10-02: Nx 23.2.1 + Angular 22.2.1 + ng-packagr 22.1.1 constroem `angular` e `render` (`nx run-many -t lint,test,build,verify-package` verde). Exceções e achados:

1. **Setup de TS solution.** `@nx/angular:init` do Nx 23 rejeita o setup padrão de TS solution (project references). Usamos `tsconfig.base.json` clássico, com `paths`.
2. **`nx add` quebrava no npm 10.9.9** (bug do arborist). Plugins instalados com `npm i -D` + `nx g @nx/x:init`. O repositório agora exige npm 11 (item 3).
3. **npm >= 11 obrigatório; sem `legacy-peer-deps`.** `engines.npm` `>=11` e `engine-strict=true` no `.npmrc` (npm 10 recusa `npm ci`/`npm install` com `EBADENGINE`); o lockfile foi regenerado com npm 11, que instala peers por padrão. `legacy-peer-deps=true` foi removido: escondia peers ausentes (`@angular/forms`, agora devDependency exata 22.2.1) e o Tiptap, que chega na spec 03, não na 08. Node 24 LTS já traz o npm 11; no CI há um passo `npm i -g npm@11` de salvaguarda.
4. **TypeScript 6.** `baseUrl` foi removido; `paths` usam o prefixo `./`. O tsup precisa de `dts.compilerOptions.ignoreDeprecations: '6.0'`, duplicado nos 3 `tsup.config.ts` (rever na atualização do tsup ou TS 7).
5. **attw.** Usa `--profile esm-only` e `--exclude-entrypoints` apenas para exports de css/scss/json (falso positivo em `./theme.css`); o publint continua validando esses exports.
6. **ng-packagr.** A raiz do tarball é `dist`; o `.npmignore` é emitido; o target `copy-license` copia o `LICENSE`.
7. **`dependency-checks`.** `ignoredDependencies` para os peers de Angular e Tiptap enquanto o código não os usa.
8. **E2E em WSL** precisa das libs do Chromium (ver `e2e/README.md`).

## Emenda à R14: allowlist inclui 0BSD

Emenda à R14: allowlist inclui 0BSD (`tslib`, dependência de runtime dos pacotes ng-packagr via `importHelpers`). A `0BSD` é mais permissiva que a MIT (sem exigência de aviso), e o `tslib` é inevitável em bibliotecas Angular; remover `importHelpers` duplicaria helpers em cada pacote e seria pior. Como o `tslib` é devDependency da raiz (`dev: true` no lockfile), o gate também passou a ler `dependencies`/`optionalDependencies` de `packages/*/package.json` e de `dist/packages/*/package.json` e checar a licença resolvida no lockfile, mesmo para entradas dev (`checkManifestDependencies` em `tools/check-licenses.mjs`).

## Decisões em aberto (com prazo)

- **(a) Notices e dependências de produção do workspace.** O gerador de `THIRD-PARTY-NOTICES.md` usa `--production` a partir da raiz e não enxerga dependências de produção dos pacotes do workspace. Usar as entradas não-dev do lockfile, como o `check-licenses`. Prazo: antes da spec 04 (entrada do `sanitize-html`).
- **(b) Política de dependência entre pacotes.** Definir `dependency` com `^0.x` versus `peerDependency` com faixa; configurar `onlyUpdatePeerDependentsWhenOutOfRange` no Changesets; o `@nx/dependency-checks` escreve `0.0.0` exato nos peers. Codificar a regra em `tools/check-repo-rules.mjs`. Prazo: antes do primeiro import entre pacotes (spec 04).
- **(c) Fluxo de publicação de `angular` e `render`.** `npm pack` na pasta do pacote gera tarball de fontes; publicar `dist/packages/*`. Criar guard contra publicar a partir do fonte e checar o `TODO-AUTOR` do `dist/LICENSE` na publicação. O fluxo de publicação é Changesets; os blocos de Nx Release foram removidos dos `project.json`. Prazo: antes da spec 09.

## Consequências

- Versões exatas de Angular, TypeScript e Nx evitam surpresas; atualizar é decisão consciente, com novo registro aqui.
- O escopo `@cds` pode mudar; até a confirmação nada é publicado.
- Contribuidores precisam de npm 11 (`npm i -g npm@11`); com npm 10 a instalação falha de propósito.
- Vitest fica em 4.x até o `@nx/vitest` aceitar o 5.
- A duplicação de `ignoreDeprecations` nos tsup é aceita por ora.

## Pendências do autor

Marcador `TODO-AUTOR` (`grep -rn TODO-AUTOR --exclude-dir=node_modules --exclude-dir=.git .`):

- Organização npm `cds` não confirmada: escopo `@cds` provisório, plano B `cds-text-editor-*`.
- Organização/usuário do GitHub (`.github/CODEOWNERS`, URLs `repository`/`bugs`/`homepage` dos `package.json`).
- Nome do autor no `LICENSE`.
- E-mail de contato de segurança (`SECURITY.md`, `CODE_OF_CONDUCT.md`).
- Nome do repositório (sugerido: `cds-text-editor`).
