# ADR 0019: Matriz de versões, relatórios de qualidade e proteção do `main`

- Status: aceita (2026-10-08)
- Spec de origem: `docs/specs/08a-matriz-de-versoes-e-relatorios.md` (parte 1 de 2 da spec 08)

## Contexto

A 08a entrega a matriz Angular × Tiptap no CI (`compat.yml`, `tools/compat.mjs`, `tools/compat.json`), o E2E J8 contra o `examples/server-node`, a auditoria dos fluxos (X7) com N47 e N48, as propriedades do tema nos 3 motores, os relatórios de cobertura, tamanho, desempenho e testes instáveis (_flakes_) como artefatos e a proteção do `main`. Verificada no Chromium local (Windows); Firefox e WebKit rodam no CI do PR.

## Decisão

### (a) Decisões da spec

X1–X14 valem como escritas na spec (fonte única). Resumo do que ficou: divisão 08a/08b (X1); piso lido dos `peerDependencies`, último estável por _major_ resolvido a cada execução, `next` não bloqueante (X2); duas fases por perna, A (consumidor externo, `consumer.mjs --versions`) e B (`npm install --no-save` no próprio repositório com `build typecheck test test-zone` e `@compat`) (X3); `compat.yml` reutilizável, PR com `latest×latest`, semanal/`main`/manual com `full` (X4); `tools/compat.json` com tetos e `skip` que exigem `reason` e `adr` (X5); marca `@compat` em 15 specs, lista em `tools/compat-tags.json` (X6); auditoria dos fluxos (X7); J8 (X8); propriedades do tema (X9); alvo `coverage` (X10); `check-size --report` (X11); `quality-summary.mjs` e artefato `quality-reports` (X12); `.github/branch-protection.json` (X13); seis tarefas (X14).

### (b) Desvios e notas da execução

- **Spike da fase B (2026-10-08).** A fase B do Angular **funciona** com `@nx/angular` 23.2.1: `ANGULAR_PHASE_B = true`, sem plano B. `npm install --no-save` de framework 22.2.1 e ferramentas 22.2.2 sobre o `npm ci`, sem `--legacy-peer-deps`; `nx run-many -t build typecheck test test-zone -p core sanitizer theme angular render` verde em 16 min 20 s, sem cache do Nx. Hoje o último é o piso (`@angular/core@22` = 22.2.1, `@tiptap/core@3` = 3.31.4), mas `@angular/cli@22` = 22.2.2: por isso `latest×latest` tem fase B (cli, build, ssr, devkit e schematics em 22.2.2). `@schematics/angular` é _peer_ do `@nx/angular` e entra na família das ferramentas.
- **`next`.** A _dist-tag_ do framework (22.3.0-next.0) difere da do cli (22.3.0-next.1). Sem `--legacy-peer-deps` o `npm install` dá `ERESOLVE` (peer pré-lançamento do `@angular/ssr`); com a flag instala e `angular:build` e `typecheck` passam. A perna `next` roda **só a fase A**, é opcional (`continue-on-error`) e usa `--legacy-peer-deps`. Um `next` menor que o último estável (a _tag_ andando para trás) é descartado, com o motivo no log.
- **Dois `npm install --no-save` em sequência não funcionam:** o segundo reinstala a árvore do _lockfile_ e desfaz o primeiro. Há UM comando com todas as famílias, e a prova é por `npm ls` (`proveInstalled`); a saída vazia do `npm ls` vira erro claro (`parseLs`). `npm ls` sai com código diferente de zero quando há `invalid` (esperado no `--no-save`): lê-se o `stdout`, não o status. A fase B escolhe o maior da lista do `npm view` (`highestVersion`), nunca o último elemento.
- **Fase A antes da B** no mesmo _job_: o `pack` precisa ser da cadeia da raiz (o que se publica) e a B reinstala por cima.
- **Nome do check do PR:** o GitHub antepõe o job chamador, então o check é `compat / compat (latest×latest)` (não `compat (latest×latest)`). O `branch-protection.json` e `tools/branch-protection.test.mjs` usam esse nome; o teste prova que `verify`, `demo`, `docs` e o nome composto existem nos workflows e que `enforce_admins` e `strict` são `true`.
- **PR só de documentação.** O `compat.yml` não pode usar `paths-ignore` (um _check_ exigido que não é reportado trava o merge). O _job_ `legs` calcula `docs_only` (todos os arquivos alterados do PR em `docs/**` ou `*.md`, por `tools/compat.mjs docs-only`) e a perna roda só um passo de resumo, mantendo o nome do check verde. `apps/docs/content/**` em Markdown também conta como documentação para a matriz porque a perna não constrói o site (o _job_ `docs` o cobre); código, YAML e JSON sempre rodam a perna inteira. Tempo máximo da perna: 60 min (a frio passa de 40).
- **Concorrência.** No `compat.yml` o cancelamento só vale fora do `main`: cada _push_ em `main` precisa do seu relatório da matriz completa. O nome da perna no resumo vem de `LEG_JSON` (nunca interpolado no `run:`).
- **Alvo `test-timed`.** Os specs de tempo e de fuzz (`limits`, `perf`, `timed`, `fuzz`) do `sanitizer` estouram o prazo sob a instrumentação v8 e ficam fora do `coverage`; rodam no alvo `sanitizer:test-timed` (sem cobertura), que o CI chama com `nx affected -t test-timed`. Os alvos `coverage` e `test-timed` têm `parallelism: false` em `nx.json`. O `render:coverage` exclui `fuzz.spec.ts`. **Pendência quando o PR #21 (`fix/security-r9`) entrar no `main`:** criar `render:test-timed` (o `@nx/angular:unit-test` falha sem arquivo correspondente ao `include`, por isso o alvo não existe antes de `packages/render/src/fuzz.spec.ts`) e conferir o teto de 4 envios simultâneos do servidor, hoje respeitado por `workers: 3` em `apps/demo/e2e/playwright.config.ts` (J5 e J8 compartilham o servidor `--with-server`).
- **Ciclos de vida no jsdom (Z10 da 05d2).** O teste de vazamento do editor com a barra mínima passou de 100 para 30 ciclos e perdeu o _timeout_ de 120 s: as invariantes são por contagem e a guarda de crescimento (mediana dos 10 últimos ≤ 3× a dos 10 primeiros) permanece; os 100 ciclos ficam no navegador real (N7/N46, `e2e/angular/editor-lifecycle.spec.ts`).
- **`render/css.spec.ts`** usa `workspacePath` (o `import.meta.dirname` quebra sob cobertura).
- **Custo das propriedades do tema no CI.** Cada execução custa ~1,5 s por motor. O padrão de `FC_RUNS` é 200 localmente; o `ci.yml` define `FC_RUNS=100` no E2E principal. Quem quiser mais roda `FC_RUNS=1000 npx playwright test -c e2e e2e/theme/property.spec.ts`. A semente fica fixa (`FC_SEED`); a falha imprime semente e caso mínimo.

### (c) Propriedades do tema: achados e tolerâncias (T4)

Os limites de ΔE (`e2e/theme/helpers/limits.ts`, fonte única de `fallback-equivalence.spec.ts` e `property.spec.ts`) são mais apertados que os da spec do tema (neutro 0,019, borda 0,041) de propósito: `linear` 0,002 e `text` 0,004 (piso de quantização de 8 bits, ~0,0028 por unidade), `neutral` e `border` 0,0075 (medidos ~0,0035 nas grades; com 0,019 e 0,041 uma constante de neutro alterada passaria). `neutral` e `border` eram 0,006 e subiram para 0,0075 porque `FC_RUNS=1000` achou, nos 3 motores, neutros tingidos de semente quase acromática e quase preta (`hsl(240 2% 1%)`): `primary-border` 122,122,126 × 123,123,123 com ΔE 0,0064 e `text` 28,25,28 × 26,26,27 com ΔE 0,0060; o matiz de uma semente de croma ~0 é decidido pela quantização da própria semente. Com 0,0075, `FC_RUNS=1000` passa nos 3 motores (145 passaram, 14 puladas por falta de cores relativas). Tolerâncias adicionadas, todas justificadas por medida:

- **(b) Arredondamento perto do preto.** Com `hsl(0 0% 1%)` no modo escuro, `primary-hover` dá 3,3,3 (nativo) × 2,2,2 (plano B): o canvas arredonda o valor flutuante e o hex para lados opostos da fronteira. Uma unidade de 8 bits ali vale ΔE ~0,012, seis vezes o limite do grupo. A tolerância só vale **onde uma unidade, naquela cor, excede o limite do grupo** (`quantExcused` = no máximo 1 unidade por canal E `oneStepDeltaE(cor) > limite`); em tons médios (uma unidade ~0,0028) vale o ΔE estrito. Duas unidades ou mais seguem reprovando. Sem mudança de fórmula: `theme.css` e o plano B continuam iguais.
- **(d) Razão de contraste.** Difere em ~1 ulp (~1e-16) entre Node e navegador (`Math.pow`/`cbrt`); tolerância relativa 1e-9; ids, `pass`, `ok` e `invalid` são exatos.
- **(d) Fora da gramática pura** o navegador aceita pelo _canvas_ o que o Node recusa (`rgb(-1e309, 5, 5)`): esses casos saem de (d) por `fc.pre` e são o objeto de (c).
- **(b) Só sementes dentro do gamut sRGB** (OKLCH fora do gamut é mapeado por caminhos diferentes de propósito).
- Cada `expect` do Playwright vira um passo do relatório; 72 por caso deixavam (d) 10× mais lento, então há uma asserção agregada.

### (d) Tabela de rastreabilidade (X7): fluxos da spec 08 → testes

"3 motores" = Chromium, Firefox e WebKit no CI.

| Fluxo | Testes | Motores | Lacuna |
| --- | --- | --- | --- |
| Digitar | `editor-history` N48; `editor-draft` N39; `e2e/core/editor-paste` E2 | 3 | N48 (nova) |
| Formatar | `editor-toolbar-commands` N11; `editor-toolbar-keyboard` N9; N48 (`Mod+B`) | 3 | nenhuma |
| Colar print | `editor-upload-paste-drop` N35/E12; `editor-paste-external` N41 | 3 | nenhuma |
| Arrastar imagem | `editor-upload-paste-drop` N35/E13 | 3 | nenhuma |
| Redimensionar pelos 4 cantos | `e2e/core/editor-resize` E3 | 3 | nenhuma |
| Menu `/` | `e2e/core/editor-slash` E11; `e2e/angular/editor-slash` N42 | 3 | nenhuma |
| `Ctrl+F` | `e2e/core/editor-search` E10; `e2e/angular/editor-search` N43; `editor-search-readonly` N47 (nova) | 3 | N47 (nova) |
| Modal de link com `rel` | `editor-dialogs-link` N16 | 3 | nenhuma |
| Upload com progresso e cancelamento | `editor-upload-states` N36; `editor-upload-dialog` N34; J5; J8 (e) | 3 (J5 com servidor: Chromium) | nenhuma |
| Rascunho e `beforeunload` | `editor-draft` N39; `editor-draft-save` N40 | 3 | nenhuma |
| Vimeo/Spotify | `editor-media-video-embed` N28; `e2e/core/embeds` | 3 | nenhuma |
| Tabela | `e2e/core/editor-keyboard`; E11 (`/tab`); N11 | 3 | nenhuma |
| Desfazer/refazer | `Mod+Z`: N16, N28, N41, E11; refazer: N27/N29, N9, N48 | 3 | N48 (texto puro, nova) |
| Teclado virtual (emulação móvel) | fora da 08a | | 08b |

N47 (`Mod+F` com o editor em `readonly`: abre com a seleção, navega, sem substituir) e N48 (digitar, `Mod+B`, desfazer em passos, `Mod+Shift+Z`, `Ctrl+Y` fora do macOS) são arquivos novos.

### (e) J8 (`apps/demo/e2e/j8-server.spec.ts`)

(a) PNG 201 com bearer e `X-CSRF-Token`, mídia com `nosniff` e `default-src 'none'; sandbox`, bytes idênticos; (b) sem `X-CSRF-Token` 403; (c) SVG com nome `.png` 415; (d) corpo de 11 MiB 413 (o cliente já recusa acima de 10 MiB, então o corpo é trocado na rede); (e) cancelar com a requisição retida; (f) WebM com `readyState >= 1`. "Nada gravado" é conferido por um rótulo único anexado ao final dos bytes e procurado em todas as pastas `cds-rte-demo-media-*`. Resultado local: Chromium e Firefox 6/6; WebKit 6/6 com a anotação `webkit-sem-range` no (f): o `GET /media` do servidor de exemplo não responde a `Range` com 206 e o WebKit fica em `readyState` 0 (causa no servidor, nem no editor nem no demo). O teste volta sozinho à verificação estrita quando `Range` → 206 passar a funcionar (correção do PR #21). Com o #21, `files.page.ts` busca `/csrf` com o bearer, e a asserção de CSP do `/media` deve valer também para o 206.

### (f) Referência para a 08b: cobertura, tamanhos e N45

Cobertura medida (Linux/Windows local; linhas / instruções / funções / ramos, %), **sem limiar** nesta spec; é o piso da 08b:

| Pacote | Linhas | Instruções | Funções | Ramos |
| --- | --- | --- | --- | --- |
| angular | 91,7 | 89,0 | 92,0 | 80,2 |
| core | 98,8 | 96,3 | 99,0 | 90,5 |
| render | 90,2 | 86,5 | 92,6 | 73,5 |
| sanitizer | 96,2 | 96,4 | 100 | 90,6 |
| theme | 99,1 | 98,2 | 100 | 93,1 |

O `sanitizer` sem `limits`/`perf`/`timed` cai a 90,6% de ramos (os limiares 95/95 dormentes do `vitest.config.mts` são zerados no alvo).

Tamanhos (bytes min+gzip, folga): `angular` _editor_ 37837 (5683), `core/html` 31459 (4765), `validators` 3131 (69, a menor folga). N45 no Chromium local (Windows): tecla frio p95 18,4 ms, quente p95 69,9 ms, criação completa 79,7 ms, busca capada p95 16,7 ms, INP 72 ms, rascunho 2,6 ms. **Os valores do Linux/CI são locais aqui e devem ser registrados na primeira execução do CI** (`e2e/test-results/perf/n45-<motor>.json` no artefato `quality-reports`).

### (g) Proteção do `main` (X13)

`.github/branch-protection.json` exige `verify`, `demo`, `docs` e `compat / compat (latest×latest)`, com `strict: true` e `enforce_admins: true`. **Não foi aplicada** (só com confirmação do dono, com permissão de administrador no _token_). `TODO-AUTOR`: aplicar e conferir com

```bash
curl -X PUT -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/GustavoALDev/cds-text-editor/branches/main/protection \
  --data @.github/branch-protection.json
curl -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/GustavoALDev/cds-text-editor/branches/main/protection
```

O PAT vem de arquivo temporário e nunca entra no repositório. Antes de aplicar, confirmar que os quatro checks já aparecem em um PR (um check exigido que nunca foi reportado trava o merge).

### (h) Execução `full` e `next` (pendente)

`TODO-AUTOR`: depois do merge, disparar `compat.yml` com `set: full` (Actions > Compat > Run workflow) e registrar aqui as quatro pernas (`latest×latest`, `min×latest`, `latest×min`, `next×latest`), os tetos ativos e a quebra, se houver. Hoje último = piso para `@angular/core` e `@tiptap/core`; `min×latest` e `latest×min` repetem as versões de `min×min` e de `latest×latest` e são descartadas com o motivo "repete as versões resolvidas" até algum lado publicar versão nova; só `latest×latest` (ferramentas 22.2.2) e `next` (opcional) diferem do `verify`.

## Consequências

- O PR paga `verify` + `demo` + `compat / compat (latest×latest)` (esta última ~40 min a frio; dispensada em PR só de documentação).
- Quebra por versão nova de Angular ou Tiptap aparece no semanal antes de um PR; o teto em `tools/compat.json` exige `reason` e `adr`, nunca esconde a quebra.
- A fase B reinstala no repositório com `NX_SKIP_NX_CACHE=true`: o cache do Nx não distingue as versões instaladas por cima.
- Riscos aceitos: "último" muda no meio do dia (o semanal pega antes do PR); `next` pode ser o _major_ 23, fora do _peer_ `<23` (só fase A, opcional); J8 diverge entre motores por cookie de CSRF e `SameSite` em `127.0.0.1` e por `Range` no WebKit, registrados em vez de `skip`.
