# ADR 0018: Site de documentação, conteúdo gerado e publicação

- Status: aceita (2026-10-08)
- Spec de origem: `docs/specs/07c-site-de-docs.md` (parte 3 de 4 da spec 07)

## Contexto

A 07c entrega `apps/docs` (Angular 22 pré-renderizado, CSP estrita, fora do _workspace_ como o demo), o _pipeline_ de conteúdo (`tools/docs-content.mjs`), a referência de API gerada dos modelos do `api-extractor`, a busca offline, a verificação de links, as páginas Início rápido, Instalação e Configuração, os _jobs_ `docs` e `pages` e o `links.yml`. Verificada no Chromium local; Firefox e WebKit rodam só no CI do PR.

## Decisão

### (a) Decisões da spec

X1–X14 valem como escritas na spec (fonte única), com os desvios abaixo. Resumo: app autônomo (X1); `consumer.mjs --app` e `serve.mjs --base` (X2); conteúdo gerado em `dist/docs-content/` com `marked` e `highlight.js` (X3); HTML seguro por construção, um só `bypassSecurityTrustHtml` (X4); API pelo `api-documenter` com nomes sintéticos por entry (X5); exemplos compilados por diretivas (X6); links relativos à base e navegação pelo _router_ (X7); busca offline (X8); `check-links` (X9); _job_ `pages` (X10); CSP igual à do demo (X11); _job_ `docs` (X12); três páginas (X13); seis tarefas (X14).

### (b) Desvios e notas da execução

- **Versões (X5):** `marked` 18.1.0 e `@microsoft/api-documenter` 7.30.18, que fixa o `@microsoft/api-extractor-model` 7.33.15, o mesmo do `api-extractor` 7.59.4 (teste de versões pareadas em `docs-api-model.test.mjs`). O _spike_ foi aprovado, sem _fallback_: 15 `.api.json` (um por entry) e 952 `.md`. O modelo sai de uma **segunda passada** do `api-extractor` só para o `docModel`: o cabeçalho do relatório usa o nome do pacote, então a passada única mudaria os `.api.md`; assim os relatórios continuam byte a byte iguais.
- **Contrato do conteúdo gerado:** `nav.json` é `{ sections: [{ title, items: [{ page, title }] }] }` e a seção "Referência da API" é gerada; `nav.ts` emite `NAV` sem `as const` (com ele o `flatMap` do app não tipa); `pages.ts` emite `PAGES` id para `import('./pages/<id-com-hifen>')`; páginas de API têm id `api/<sintético sem rte->` (por exemplo `api/core-html`). O Markdown do `api-documenter` usa tabelas HTML: só a conversão de API aceita `table`, `thead`, `tbody`, `tr`, `th` e `td`. Âncoras da API vêm do nome do arquivo sem `_` (o `marked` leria `_x_` como ênfase). O `api-group` omite membros `ɵ*` e `@internal`.
- **Prerender e `404.html` (X2, X10):** o Angular 22.2.1 grava o HTML pré-renderizado em `browser/<base>/` e os estáticos em `browser/`, e `RenderMode.Prerender` em `**` não gera `404.html`. Solução: rota `404` pré-renderizada e `flattenPrerender` (em `tools/consumer.mjs`) sobe `browser/<base>/` para a raiz e copia `404/index.html` para `404.html`. O `demo-pages` (base `/comodeviaser-editor/demo/`) usa o mesmo achatamento.
- **HTML cru perigoso falha o _build_** em vez de ser escapado em silêncio. A revisão final achou dois furos, corrigidos: (1) **comentário HTML**: `<!--><img/src=x/onerror=alert(1)>-->` passava, porque o conversor mantinha `<!--…-->` e a checagem exigia espaço antes de atributo. Agora `stripComments` remove os comentários como o navegador os lê (`<!-->`, `<!--->`, `--!>`, sem fim), preservando só o marcador `<!--@@live:id@@-->`, e `checkHtml` recusa qualquer outro `<!`, trata `/` e atributos colados (`"x"onerror=`) como separadores e proíbe `meta`, `link`, `base`, `form`, `frame`, `frameset` e `applet`. (2) **Bloco cercado sem diretiva em lista ou citação** (recuo ≥ 4, `> ```ts`) escapava das regras por linha. A regra passou para o próprio `convertMarkdown`: as diretivas marcam os blocos que geram com uma marca aleatória por execução na _info string_ e o _renderer_ `code` falha em qualquer bloco sem ela, em qualquer aninhamento; o `check:rules` também aponta a cerca aninhada pela linha.
- **Ids reservados:** `conteudo` e `docs-search-*` pertencem ao layout; um título que gere um deles falha o _build_ (use `{#outro-id}`).
- **Cliques internos só para rotas do site:** `internalUrl` (`doc-html.ts`) só entrega ao _router_ o que começa por `guia`, `api` ou `404` (ou a raiz). O demo vive sob a mesma base (`/comodeviaser-editor/demo/`), então um link `demo/theme?preset=x` seguia para a rota `**` do site; agora o navegador o trata.
- **`check-links` no _build_ achou um defeito real do esqueleto:** `href="#conteudo"` do _skip link_, com `<base href>`, ia para a raiz da base (armadilha do X7). O _skip link_ usa `routerLink` da rota atual com `fragment`. Externos: `checkExternal` só consulta `http(s)` e compara com `new URL(url).href` (o `fetch` normaliza a barra final).
- **Busca (X8):** o `search-index.json` é _asset_ do `angular.json` (entrada `src/generated`), servido na base; a caixa o busca uma vez, no primeiro foco, por `new URL('search-index.json', document.baseURI)`. O índice guarda os títulos originais e o texto normalizado; a tokenização é no cliente.
- **Exemplos vivos (X6):** o `registry.ts` mantém o id `resumo` além de `inicio-rapido` e `configuracao`. O exemplo vivo da Configuração transforma o `providers` da rota num injetor de ambiente (`createEnvironmentInjector`) para o `ArticleEditor` por `ngComponentOutletEnvironmentInjector`, ao lado de um editor sem _provider_. O editor barra a digitação no limite de `rteMaxChars`; o erro aparece com valor vindo de fora, então o Início rápido tem o botão "Preencher acima do limite". Hidratação: sem erro de hidratação nem de console; o _fallback_ `@defer (on viewport)` previsto nos riscos não foi necessário.
- **Precedência da Configuração (correção da revisão):** a primeira versão dizia "entrada > _provider_ da rota > raiz > padrão", como se os dois _providers_ se mesclassem. Não se mesclam: `provideRichText` na rota fornece um novo `RTE_CONFIG`/`RTE_LABELS` que **substitui** o da raiz por inteiro. Dentro do _provider_ em vigor, entrada > _provider_ > padrão; `labels`, `theme` e `options`/`editor` mesclam campo a campo. O exemplo de brinquedo `resolveOption` virou um componente com o `RteEditor` e injetores reais, com teste (`precedencia.example.spec.ts`) que prova substituição, entrada e mescla do tema.
- **Instalação só para exibir:** `content.css` e `render.css` usam `var(--rte-*)` sem reserva, então `@comodeviaser/rte-theme` entra também no comando de quem só exibe.
- **CSP:** além da estrita do demo, `base-uri 'self'; form-action 'self'; object-src 'none'`, no cabeçalho e na `<meta>` do site **e** do demo (testes de igualdade mantidos).
- **CI:** `concurrency` do `ci.yml` só cancela execuções fora do `main`; `links.yml` baixa o artefato do último _push_ verde no `main` (`--event push`); o _job_ `pages` roda a fumaça I1 só em `guia/inicio-rapido` e `api/core` (a suíte inteira já passou no _job_ `docs`) e confere que o demo montado existe. O `axe` na página `api/angular` (grande) passa de 90 s com o _runner_ ocupado: _timeout_ de 240 s só para as páginas de API. `pre` usa `white-space: pre-wrap` (um `pre` com `overflow-x` vira região rolável sem foco: regra `scrollable-region-focusable`). As cores `hljs-*` vêm dos tokens `--rte-code-*`, com AA nos dois esquemas.
- **Consumidor:** `RTE_SITE_BASE` vira `--base-href` do `build` do docs e `--base` do `serve.mjs`. Ciclo frio de `install` ~1 min; `build` ~8 s depois dele. Git Bash: `MSYS_NO_PATHCONV=1` para `--base /x/`.
- **`typecheck:e2e` no `-07`:** para no erro do `e2e/angular` (junção do `node_modules` do _worktree_) antes do tsconfig do docs; `tsc -p apps/docs/e2e/tsconfig.json --noEmit` passa limpo.
- **Demo:** a 07c corrigiu o CI do demo (botões escuros do WebKit com `Canvas`/`CanvasText`, J2 sem clique sob o menu flutuante, `@defer (on idle; on timer(1s))` na prévia do tema).

### (c) Pendências (com dono)

- **Pages (`TODO-AUTOR`):** o _job_ `pages` só roda com `vars.RTE_PAGES == 'true'`. O dono precisa ativar Pages com origem "GitHub Actions" e criar a variável; repositório privado exige plano pago. Sem isso o site fica nos artefatos `docs-static` e `demo-pages` (evidência desta parte).
- **Domínio próprio (`TODO-AUTOR`):** `RTE_SITE_BASE` só vale no `consumer.mjs` e no `serve.mjs`. Trocar a base exige mexer também em `consumer.mjs` (`demo-pages`), no `check-links --base`, na constante `BASE` dos E2E (`apps/docs/e2e/helpers.ts`) e no `<base href>` do `index.html` (com `CNAME`).
- **Firefox e WebKit do _job_ `docs`:** rodada do CI do PR.
- **Demais páginas do guia, `?preset=` no demo e o teste de 15 minutos:** spec 07d.

## Consequências

- Toda página nova passa pelas mesmas guardas: HTML checado (X4), bloco de código com diretiva em qualquer aninhamento (X6), links internos (X9) e ids sem colisão.
- Mudar JSDoc muda a referência publicada; mudar peers ou `exports` muda o comando de instalação e a ordem do CSS gerados; exemplo que não compila quebra o _job_ `docs`.
- O `main` não fica vermelho antes de o dono ligar o Pages.
