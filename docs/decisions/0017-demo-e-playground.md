# ADR 0017: Demo, playground do tema e consumo por tarball

- Status: aceita (2026-10-08)
- Spec de origem: `docs/specs/07b-demo-e-playground-do-tema.md` (parte 2 de 4 da spec 07)

## Contexto

A 07b entrega `apps/demo` (Angular 22 pré-renderizado, CSP estrita), o playground do tema e o consumo dos pacotes pelos tarballs, fora do _workspace_, com o _job_ `demo` no CI. Verificada no Chromium local (53 E2E, unitários do consumidor, `check-snippets`); Firefox e WebKit rodam só no CI do PR.

## Decisão

### (a) Decisões da spec

W1–W15 valem como escritas na spec (fonte única), com os desvios abaixo. Resumo: app autônomo fora dos _workspaces_ e do Nx (W1); `tools/consumer.mjs` com `pack`/`prepare`/`install`/`test`/`build`/`check-snippets`/`serve`/`dev` (W2); prova de origem (W3); CSP por cabeçalho e `<meta>` (W4); oito rotas (W5); envio simulado ou com servidor (W6); playground com modelo puro, prévia ao vivo, relatório, CSS e TS copiáveis (W7–W11); testes e `check-snippets` (W12, W13); _job_ `demo` (W14); seis tarefas (W15).

### (b) Desvios da execução

- **CSS de componente proibido:** `styleUrl`/`styles` viram `<style>` inline no prerender, barrado pela CSP (erro de console em toda página). O CSS das páginas vai para `src/styles/*.css` importados pelo `styles.css` global (o build empacota tudo num CSS só: 0 `@import`, 0 `<style>`, 0 `style=` nos 8 HTML). Regra do `check:rules` recusa componente do demo com `styleUrl`/`styleUrls`/`styles`. O `body` ganha `Canvas`/`CanvasText` (o axe lia fundo branco no escuro).
- **Bug de pacote `RteRovingItem`:** `contentChildren(RteRovingItem)` antes da classe falhava com TDZ (`Cannot access 'RteRovingItem' before initialization`) no `ng test` do consumidor (Vitest, sem o linker); o `ng build` não via. Corrigido em `e2be359` (declarada antes de `RteRovingFocus`). Guarda: `tools/fesm-eval.test.mjs` importa cada `fesm` do `dist` em Node puro; falha sem `dist` com `RTE_REQUIRE_DIST=1`, definido só no _job_ `demo` (depois do build; o `test:tools` do `verify` roda antes).
- **Lacuna das diretivas de texto no Template Forms:** o caminho nativo do `FormValueControl` não lê `NG_VALIDATORS`. Novas em `/validators`: `rteRequired`, `rteMaxChars`, `rteMaxWords`, `rteSafeLinks`, `rteNoEmptyHeadings` (base `RteTextValidator` `@internal`), que fazem `addValidators`/`removeValidators` no controle do `NgControl` do elemento, preservando os do consumidor. Seletor `rteRequired` (não `required`) para não colidir com o nativo. Orçamento de `validators` 2816 para 3200 B (medido 3131). A diretiva própria do demo foi apagada.
- **CSS por especificadores dos `exports`:** o README do angular mandava `node_modules/@cds/rte-theme/theme.css`, mas o arquivo é `dist/theme.css`. O `angular.json` usa `@cds/rte-theme/theme.css`, `@cds/rte-core/styles/content.css`, `@cds/rte-angular/styles/editor.css` e `@cds/rte-render/styles/render.css` (provado com `ng build` por tarball); README corrigido.
- **`checkRteTheme` nunca reprova cor real:** 72/72 em ~12 mil sementes sRGB e ~5,5 mil `oklch` nos três papéis (os derivados se adaptam; ADR 0002). "Reprovadas" e "usar sugestão" só aparecem com verificação injetada (`CONTRAST_TOOLS`), provados em unitário; o E2E J7 prova 72/72 e o `aria-live`.
- **Erro de limite provado por código:** o editor barra a digitação acima de `maxLength`; J3 usa o botão `fill-long` ("Preencher com texto acima do limite") em `/forms` (`model.set`, `setValue`, `ngModel`).
- **`/files` e o prerender:** cria o editor simulado no prerender e troca para o modo servidor após o `fetch` de `demo-config.json` (evita erro de hidratação).
- **Segurança do `consumer.mjs`:** o diretório leva a marca `.cds-rte-consumer` (`prepare` só apaga o que tem a marca e recusa diretório não vazio sem ela; consumidores antigos: `touch .cds-rte-consumer`); `realpath` antes das checagens dentro/contém o repositório; `verifyOrigin` falha com `node_modules` em ancestral. A prova de origem lê o sha512 do lockfile oculto `node_modules/.package-lock.json`. `prepare` preserva o `node_modules` de terceiros e apaga só `node_modules/@cds` e o lockfile oculto.
- **Segurança do `dev`:** `HOST` (padrão `127.0.0.1`) no `dev` e no `server-node`; token bearer gerado por execução e entregue no `demo-config.json` do consumidor (restaurado no `finally`); sem token fixo no bundle.
- **`theme-check.html` só em fixtures de E2E:** fica em `apps/demo/e2e/fixtures/`, servida por `page.route`, fora do artefato publicado.
- **Regras do demo no `check:rules`:** também `extends`/imports absolutos e `file:`, e `style`/`ngStyle` em host e `HostBinding`. `isValidColor` recusa comentário CSS, `<`, `{`, `}`, `;` e barra invertida (CSS copiável sem escape).
- **Pinos:** vitest 4.1.11, jsdom 27.4.0, `@types/node` 24.19.1, tslib 2.8.1, rxjs 7.8.2. `vitest-base.config.mts` (`runnerConfig`) dá 30 s de `testTimeout`/`hookTimeout`; `vi.waitFor` de `/files` com 10 s.
- **Portas do E2E:** `RTE_DEMO_PORT`, +1 (`--no-csp-header`) e +2 (`--with-server`).
- **`typecheck:e2e` TS2883 no `-07`:** vem da junção do `node_modules` do _worktree_ (aponta para o `-06`); no `-06` passa. O tsconfig do demo passa sozinho.
- **Ciclo medido (Windows, npm 11 via npx):** pack+prepare+install 95 s (instalação a frio 56 s), build 61 s, `ng test` 50 s (30 s só de importar o editor no primeiro caso de cada arquivo, sem contorno).

### (c) Pendências (com dono)

- **Firefox e WebKit do _job_ `demo`:** rodada do CI do PR.
- **`?preset=` no demo e o guia:** spec 07d.
- **Site de docs:** 07c (ADR 0018) reaproveita `consumer.mjs`, a CSP por `<meta>` e o artefato estático.

## Consequências

- Toda mudança que quebre o consumo externo (entry, `exports`, peer, CSS publicado) quebra o _job_ `demo` do PR.
- Estilo de página do demo só em CSS global; componente com `styleUrl` reprova no `check:rules`.
- Sem lockfile, uma transitiva nova pode quebrar o _job_ (`npm ls --all` como artefato em falha).
