# Achados de scaffolding (verificados em 2026-10-02)

> Levantados antes de escrever o plano da spec 01, consultando o registro do npm e rodando os geradores do Nx numa pasta descartável. **Reconfirmar as versões no dia de criar o workspace**: elas mudam. O que importa aqui são as **restrições** e as **armadilhas**.

## 1. Versões encontradas (`latest` no dia)

| Pacote | Versão | Observação |
|---|---|---|
| `@angular/core`, `@angular/cli`, `@angular/aria` | 22.2.1 | `@angular/aria` já em `latest` |
| `ng-packagr` | 22.2.4 | peer `@angular/compiler-cli ^22` |
| `nx`, `@nx/angular`, `@nx/js` | 23.2.1 | o template do `create-nx-workspace@23.2.1` fixou **23.2.0**; `@nx/angular` aceita Angular `>=20 <23` |
| `@tiptap/core`, `@tiptap/pm` | 3.31.4 | as extensões `@tiptap/extension-*` fixam `@tiptap/core` **exato** (`3.31.4`): manter todas na mesma versão |
| `typescript` | 7.0.2 (`latest`) | **NÃO usar**: veja 2.1 |
| `vitest` | 5.0.3 (`latest`) | **usar 4.x**: veja 2.4 |
| `@playwright/test` | 1.63.0 | |
| `publint` / `@arethetypeswrong/cli` | 0.3.25 / 0.18.5 | |
| `license-checker-rseidelsohn` | 5.0.1 | |
| `@changesets/cli` | 3.0.3 | |
| `angular-eslint` | 22.5.0 | peer `eslint ^9 \|\| ^10`, `typescript-eslint ^8` |
| Node / npm nesta máquina | 22.23.3 / 10.9.9 | npm 10.9.9 **não serve**: veja 2.2 |

## 2. Restrições e armadilhas

### 2.1 TypeScript deve ser 6.0.x
`@angular/compiler-cli`, `@angular/build` e `ng-packagr` declaram `typescript: ">=6.0 <6.1"`. O `latest` do npm é o 7.0.2, que **não** é aceito. Fixar `"typescript": "~6.0.3"` (o template do Nx já faz isso).

### 2.2 npm 10.9.9 quebra o `npm install` do workspace; usar npm 11+
Com o workspace do Nx 23 (npm workspaces + libs geradas), o `npm install` do **npm 10.9.9** falha com `Cannot read properties of null (reading 'edgesOut')`, de forma reproduzível (inclusive apagando `node_modules` e o lockfile). Com **npm 11.21.0** e **npm 12.2.0** instala normalmente (498 pacotes). `--legacy-peer-deps` também contorna, mas **esconde conflitos de peer**, o que é inaceitável numa lib. Decisão para o projeto: exigir **Node 22 LTS e npm 11+** (`engines` no `package.json` + `engine-strict=true` no `.npmrc`).
- Os geradores do Nx chamam `npm install` por conta própria; por isso o npm 11 precisa estar **no PATH** (instalação global do npm, ou um *shim* `npm` que execute `npx npm@11 "$@"`).
- O npm 12 não executa *postinstall* por padrão (aviso `install-scripts`); se for usado, aprovar o `nx` com `npm install-scripts approve nx`.

### 2.3 `@nx/angular` NÃO aceita o setup padrão novo do Nx 23 (TypeScript com project references)
`npx create-nx-workspace@23.2.1 <nome> --preset=ts` (ou `apps`) vira o template `nrwl/empty-template`, que cria: workspace por npm workspaces (`packages/*`), `tsconfig.base.json` com `composite: true` e `customConditions`, projetos descobertos pelo plugin `@nx/js/typescript` e `tsconfig.json` raiz com `references`. Nesse setup:
```
NX   The "@nx/angular" plugin doesn't support the existing TypeScript setup
The Angular framework doesn't support a TypeScript setup with project references.
(contornável só com NX_IGNORE_UNSUPPORTED_TS_SETUP=true, "por sua conta e risco")
```
Os flags `--workspaceType=integrated`, `--workspaces=false` e `--linter/--unitTestRunner` são **ignorados** por esse template. **Consequência:** o workspace do projeto precisa do **layout integrado clássico** (path aliases em `tsconfig.base.json`, sem project references), mesmo com pacotes sem Angular. **Não testado ainda** (a verificação foi interrompida): `--preset=angular-monorepo` (gera um app Angular, que poderia virar o `apps/demo`) e as variantes `angular-standalone`/`apps`+`@nx/angular:init`. A primeira tarefa do plano deve **testar essas alternativas antes de decidir** o layout, e registrar o resultado em ADR.

### 2.4 Vitest 4.x, não 5.x
`@nx/vitest` 23.2 aceita `vitest ^3 \|\| ^4` e o template usa `~4.1.0` com `vite ^8`. O `@angular/build` aceita `^4.0.8 \|\| ^5`. A interseção é **4.x**.

### 2.5 O que foi verificado e funciona
Num workspace gerado do template `ts` com npm 11.21: `nx g @nx/js:library --directory=packages/core --name=rte-core --importPath=@cds/rte-core --bundler=tsc --publishable --unitTestRunner=vitest --linter=eslint --formatter=prettier --no-interactive` gerou a biblioteca e `nx run-many -t build,test,lint` ficou **verde** (build em 1 s).
- O `package.json` gerado já traz `exports` com a condição `@org/source` (aponta para `src/index.ts` dentro do monorepo e para `dist` na publicação), `files`, `type: "module"` e `nx.name`.
- Por padrão o nome do projeto Nx vem do `--name` (`rte-core`), e o diretório é `packages/core`.
- O template também gera `AGENTS.md`, `CLAUDE.md`, `opencode.json` e pastas `.agents/ .claude/ .codex/ .cursor/ .gemini/ .opencode/` mesmo com `--aiAgents=none`: **revisar e apagar o que não for usado** (a spec 01 pede um `CLAUDE.md` próprio).
- `create-nx-workspace` precisa de **pasta vazia** (ou de um nome novo): criar em pasta temporária e mover o conteúdo, ou criar o workspace antes de copiar `docs/specs/`.

### 2.6 Outros pontos
- O gerador de lib do Nx adiciona `.verdaccio/config.yml` e um alvo `local-registry` no `package.json`: útil para a **instalação limpa** (spec 01, aceite 6, e spec 07) com Verdaccio local; manter.
- A condição de export `@org/source` usa o nome do workspace (`@org/source`). Renomear o workspace (por exemplo para `@cds/source`) mudaria a condição: decidir no começo.
- Comandos com flags: **sempre checar `--help` ou `--dry-run`** antes (regra do `CLAUDE.md` do modelo); as opções acima valem para Nx 23.2.

## 3. Impacto no plano da spec 01

1. **Primeira tarefa:** escolher o layout do workspace testando em pasta descartável (2.3) e fixar em ADR.
2. **Pré-requisitos do `CONTRIBUTING`:** Node 22 LTS e npm 11+; `engines` e `.npmrc` com `engine-strict`.
3. **Versões fixadas:** TypeScript `~6.0.3`, Vitest `~4.1`, Angular `^22`, Nx `23.2.x`, Tiptap `3.31.x` (iguais entre si).
4. **Limpeza pós-geração:** arquivos de agentes de IA que o template cria.
