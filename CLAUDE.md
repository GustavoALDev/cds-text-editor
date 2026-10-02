# CLAUDE.md

Monorepo `cds-text-editor`: editor de texto rico para Angular 22+ sobre Tiptap 3 (Nx 23 + npm workspaces). Pacotes em `packages/`: `core`, `sanitizer`, `theme` (build com tsup) e `angular`, `render` (build com ng-packagr). Decisões em `docs/decisions/` (ADR 0001).

## Regra principal

**Nenhum recurso é feito sem teste automatizado e verificação em navegador real.**

## Fluxo de trabalho

spec → plano (`writing-plans`) → implementação → verificação. As specs ficam em `docs/specs/`; `docs/specs/README.md` é o índice e define a ordem.

## Comandos

```bash
npm ci                                                  # instalar (use o lockfile)
npx nx run-many -t lint,build,test,verify-package       # lint, build, testes e npm pack + publint + attw
npm run check:rules                                     # regras do repositório (tools/check-repo-rules.mjs)
npm run check:licenses                                  # gate de licenças
npm run check:pack                                      # verify-package em todos os pacotes
npm run test:tools                                      # testes de tools/
npm run notices                                         # regenera THIRD-PARTY-NOTICES.md
npx playwright test -c e2e --project=chromium           # E2E; em WSL veja o LD_LIBRARY_PATH em e2e/README.md
npx changeset                                           # registrar mudança de pacote
```

Ambiente: `/tmp` pode ser um tmpfs pequeno; use `export TMPDIR=$HOME/.cache/tmp` (e `NX_DAEMON=false` se o daemon do Nx atrapalhar).

## Convenções

- Grafo de dependências: `theme` e `core` não dependem de nenhum pacote do workspace; `sanitizer` depende só de `core`; `angular` só de `core`; `render` de `core` e `sanitizer`. Os limites são impostos por lint (tags `scope:*` em `eslint.config.mjs`).
- Proibido importar `@angular/*` em `core`, `sanitizer` e `theme`.
- Dependência entre pacotes só via alias de `tsconfig.base.json` (`@cds/rte-*`).
- `tsconfig.spec.json` de cada pacote usa `composite: false`.
- O `build` faz parte do typecheck (não há target `typecheck` separado).
- TypeScript 6: sem `baseUrl`; `paths` usam o prefixo `./`; os configs do tsup têm `dts.compilerOptions.ignoreDeprecations: '6.0'`.
- Idiomas: documentação em pt-BR; código, nomes públicos e mensagens de erro em inglês.
- Nomes de pacote `@cds/rte-*` são provisórios. Marcadores `TODO-AUTOR` indicam dados que só o autor conhece (`grep -rn TODO-AUTOR`).
- Sem segredos no repositório.
