# Projeto da lib (Spec 01) — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Criar o monorepo `cds-text-editor` em Angular 22 com 5 pacotes `@cds/rte-*` vazios que compilam, testam e empacotam, mais lint de fronteiras, CI e arquivos de projeto.

**Architecture:** Workspace Nx com npm workspaces. Pacotes sem Angular (`core`, `sanitizer`, `theme`) empacotados com `tsc`/`tsup` (ESM + tipos); pacotes Angular (`angular`, `render`) com `ng-packagr`. Fronteiras entre pacotes impostas por tags Nx + `@nx/enforce-module-boundaries`; regras que o lint não cobre ficam em `tools/check-repo-rules.mjs` (com testes).

**Tech Stack:** Nx, npm, Angular 22, TypeScript (strict), Vitest, Playwright, ESLint flat config + angular-eslint, Prettier, tsup, ng-packagr, publint, @arethetypeswrong/cli, license-checker, Changesets (config apenas), GitHub Actions.

**Spec:** `docs/specs/01-projeto-da-lib.md` (hoje em `rte-specs/01-projeto-da-lib.md`; a Tarefa 1 move a pasta). Contexto: `docs/specs/referencias/plano-geral.md` (seções 0, 3.1, 4, 6.10, 8, 9.1 e 13).

## Global Constraints

- Licença **MIT**; **Angular 22+ somente**; `core`, `sanitizer` e `theme` **sem Angular**.
- Gerenciador **npm** (`package-lock.json`); orquestração **Nx** com npm workspaces.
- Testes: **Vitest** (libs) e **Playwright** (E2E). Build Angular: `ng-packagr`; sem Angular: `tsup` ou `tsc` (ESM + tipos).
- Versionamento: semver, **Changesets**, versão independente por pacote; todos os pacotes em `0.0.0`.
- Escopo npm **`@cds`**: `@cds/rte-core`, `@cds/rte-sanitizer`, `@cds/rte-theme`, `@cds/rte-angular`, `@cds/rte-render`. Produto: **cds-text-editor**. Plano B sem escopo: `cds-text-editor-*`.
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, path aliases por pacote apontando para `src/index.ts`.
- Grafo sem ciclos: `sanitizer`→`core`; `angular`→`core`; `render`→`core`; `render`→`sanitizer` (opcional); `theme` sem dependência de pacote do repo.
- `core`, `sanitizer`, `theme` **não importam `@angular/*`** (lint falha o CI).
- `peerDependencies` de `angular` e `render`: `@angular/core`, `@angular/common`, `@angular/forms` em `>=22.0.0 <23`. Tiptap é **peer** do `core`, nunca dependência direta.
- `tsconfig.spec.json` com **`composite: false`**. Typecheck do CI **inclui `build`**.
- Entry points secundários vazios desde já: `angular/` → `/styles`, `/i18n`, `/testing`; `core/` → `/embeds`, `/code-languages`.
- Licenças permitidas: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0; **proibido** `@tiptap-pro/*` e `@tiptap-cloud/*`.
- Node em LTS atual. Nenhum segredo no CI. Matriz Angular × Tiptap **fica para a spec 08**.
- Idioma: docs internas em Português-Brasil; código e nomes públicos em inglês.
- Nomes de APIs/flags do Nx e do Angular 22 são **esboços**: reconfirmar com `--help`/`--dry-run` e a documentação oficial no dia (cada geração abaixo tem um passo `--dry-run`).
- Nenhum recurso é "feito" sem teste automatizado e verificação em navegador real (aqui: Playwright carrega uma página mínima em Chromium).

## Review Focus

1. **Clone limpo sem cache do Nx:** build de um pacote que depende de outro falha porque a ordem/`dependsOn` não está declarada → teste: `rm -rf node_modules .nx dist && npm ci && npx nx run-many -t build` (Tarefa 10).
2. **Import transitivo de Angular no `core`:** o lint só pega import direto; um `@angular/*` em `dependencies`/`peerDependencies` de `core`/`sanitizer`/`theme` passa batido → `tools/check-repo-rules.mjs` falha se existir (Tarefa 4).
3. **`composite: true` voltando em algum `tsconfig.spec.json`** (lição 1: "No test suite found") → o mesmo script falha o CI (Tarefa 4).
4. **Tarball com lixo** (`*.spec.*`, `*.tsbuildinfo`, `src/`, mapas não pedidos) ou sem `types` no `exports` → `tools/check-pack.mjs` + `attw` (Tarefa 6).
5. **Licença proibida só em dependência transitiva de produção** (ex.: `@tiptap-pro/*` puxado por terceiro) → verificador varre o `package-lock.json` inteiro, não só `package.json` (Tarefa 7).

---

## Estrutura de arquivos (alvo)

```
cds-text-editor/
├─ package.json  nx.json  tsconfig.base.json  eslint.config.mjs  .prettierrc  .editorconfig
├─ packages/{core,sanitizer,theme,angular,render}/   (package.json, project.json, src/index.ts, src/index.spec.ts)
├─ packages/core/embeds/  packages/core/code-languages/  packages/angular/{styles,i18n,testing}/  (entry points vazios)
├─ apps/{demo,ssr-smoke}/      (só placeholders: README.md; apps reais nas specs 07/08)
├─ examples/server-node/       (README.md placeholder)
├─ e2e/  (playwright.config.ts, smoke.spec.ts, fixtures/blank.html)
├─ tools/ (check-repo-rules.mjs, check-repo-rules.test.mjs, check-pack.mjs, check-licenses.mjs, generate-notices.mjs)
├─ docs/{decisions/0001-*.md, specs/, superpowers/plans/}
├─ .github/{workflows/ci.yml, ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md, CODEOWNERS}
└─ LICENSE README.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md CLAUDE.md THIRD-PARTY-NOTICES.md .changeset/
```

---

### Task 0: Confirmar a organização npm `cds` (BLOQUEANTE) — responsável: o autor

**Files:** nenhum (decisão registrada na Tarefa 9, ADR 0001).

- [ ] **Passo 1: Autor confirma a organização**

Abrir `https://www.npmjs.com/org/cds` logado. Resultado esperado: a organização pertence ao autor, **ou** está livre e é registrada agora. Se não for possível, decidir o plano B `cds-text-editor-*` (troca global de `@cds/rte-X` para `cds-text-editor-X`).

- [ ] **Passo 2: Registrar o resultado**

Responder no chat: "org cds confirmada" ou "usar plano B". **Nenhuma tarefa seguinte começa sem isso** (a spec exige a confirmação antes de criar o workspace).

---

### Task 1: Repositório git, specs movidas e workspace Nx

**Files:**
- Create: `.gitignore`, `package.json`, `nx.json`, `tsconfig.base.json`, `.prettierrc`, `.editorconfig`, `eslint.config.mjs` (gerados pelo Nx, depois ajustados)
- Move: `rte-specs/` → `docs/specs/`

**Interfaces:**
- Produces: workspace com `npm run`/`npx nx` funcionando; raiz do repo em `/home/gustavo/Projetos/cds-text-editor`.

- [ ] **Passo 1: Inicializar git e mover as specs**

```bash
cd /home/gustavo/Projetos/cds-text-editor
git init -b main
mkdir -p docs && mv rte-specs docs/specs
```

- [ ] **Passo 2: Descobrir as flags do gerador do Nx no dia**

```bash
npx create-nx-workspace@latest --help
```
Anotar as flags vigentes para `--preset`, `--pm`, `--nxCloud`, `--interactive`. Registrar versão do Nx usada.

- [ ] **Passo 3: Gerar o workspace em pasta temporária**

O diretório raiz não está vazio, então gerar ao lado e copiar:

```bash
cd /home/gustavo/Projetos
npx create-nx-workspace@latest scaffold-tmp --preset=apps --pm=npm --nxCloud=skip --interactive=false
rsync -a --exclude .git --exclude node_modules scaffold-tmp/ cds-text-editor/
rm -rf scaffold-tmp
cd cds-text-editor && npm install
```
Esperado: `nx.json`, `package.json`, `package-lock.json` na raiz; `docs/` e `rte-specs`→`docs/specs` preservados.

- [ ] **Passo 4: Adicionar os plugins**

```bash
npx nx add @nx/angular
npx nx add @nx/js
npx nx add @nx/vitest
npx nx add @nx/playwright
npx nx add @nx/eslint
```
Esperado: `Angular` na versão **22.x** em `package.json`. Se o `@nx/angular` ainda não suportar Angular 22, **parar**, registrar no ADR e usar a última versão compatível (spec, seção 9). Fixar versões de Angular, TypeScript e Tiptap sem `^` (editar `package.json` e rodar `npm install`).

- [ ] **Passo 5: `tsconfig.base.json` estrito**

Em `compilerOptions`, garantir:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "declaration": true,
  "skipLibCheck": true
}
```
(Os `paths` entram na Tarefa 2/3, junto de cada pacote.)

- [ ] **Passo 6: Verificar o workspace vazio**

Run: `npx nx show projects` — Expected: lista vazia ou só projetos do preset, sem erro.

- [ ] **Passo 7: `.gitignore` e commit**

`.gitignore` deve conter: `node_modules`, `dist`, `.nx/cache`, `.nx/workspace-data`, `*.tsbuildinfo`, `playwright-report`, `test-results`, `coverage`, `*.tgz`.

```bash
git add -A
git commit -m "chore: inicia workspace Nx (Angular 22) e move specs para docs/specs"
```

---

### Task 2: Pacotes sem Angular (`core`, `sanitizer`, `theme`)

**Files:**
- Create: `packages/{core,sanitizer,theme}/{package.json,project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,tsup.config.ts,README.md}`
- Create: `packages/{core,sanitizer,theme}/src/index.ts`, `src/index.spec.ts`
- Create: `packages/core/embeds/{package.json,src/index.ts}`, `packages/core/code-languages/{package.json,src/index.ts}`
- Modify: `tsconfig.base.json` (paths)

**Interfaces:**
- Produces: `CORE_VERSION`, `SANITIZER_VERSION`, `THEME_VERSION` (todas `string`, valor `'0.0.0'`) exportadas de `@cds/rte-core`, `@cds/rte-sanitizer`, `@cds/rte-theme`. Targets Nx por pacote: `build`, `test`, `lint`.
- Tags Nx: `scope:core`, `scope:sanitizer`, `scope:theme`.

- [ ] **Passo 1: Escrever o teste que falha (core)**

`packages/core/src/index.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index';

describe('@cds/rte-core', () => {
  it('exports its version', () => {
    expect(CORE_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Passo 2: Gerar a lib com o gerador do Nx (dry-run primeiro)**

```bash
npx nx g @nx/js:library --help
npx nx g @nx/js:library core --directory=packages/core --importPath=@cds/rte-core --bundler=tsc --unitTestRunner=vitest --linter=eslint --tags=scope:core --dry-run
```
Se o dry-run estiver coerente, repetir sem `--dry-run`. Repetir para `sanitizer` (`--tags=scope:sanitizer`) e `theme` (`--tags=scope:theme`). O gerador cria `src/index.ts` e `src/lib/*`: **apagar `src/lib`** e deixar só `index.ts` e `index.spec.ts`.

- [ ] **Passo 3: Rodar o teste e ver falhar**

Run: `npx nx test core` — Expected: FAIL (`CORE_VERSION` não exportado).

- [ ] **Passo 4: Implementação mínima**

`packages/core/src/index.ts`:

```ts
export const CORE_VERSION = '0.0.0';
```
Análogos: `SANITIZER_VERSION` em `packages/sanitizer/src/index.ts` e `THEME_VERSION` em `packages/theme/src/index.ts`, cada um com seu `index.spec.ts` espelhando o acima.

- [ ] **Passo 5: `package.json` de cada pacote**

Exemplo `packages/core/package.json` (os outros mudam `name`, `description`, `keywords`, `peerDependencies`):

```json
{
  "name": "@cds/rte-core",
  "version": "0.0.0",
  "description": "Núcleo do editor de texto rico cds-text-editor: extensões Tiptap, utilitários e esquema do HTML.",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "files": ["dist", "README.md", "LICENSE"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./embeds": { "types": "./dist/embeds/index.d.ts", "default": "./dist/embeds/index.js" },
    "./code-languages": { "types": "./dist/code-languages/index.d.ts", "default": "./dist/code-languages/index.js" }
  },
  "peerDependencies": { "@tiptap/core": "^3.0.0", "@tiptap/pm": "^3.0.0" },
  "repository": { "type": "git", "url": "git+https://github.com/<org>/cds-text-editor.git", "directory": "packages/core" },
  "bugs": "https://github.com/<org>/cds-text-editor/issues",
  "homepage": "https://github.com/<org>/cds-text-editor#readme",
  "keywords": ["rich-text-editor", "tiptap", "prosemirror", "angular"]
}
```
`<org>` é a organização do GitHub, ainda indefinida: **o autor informa antes deste passo** (sugestão da spec: repositório `cds-text-editor`). `sanitizer` e `theme` não declaram peer de Tiptap; `theme` exporta também `"./theme.css"` (arquivo vazio `src/theme.css` com comentário `/* @cds/rte-theme — spec 02 */`) e `"sideEffects": ["*.css"]`. A faixa `^3.0.0` do Tiptap é provisória até a spec 08 (registrar no ADR).

- [ ] **Passo 6: Entry points secundários vazios do `core`**

`packages/core/embeds/src/index.ts` e `packages/core/code-languages/src/index.ts`:

```ts
export {};
```
Configurar o `tsup.config.ts` do `core` com `entry: ['src/index.ts', 'embeds/src/index.ts', 'code-languages/src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`, saída para que `dist/embeds/index.js` exista (usar `outDir: 'dist'` e `entry` como objeto `{ index: 'src/index.ts', 'embeds/index': 'embeds/src/index.ts', 'code-languages/index': 'code-languages/src/index.ts' }`). Os outros dois usam só `{ index: 'src/index.ts' }`. Trocar o executor `build` do `project.json` por `nx:run-commands` com `command: "tsup"` e `cwd` do pacote (ou manter `@nx/js:tsc` se gerar o mesmo `dist` com `types`; o requisito é só ESM + `.d.ts`).

- [ ] **Passo 7: Paths no `tsconfig.base.json`**

```json
"paths": {
  "@cds/rte-core": ["packages/core/src/index.ts"],
  "@cds/rte-core/embeds": ["packages/core/embeds/src/index.ts"],
  "@cds/rte-core/code-languages": ["packages/core/code-languages/src/index.ts"],
  "@cds/rte-sanitizer": ["packages/sanitizer/src/index.ts"],
  "@cds/rte-theme": ["packages/theme/src/index.ts"]
}
```

- [ ] **Passo 8: `composite: false` nos `tsconfig.spec.json`**

Em cada `packages/*/tsconfig.spec.json`: `"composite": false` explícito em `compilerOptions`.

- [ ] **Passo 9: Rodar testes e build**

Run: `npx nx run-many -t test,build -p core sanitizer theme`
Expected: PASS; `packages/core/dist/index.js`, `index.d.ts`, `embeds/index.js`, `code-languages/index.js` existem.

- [ ] **Passo 10: Commit**

```bash
git add -A
git commit -m "feat: pacotes sem Angular (core, sanitizer, theme) com build e teste hello"
```

---

### Task 3: Pacotes Angular (`angular`, `render`)

**Files:**
- Create: `packages/angular/{package.json,project.json,ng-package.json,tsconfig*.json,README.md,src/index.ts,src/index.spec.ts}`
- Create: `packages/angular/{styles,i18n,testing}/{ng-package.json,src/index.ts}`
- Create: `packages/render/{package.json,project.json,ng-package.json,tsconfig*.json,README.md,src/index.ts,src/index.spec.ts}`
- Modify: `tsconfig.base.json` (paths)

**Interfaces:**
- Consumes: nada (ainda não importam `core`; o grafo é declarado, não exercitado, nesta spec).
- Produces: `ANGULAR_VERSION`, `RENDER_VERSION` (`'0.0.0'`) de `@cds/rte-angular` e `@cds/rte-render`; entry points `@cds/rte-angular/styles|i18n|testing`. Tags: `scope:angular`, `scope:render`.

- [ ] **Passo 1: Teste que falha**

`packages/angular/src/index.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ANGULAR_VERSION } from './index';

describe('@cds/rte-angular', () => {
  it('exports its version', () => {
    expect(ANGULAR_VERSION).toBe('0.0.0');
  });
});
```
Análogo para `render` (`RENDER_VERSION`).

- [ ] **Passo 2: Gerar as libs (dry-run primeiro)**

```bash
npx nx g @nx/angular:library --help
npx nx g @nx/angular:library angular --directory=packages/angular --importPath=@cds/rte-angular --publishable --unitTestRunner=vitest --linter=eslint --tags=scope:angular --standalone --dry-run
```
Confirmar no `--help` o nome real da flag do executor de testes do Angular 22 (runner do Angular conforme R11) e do bundler `ng-packagr`. Depois gerar sem `--dry-run`, e `render` (`--tags=scope:render`). **Apagar** componentes/`lib` gerados; manter só `src/index.ts` e `src/index.spec.ts`.

- [ ] **Passo 3: Rodar e ver falhar**

Run: `npx nx test angular` — Expected: FAIL.

- [ ] **Passo 4: Implementação mínima**

`packages/angular/src/index.ts`: `export const ANGULAR_VERSION = '0.0.0';`
`packages/render/src/index.ts`: `export const RENDER_VERSION = '0.0.0';`

- [ ] **Passo 5: Entry points secundários do `angular`**

Para cada `styles`, `i18n`, `testing`: `ng-package.json`

```json
{ "$schema": "../../../node_modules/ng-packagr/ng-package.schema.json", "lib": { "entryFile": "src/index.ts" } }
```
e `src/index.ts` com `export {};`. Paths: `@cds/rte-angular/styles|i18n|testing` apontando para esses `src/index.ts`.

- [ ] **Passo 6: `package.json` de `angular` e `render`**

Além dos campos do R5 (idênticos à Tarefa 2, com `directory` e `keywords` próprios, `"sideEffects": false` — `angular/styles` ganha lista explícita na spec 05):

```json
"peerDependencies": {
  "@angular/core": ">=22.0.0 <23",
  "@angular/common": ">=22.0.0 <23",
  "@angular/forms": ">=22.0.0 <23"
}
```
Sem `dependencies` de Angular. `exports` é gerado pelo `ng-packagr` no `dist`; conferir que cada entry point secundário tem `types`.

- [ ] **Passo 7: `composite: false` nos `tsconfig.spec.json`** (igual Tarefa 2, Passo 8).

- [ ] **Passo 8: Rodar testes e build**

Run: `npx nx run-many -t test,build -p angular render`
Expected: PASS; `dist/packages/angular` (ou o `dist` configurado) contém `fesm2022`, `.d.ts` e `package.json` com `exports` de `.`, `./styles`, `./i18n`, `./testing`.

- [ ] **Passo 9: Commit**

```bash
git add -A
git commit -m "feat: pacotes Angular (angular, render) com ng-packagr, peers >=22 <23 e entry points"
```

---

### Task 4: Lint, fronteiras e regras do repositório

**Files:**
- Modify: `eslint.config.mjs`
- Create: `tools/check-repo-rules.mjs`, `tools/check-repo-rules.test.mjs`
- Modify: `package.json` (scripts `check:rules`, `test:tools`)

**Interfaces:**
- Produces: `checkRepoRules(rootDir: string): string[]` (lista de violações; vazia = ok) exportada de `tools/check-repo-rules.mjs`; script `npm run check:rules` (sai com código 1 se houver violação).

- [ ] **Passo 1: Configurar fronteiras e proibição de `@angular/*`**

Em `eslint.config.mjs` (flat config), adicionar:

```js
{
  files: ['**/*.ts'],
  rules: {
    '@nx/enforce-module-boundaries': ['error', {
      enforceBuildableLibDependency: true,
      allow: [],
      depConstraints: [
        { sourceTag: 'scope:theme', onlyDependOnLibsWithTags: [] },
        { sourceTag: 'scope:core', onlyDependOnLibsWithTags: [] },
        { sourceTag: 'scope:sanitizer', onlyDependOnLibsWithTags: ['scope:core'] },
        { sourceTag: 'scope:angular', onlyDependOnLibsWithTags: ['scope:core'] },
        { sourceTag: 'scope:render', onlyDependOnLibsWithTags: ['scope:core', 'scope:sanitizer'] }
      ]
    }]
  }
},
{
  files: ['packages/core/**/*.ts', 'packages/sanitizer/**/*.ts', 'packages/theme/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['@angular/*'], message: 'core, sanitizer e theme não podem importar @angular/* (spec 01, R4).' }]
    }]
  }
}
```
Manter `angular-eslint` nos arquivos de `packages/angular` e `packages/render`; `prettier` e `.editorconfig` (`indent_size = 2`, `end_of_line = lf`, `insert_final_newline = true`).

- [ ] **Passo 2: Teste da prova de lint (violação descartável)**

```bash
echo "import '@angular/core';" > packages/core/src/tmp-violation.ts
npx nx lint core
```
Expected: **FAIL** citando `no-restricted-imports`. Depois:

```bash
rm packages/core/src/tmp-violation.ts
echo "import '@cds/rte-angular';" > packages/core/src/tmp-violation.ts
npx nx lint core
```
Expected: **FAIL** por `enforce-module-boundaries`. Remover o arquivo: `rm packages/core/src/tmp-violation.ts`. Run: `npx nx lint core` — Expected: PASS.

- [ ] **Passo 3: Escrever o teste do verificador (falha primeiro)**

`tools/check-repo-rules.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRepoRules } from './check-repo-rules.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'rules-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test('accepts a clean repo', () => {
  const root = fixture({
    'packages/core/package.json': JSON.stringify({ name: '@cds/rte-core', peerDependencies: { '@tiptap/core': '^3.0.0' } }),
    'packages/core/tsconfig.spec.json': JSON.stringify({ compilerOptions: { composite: false } }),
  });
  assert.deepEqual(checkRepoRules(root), []);
});

test('rejects @angular/* in core peerDependencies', () => {
  const root = fixture({
    'packages/core/package.json': JSON.stringify({ name: '@cds/rte-core', peerDependencies: { '@angular/core': '>=22' } }),
  });
  assert.equal(checkRepoRules(root).length, 1);
});

test('rejects composite true in tsconfig.spec.json', () => {
  const root = fixture({
    'packages/angular/tsconfig.spec.json': JSON.stringify({ compilerOptions: { composite: true } }),
  });
  assert.equal(checkRepoRules(root).length, 1);
});
```

Run: `node --test tools/check-repo-rules.test.mjs` — Expected: FAIL (módulo não existe).

- [ ] **Passo 4: Implementar o verificador**

`tools/check-repo-rules.mjs`:

```js
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NO_ANGULAR = ['core', 'sanitizer', 'theme'];
const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];

export function checkRepoRules(rootDir) {
  const errors = [];
  const packagesDir = join(rootDir, 'packages');
  if (!existsSync(packagesDir)) return errors;

  for (const pkg of readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, pkg, 'package.json');
    if (NO_ANGULAR.includes(pkg) && existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      for (const field of DEP_FIELDS) {
        for (const dep of Object.keys(manifest[field] ?? {})) {
          if (dep.startsWith('@angular/')) {
            errors.push(`packages/${pkg}/package.json: ${dep} em ${field} (proibido em ${pkg})`);
          }
        }
      }
    }
    const specConfig = join(packagesDir, pkg, 'tsconfig.spec.json');
    if (existsSync(specConfig)) {
      const config = JSON.parse(readFileSync(specConfig, 'utf8'));
      if (config.compilerOptions?.composite === true) {
        errors.push(`packages/${pkg}/tsconfig.spec.json: composite deve ser false`);
      }
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = checkRepoRules(process.cwd());
  for (const e of errors) console.error(e);
  process.exit(errors.length ? 1 : 0);
}
```
Nota: `tsconfig.spec.json` real pode ter comentários; se `JSON.parse` falhar, trocar por `JSON.parse(text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, ''))` e adicionar um teste com comentário.

- [ ] **Passo 5: Rodar o teste e o verificador**

Run: `node --test tools/check-repo-rules.test.mjs && node tools/check-repo-rules.mjs` — Expected: PASS, saída vazia.

- [ ] **Passo 6: Scripts no `package.json` da raiz**

```json
"check:rules": "node tools/check-repo-rules.mjs",
"test:tools": "node --test tools/"
```

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "feat: lint de fronteiras, proibição de @angular/* e verificador de regras do repo"
```

---

### Task 5: Playwright configurado (3 engines declarados, Chromium executado)

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/fixtures/blank.html`, `e2e/smoke.spec.ts`, `e2e/README.md`

**Interfaces:**
- Produces: `npx playwright test -c e2e` executável; variáveis `BASE_URL` (padrão: `file://` da fixture), `CHROME` (caminho do binário), `LD_LIBRARY_PATH` documentados em `e2e/README.md`.

- [ ] **Passo 1: Teste que falha**

`e2e/smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const baseUrl = process.env['BASE_URL'] ?? pathToFileURL(resolve(__dirname, 'fixtures/blank.html')).href;

test('loads a blank page in a real browser', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.locator('h1')).toHaveText('cds-text-editor');
});
```

Run: `npx playwright test -c e2e` — Expected: FAIL (config/fixture ausentes).

- [ ] **Passo 2: Fixture e config**

`e2e/fixtures/blank.html`:

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>blank</title></head>
<body><h1>cds-text-editor</h1></body></html>
```

`e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const chrome = process.env['CHROME'];

export default defineConfig({
  testDir: '.',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(chrome ? { launchOptions: { executablePath: chrome } } : {}) } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@nonexistent-until-spec-08/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@nonexistent-until-spec-08/ },
  ],
});
```
(Firefox e WebKit **declarados** mas sem testes até a spec 08; a regex impede execução.)

- [ ] **Passo 3: Instalar o navegador e rodar**

```bash
npx playwright install chromium
npx playwright test -c e2e --project=chromium
```
Expected: 1 passed. Se falhar por bibliotecas ausentes (WSL), seguir `plano-geral.md` §9.1: extrair `libnspr4`, `libnss3`, `libasound2` de `.deb` numa pasta e exportar `LD_LIBRARY_PATH` e `CHROME`; documentar o procedimento exato usado em `e2e/README.md`.

- [ ] **Passo 4: `e2e/README.md`**

Documentar `BASE_URL`, `CHROME`, `LD_LIBRARY_PATH`, o comando `npx playwright test -c e2e --project=chromium` e a nota "Firefox e WebKit entram na spec 08".

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "test: Playwright configurado com smoke em Chromium"
```

---

### Task 6: Validação de pacote (`publint`, `attw`, `npm pack`)

**Files:**
- Create: `tools/check-pack.mjs`, `tools/check-pack.test.mjs`
- Modify: `package.json` (scripts `check:pack`), `nx.json`/`project.json` (target `verify-package` por pacote)

**Interfaces:**
- Produces: `checkPackFiles(files: string[]): string[]` (violações) exportada de `tools/check-pack.mjs`; CLI `node tools/check-pack.mjs <dir-do-pacote>` que roda `npm pack --dry-run --json`, aplica `checkPackFiles`, `publint` e `attw --pack`.

- [ ] **Passo 1: Teste que falha**

`tools/check-pack.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPackFiles } from './check-pack.mjs';

test('accepts dist, README, LICENSE and package.json', () => {
  assert.deepEqual(checkPackFiles(['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts']), []);
});

test('rejects sources, specs and tsbuildinfo', () => {
  const errors = checkPackFiles(['package.json', 'src/index.ts', 'dist/index.spec.js', 'tsconfig.tsbuildinfo']);
  assert.equal(errors.length, 3);
});
```
Run: `node --test tools/check-pack.test.mjs` — Expected: FAIL.

- [ ] **Passo 2: Implementar**

`tools/check-pack.mjs`:

```js
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ALLOWED = [/^package\.json$/, /^README\.md$/, /^LICENSE$/, /^dist\//];
const FORBIDDEN = [/\.spec\./, /\.tsbuildinfo$/];

export function checkPackFiles(files) {
  const errors = [];
  for (const file of files) {
    if (FORBIDDEN.some((re) => re.test(file)) || !ALLOWED.some((re) => re.test(file))) {
      errors.push(`arquivo inesperado no tarball: ${file}`);
    }
  }
  return errors;
}

function run(cwd, cmd, args) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  const [report] = JSON.parse(run(dir, 'npm', ['pack', '--dry-run', '--json']));
  const errors = checkPackFiles(report.files.map((f) => f.path));
  run(dir, 'npx', ['publint', '--strict']);
  run(dir, 'npx', ['attw', '--pack', '.', '--profile', 'esm-only']);
  for (const e of errors) console.error(e);
  process.exit(errors.length ? 1 : 0);
}
```
Instalar: `npm i -D publint @arethetypeswrong/cli`. Pacotes Angular: apontar para a pasta `dist` gerada pelo `ng-packagr` (que já é um pacote com `package.json`); pacotes `tsup`: o `package.json` do pacote com `files: ["dist", ...]`. Copiar `LICENSE` da raiz para cada pacote no passo de build (target `build` ganha `cp ../../LICENSE .` ou equivalente via `assets`).

- [ ] **Passo 3: Rodar o teste unitário**

Run: `node --test tools/check-pack.test.mjs` — Expected: PASS.

- [ ] **Passo 4: Rodar nos 5 pacotes**

```bash
npx nx run-many -t build
for p in core sanitizer theme; do node tools/check-pack.mjs packages/$p; done
```
Para `angular` e `render`, passar a pasta `dist` correspondente. Expected: sem erros do `publint` e do `attw`. Se o `attw` reclamar de resolução `node10` num pacote ESM-only, manter o perfil `esm-only` e registrar no ADR.

- [ ] **Passo 5: Target do Nx e commit**

Adicionar `verify-package` por pacote chamando o script, com `dependsOn: ["build"]`.

```bash
git add -A
git commit -m "feat: verificação de pacote (npm pack, publint, attw)"
```

---

### Task 7: Verificação de licenças e `THIRD-PARTY-NOTICES.md`

**Files:**
- Create: `tools/check-licenses.mjs`, `tools/check-licenses.test.mjs`, `tools/generate-notices.mjs`, `THIRD-PARTY-NOTICES.md`
- Modify: `package.json` (scripts `check:licenses`, `notices`)

**Interfaces:**
- Produces: `checkLicenses(lock: object, licenseOf: (name: string) => string | undefined): string[]` e `checkForbiddenNames(lock: object): string[]` de `tools/check-licenses.mjs`.

- [ ] **Passo 1: Teste que falha**

`tools/check-licenses.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkForbiddenNames, checkLicenses } from './check-licenses.mjs';

const lock = (names) => ({ packages: Object.fromEntries(names.map((n) => [`node_modules/${n}`, { version: '1.0.0' }])) });

test('rejects @tiptap-pro and @tiptap-cloud anywhere in the lockfile', () => {
  const errors = checkForbiddenNames(lock(['@tiptap-pro/extension-ai', 'foo/node_modules/@tiptap-cloud/provider']));
  assert.equal(errors.length, 2);
});

test('rejects a license outside the allowlist', () => {
  const errors = checkLicenses(lock(['good', 'bad']), (n) => (n === 'good' ? 'MIT' : 'GPL-3.0'));
  assert.equal(errors.length, 1);
});

test('accepts allowlisted licenses, including OR expressions of allowed ones', () => {
  assert.deepEqual(checkLicenses(lock(['a', 'b']), (n) => (n === 'a' ? '(MIT OR Apache-2.0)' : 'BSD-3-Clause')), []);
});
```
Run: `node --test tools/check-licenses.test.mjs` — Expected: FAIL.

- [ ] **Passo 2: Implementar**

`tools/check-licenses.mjs`:

```js
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0']);
const FORBIDDEN_RE = /(^|\/)node_modules\/@tiptap-(pro|cloud)\//;

const nameOf = (key) => key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);

export function checkForbiddenNames(lock) {
  return Object.keys(lock.packages ?? {})
    .filter((key) => FORBIDDEN_RE.test(key) || /(^|\/)@tiptap-(pro|cloud)\//.test(key))
    .map((key) => `pacote proibido: ${nameOf(key)}`);
}

function isAllowed(expression) {
  const options = expression.replace(/[()]/g, '').split(/\s+OR\s+/i);
  return options.some((option) => ALLOWED.has(option.trim()));
}

export function checkLicenses(lock, licenseOf) {
  const errors = [];
  for (const key of Object.keys(lock.packages ?? {})) {
    if (!key.includes('node_modules/')) continue;
    const name = nameOf(key);
    const license = licenseOf(name);
    if (!license || !isAllowed(license)) errors.push(`${name}: licença "${license ?? 'desconhecida'}" fora da allowlist`);
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const licenseOf = (name) => {
    const entry = Object.entries(lock.packages).find(([key]) => key.endsWith(`node_modules/${name}`))?.[1];
    return typeof entry?.license === 'string' ? entry.license : undefined;
  };
  const errors = [...checkForbiddenNames(lock), ...checkLicenses(lock, licenseOf)];
  for (const e of errors) console.error(e);
  process.exit(errors.length ? 1 : 0);
}
```
Nota: o `package-lock.json` (v3) traz o campo `license` por pacote; **somente dependências de produção** devem ser checadas em `check:licenses` (`npm ls --omit=dev --all --json` para filtrar). Como o `devDependencies` do toolchain tem licenças fora da lista (ex.: `0BSD`, `CC0-1.0`, `BlueOak`), a regra rígida vale para o que vai ao tarball: ao rodar contra o lockfile completo e aparecerem licenças legítimas de ferramentas de build, **filtrar para o conjunto de produção** em vez de ampliar a allowlist (a allowlist é a da spec). Os nomes proibidos (`@tiptap-pro/*`, `@tiptap-cloud/*`) valem para o lockfile **inteiro**.

- [ ] **Passo 3: Rodar testes**

Run: `node --test tools/check-licenses.test.mjs` — Expected: PASS.

- [ ] **Passo 4: `generate-notices.mjs`**

Gerar `THIRD-PARTY-NOTICES.md` a partir do conjunto de produção:

```bash
npm i -D license-checker-rseidelsohn
```
`tools/generate-notices.mjs` invoca `license-checker-rseidelsohn --production --markdown --excludePrivatePackages --out THIRD-PARTY-NOTICES.md`. Scripts: `"notices": "node tools/generate-notices.mjs"`, `"check:licenses": "node tools/check-licenses.mjs"`.

- [ ] **Passo 5: Rodar de verdade e commit**

Run: `npm run check:licenses && npm run notices` — Expected: sai 0; `THIRD-PARTY-NOTICES.md` criado (pode estar quase vazio: sem dependências de produção ainda).

```bash
git add -A
git commit -m "feat: verificação de licenças e geração de THIRD-PARTY-NOTICES"
```

---

### Task 8: Arquivos de projeto, ADR 0001 e `CLAUDE.md`

**Files:**
- Create: `LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CLAUDE.md`, `.changeset/config.json`, `.changeset/README.md`
- Create: `.github/ISSUE_TEMPLATE/{bug_report.md,feature_request.md}`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`
- Create: `docs/decisions/0001-escopo-nome-versoes-e-ferramentas.md`, `apps/demo/README.md`, `apps/ssr-smoke/README.md`, `examples/server-node/README.md`

**Interfaces:** nenhuma de código.

- [ ] **Passo 1: `LICENSE`** — texto MIT padrão, `Copyright (c) 2026 <nome do autor>` (o autor informa o nome a constar).

- [ ] **Passo 2: `README.md`**

Conter, em pt-BR: o que é (editor de texto rico para Angular 22+, Tiptap 3), status **"em construção"**, a lista dos 5 pacotes, e o aviso literal: "Este projeto **não é afiliado** à Tiptap nem ao ProseMirror."

- [ ] **Passo 3: `SECURITY.md`**

Canal de reporte privado: usar **GitHub Private Vulnerability Reporting** (Security → Report a vulnerability) como canal principal, mais o e-mail do autor como alternativa; prazo de resposta indicado e política "não abra issue pública".

- [ ] **Passo 4: `CONTRIBUTING.md` e `CODE_OF_CONDUCT.md`**

`CONTRIBUTING.md`: pré-requisitos (Node LTS), `npm ci`, comandos (`nx run-many -t lint,build,test`, `npm run check:rules`, `npm run check:licenses`), fluxo de PR e Changesets. `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1 (texto oficial, com o canal de contato do autor).

- [ ] **Passo 5: Changesets (config apenas)**

```bash
npm i -D @changesets/cli
npx changeset init
```
Em `.changeset/config.json`: `"access": "public"`, `"baseBranch": "main"`, `"updateInternalDependencies": "patch"`, sem `fixed`/`linked` (versão independente por pacote).

- [ ] **Passo 6: Templates e CODEOWNERS**

Templates de issue (bug com passos/versões/ambiente; feature com motivação) e de PR (checklist: testes, build, changeset, verificação em navegador). `.github/CODEOWNERS`: `* @<usuario-github-do-autor>` (o autor informa o usuário).

- [ ] **Passo 7: ADR 0001**

`docs/decisions/0001-escopo-nome-versoes-e-ferramentas.md` com seções **Contexto / Decisão / Consequências** e, em **Decisão**, exatamente: (a) nome/escopo (`@cds/rte-*`; org `cds` confirmada em <data da Tarefa 0> ou plano B); (b) **versões fixadas** de Node, npm, Nx, Angular, TypeScript, Vitest, Playwright, ng-packagr, tsup, ESLint, angular-eslint (copiar de `package.json`/`package-lock.json`); (c) Tiptap: faixa de peer provisória `^3.0.0`, definição final na spec 08; (d) Nx + npm e ferramentas de build; (e) `@angular/aria`: versão estável disponível ou não (verificado no dia, só registro); (f) compatibilidade `@nx/*` × Angular 22 × `ng-packagr` verificada no dia e qualquer exceção.

- [ ] **Passo 8: Placeholders de apps/exemplos**

`apps/demo/README.md`, `apps/ssr-smoke/README.md`, `examples/server-node/README.md`: uma linha dizendo a qual spec pertencem ("spec 07", "spec 08", "spec 07").

- [ ] **Passo 9: `CLAUDE.md` na raiz**

Conter: comandos do workspace (`npm ci`, `npx nx run-many -t lint,build,test`, `npm run check:rules`, `npm run check:licenses`, `npm run test:tools`, `npx playwright test -c e2e --project=chromium`); convenções (grafo de dependências, proibição de `@angular/*` em `core`/`sanitizer`/`theme`, `composite: false` em `tsconfig.spec.json`, `build` no typecheck, idiomas pt-BR/inglês); a regra literal **"Nenhum recurso é feito sem teste automatizado e verificação em navegador real"**; e o fluxo spec → plano (`writing-plans`) → implementação → verificação, com `docs/specs/README.md` como índice.

- [ ] **Passo 10: Verificar e commit**

Run: `npx prettier --check .` — Expected: PASS (rodar `npx prettier --write .` antes se necessário).

```bash
git add -A
git commit -m "docs: LICENSE, README, SECURITY, CONTRIBUTING, CLAUDE.md, ADR 0001 e templates"
```

---

### Task 9: CI no GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: scripts `check:rules`, `test:tools`, `check:licenses`; targets `lint`, `build`, `test`, `verify-package`.

- [ ] **Passo 1: Escrever o workflow**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - uses: nrwl/nx-set-shas@v4
      - run: npm run check:rules
      - run: npm run test:tools
      - run: npm run check:licenses
      - run: npx nx affected -t lint build test verify-package --parallel=3
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test -c e2e --project=chromium
```
`build` roda dentro do `affected` junto de `lint` e `test` (lição 15: o typecheck é o build). Sem `secrets`. Sem matriz Angular (spec 08).

- [ ] **Passo 2: Validar a sintaxe**

```bash
npx --yes @action-validator/cli .github/workflows/ci.yml
```
Expected: sem erros. (Se indisponível, `actionlint` equivalente.)

- [ ] **Passo 3: Commit**

```bash
git add -A
git commit -m "ci: workflow de lint, build, test, verify-package e licenças"
```

---

### Task 10: Verificação final (critérios de aceite da spec)

**Files:** nenhum novo (se algo falhar, corrigir na tarefa dona).

- [ ] **Passo 1: Clone limpo**

```bash
rm -rf /tmp/cds-verify && git clone /home/gustavo/Projetos/cds-text-editor /tmp/cds-verify
cd /tmp/cds-verify && npm ci && npx nx run-many -t lint,build,test
```
Expected: tudo verde. (Usar o diretório temporário da sessão se o `/tmp` voltar a encher.)

- [ ] **Passo 2: Pacotes**

```bash
npm run check:rules && npm run test:tools && npm run check:licenses
npx nx run-many -t verify-package
```
Expected: sem erros; cada tarball só com `dist`, `README`, `LICENSE`, `package.json`.

- [ ] **Passo 3: Violações de fronteira e licença (de verdade, descartáveis)**

1. Repetir os dois testes de lint da Tarefa 4 (Passo 2) no clone; ambos devem **falhar**; reverter.
2. Adicionar a `package-lock.json` do clone uma entrada `node_modules/@tiptap-pro/extension-ai` e rodar `npm run check:licenses` — Expected: **FAIL**; reverter com `git checkout package-lock.json`.

- [ ] **Passo 4: Instalação em Angular 22 limpo (fora do repo)**

```bash
for p in core sanitizer theme; do (cd packages/$p && npm pack --pack-destination /tmp/cds-tarballs); done
# angular e render: npm pack na pasta dist de cada um, mesmo destino
cd /tmp && npx @angular/cli@22 new consumer-check --skip-git --defaults && cd consumer-check
npm i /tmp/cds-tarballs/*.tgz 2>&1 | tee install.log
```
Expected: instala sem `ERESOLVE`/aviso de peer de `@angular/*` para `angular` e `render`. Conferir `grep -i "peer\|ERESOLVE" install.log` vazio.

- [ ] **Passo 5: CI em PR de exemplo**

Depois que o autor criar o repositório no GitHub e fizer o push: abrir um PR de exemplo e ver o workflow verde; abrir outro PR descartável que adiciona dependência com licença proibida e ver o CI **falhar**; fechar sem merge.

- [ ] **Passo 6: Marcar a spec concluída**

Em `docs/specs/01-projeto-da-lib.md`, marcar os checkboxes da seção 8 e confirmar que `docs/decisions/0001-*`, `LICENSE` e `SECURITY.md` existem.

```bash
git add -A
git commit -m "docs: spec 01 concluída (critérios de aceite verificados)"
```

---

## Autoavaliação

**Cobertura da spec:** R1 (T1), R2 (T1, T2, T3), R3/R4 (T4), R5 e R7 (T2, T3), R6 (T2, T3), R8 (T6), R9 (T2, T3), R10 (T4), R11 (T2, T3, T4), R12 (T5), R13 (T6), R14 (T7), R15 (T9), R16/R17 (T9), R18 a R20 (T8); aceites 1–6 (T10).
**Pontos que dependem do autor:** organização npm (T0), `<org>` e usuário no GitHub, nome em `LICENSE`, e-mail de segurança.
**Riscos de execução:** flags do Nx/Angular 22 e suporte de `@nx/angular` ao Angular 22 (cobertos por `--help`/`--dry-run` e pelo ADR); WSL sem libs do Chromium (T5, Passo 3).
