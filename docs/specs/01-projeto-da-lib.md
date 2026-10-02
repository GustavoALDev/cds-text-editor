# Spec 01 — Criação do projeto da lib

> Primeira spec. Entrega o **esqueleto** do repositório: nenhuma funcionalidade do editor, só a base sobre a qual as specs 02 a 09 constroem.
> Referência: `referencias/plano-geral.md` seções 0, 3.1, 4, 6.10 e 8 (Fase 0).

## 1. Objetivo

Um monorepo novo, **já em Angular 22.x**, com cinco pacotes publicáveis (vazios, mas compilando, testando e empacotando), apps de apoio, CI e as convenções que todas as specs seguintes assumem.

## 2. Fora de escopo

- Qualquer código do editor, do tema ou do sanitizador (specs 02 a 06).
- Publicação no npm (spec 09). Aqui só se prova que o pacote **seria** publicável (`npm pack`).
- Spikes S1 a S5 do plano (ficam nas specs 05 e 08).

## 3. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Licença | MIT |
| Framework | Angular 22+ somente; o `core`, o `sanitizer` e o `theme` **sem Angular** |
| Gerenciador | **npm** (lockfile `package-lock.json`) |
| Orquestração | **Nx** com npm workspaces |
| Testes | **Vitest** (libs) e **Playwright** (E2E) |
| Build Angular | `ng-packagr`; pacotes sem Angular: `tsup` ou `tsc` (ESM + tipos) |
| Versionamento | semver, **Changesets**, versão independente por pacote |

## 4. Decisões de nome (decididas)

- **Escopo npm: `@cds`** (marca do autor). Pacotes: `@cds/rte-core`, `@cds/rte-sanitizer`, `@cds/rte-theme`, `@cds/rte-angular`, `@cds/rte-render`. Nome do produto: **cds-text-editor**.
- Verificado em 2026-10-02: nenhum pacote `@cds/*` nem `cds-text-editor` existe no registro do npm. **Pendente do autor (não verificável de fora):** confirmar que a organização npm `cds` está livre ou já é dele, em `https://www.npmjs.com/org/cds`; se não estiver, registrá-la **antes de criar o workspace** (o escopo precisa ser dele para publicar). Plano B sem escopo: prefixo `cds-text-editor-*`.
- O nome **não** sugere afiliação à Tiptap ou ProseMirror; o README leva o aviso "não afiliado".
- **Ainda a definir:** nome do repositório e da organização no GitHub (sugestão: `cds-text-editor`).

## 5. Estrutura de pastas

```
<repo>/
├─ packages/
│  ├─ core/          @cds/rte-core        sem Angular
│  ├─ sanitizer/     @cds/rte-sanitizer   sem Angular; Node e navegador
│  ├─ theme/         @cds/rte-theme       CSS + JS puro, sem Angular
│  ├─ angular/       @cds/rte-angular     ng-packagr
│  └─ render/        @cds/rte-render      ng-packagr
├─ apps/
│  ├─ demo/          app Angular de demonstração (spec 07)
│  └─ ssr-smoke/     app Angular SSR mínimo para o CI (spec 08)
├─ examples/
│  └─ server-node/   upload + sanitização de referência (spec 07)
├─ docs/
│  ├─ decisions/     ADRs (decisões e resultados de spikes)
│  └─ specs/         estas specs (movidas de rte-specs/)
├─ e2e/              Playwright (spec 08)
└─ tools/            scripts (notices de licença, fixtures de contrato)
```

## 6. Requisitos

### 6.1 Workspace
- **R1.** Criado com o gerador oficial do Nx para Angular 22; **fixar** as versões de Angular, TypeScript e Tiptap (`^` só onde a faixa de peer permitir) e registrar em ADR.
- **R2.** `tsconfig.base.json` com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e **path aliases por pacote** apontando para `src/index.ts`.
- **R3.** Dependências proibidas entre pacotes (grafo, sem ciclos): `core` ← `sanitizer`; `core` ← `angular`; `core` ← `render`; `sanitizer` ← `render` (opcional); `theme` sem dependência de nenhum pacote do repo. Imposto por **regra de lint de fronteiras do Nx** (`@nx/enforce-module-boundaries`) com tags.
- **R4.** `core`, `sanitizer` e `theme` **não podem importar `@angular/*`** (regra de lint, falha o CI).

### 6.2 Cada pacote
- **R5.** `package.json` com `name`, `version` `0.0.0`, `license: "MIT"`, `exports` (um por entry point, com `types`), `sideEffects` (`false`, ou lista explícita para CSS), `files`, `peerDependencies`, `repository`, `bugs`, `homepage`, `keywords`.
- **R6.** `peerDependencies` de `angular` e `render`: `@angular/core`, `@angular/common`, `@angular/forms` em `>=22.0.0 <23`. Tiptap como **peer** do `core` na faixa decidida na spec 08, nunca como dependência direta duplicada.
- **R7.** Cada pacote tem um `src/index.ts` com **um único export de prova** (ex.: constante de versão) e um teste Vitest "hello".
- **R8.** `build` gera ESM + `.d.ts`; `npm pack --dry-run` lista só `dist`, `README`, `LICENSE`.
- **R9.** Entry points secundários previstos desde já (vazios) para não quebrar o `exports` depois: `angular/` → `/styles`, `/i18n`, `/testing`; `core/` → `/embeds`, `/code-languages`.

### 6.3 Ferramentas
- **R10.** ESLint (flat config) com `angular-eslint`, regras de fronteira e de proibição de `@angular/*`; Prettier; `.editorconfig`.
- **R11.** Vitest nas libs: **`composite` deve ser `false` em `tsconfig.spec.json`** (lição 1 do plano); runner do Angular para os pacotes Angular, Vitest puro para os demais.
- **R12.** Playwright instalado e configurado (3 engines declarados, só Chromium executado nesta spec), com `BASE_URL`, `CHROME` e `LD_LIBRARY_PATH` documentados (plano 9.1).
- **R13.** `publint` e `@arethetypeswrong/cli` rodando sobre o `dist` de cada pacote.
- **R14.** `license-checker` (ou equivalente) gerando `THIRD-PARTY-NOTICES.md` e **falhando** se surgir licença fora de MIT, ISC, BSD-2/3 e Apache-2.0, ou pacote `@tiptap-pro/*` ou `@tiptap-cloud/*`.

### 6.4 CI (GitHub Actions)
- **R15.** Em PR: `lint`, `typecheck` (**`build` incluído**, lição 15), `test`, `publint/attw`, verificação de licenças. Nx `affected` com cache.
- **R16.** Node em versão LTS atual; matriz de Angular **fica para a spec 08**.
- **R17.** Nenhum segredo necessário nesta spec.

### 6.5 Arquivos de projeto
- **R18.** `LICENSE` (MIT), `README.md` (o que é, status "em construção", aviso "não afiliado à Tiptap/ProseMirror"), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (canal de reporte privado), templates de issue e PR, `.github/CODEOWNERS`.
- **R19.** `docs/decisions/0001-…` registrando: nome/escopo, versões fixadas, Nx + npm, ferramentas de build.
- **R20.** `CLAUDE.md` na raiz com os comandos do workspace, as convenções desta spec e a regra "nenhum recurso é feito sem teste automatizado e verificação em navegador real".

## 7. Dependências externas a verificar (no dia)

Compatibilidade de `@nx/*`, Angular 22 e `ng-packagr` entre si; versão estável do Tiptap 3.x e seu peer de ProseMirror; disponibilidade do `@angular/aria` estável (usado só na spec 05, mas registrar a versão). Tudo registrado no ADR 0001.

## 8. Critérios de aceite

- [ ] `npm ci && npx nx run-many -t lint,build,test` verde em clone limpo.
- [ ] `npm pack` em cada pacote gera tarball só com `dist`, `README`, `LICENSE`; `publint` e `attw` sem erros.
- [ ] Importar `@angular/core` dentro de `core`, `sanitizer` ou `theme` **falha o lint**; importar `angular` dentro de `core` falha a regra de fronteira (testar de verdade com uma mudança descartável).
- [ ] CI verde em um PR de exemplo; falha ao introduzir licença proibida.
- [ ] `docs/decisions/0001` e `LICENSE`/`SECURITY.md` presentes.
- [ ] Um Angular 22 limpo (fora do repo) instala os tarballs de `angular` e `render` sem erro de peer.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Ferramentas ainda sem suporte ao Angular 22 no dia | Registrar no ADR; usar a última versão compatível e abrir tarefa de atualização |
| Organização npm `cds` não pertencer ao autor | Confirmar/registrar antes de criar o workspace; plano B `cds-text-editor-*` (troca global barata se feita cedo) |
| `exports` mal definido quebra consumidores depois | `attw` e `publint` no CI desde a spec 01 |
