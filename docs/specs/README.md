# Specs do editor de texto rico (lib comercial MIT, Angular 22+)

Esta pasta é **autocontida**: pode ser movida para a raiz do projeto novo. Nada aqui depende do repositório MyPresentation, que foi só o **modelo** (referência de ideias e de código a copiar).

## Como usar

1. Leia `referencias/plano-geral.md` (visão, decisões, lacunas, riscos, lições).
   Antes de criar o workspace (spec 01), leia também `referencias/achados-scaffolding.md` (TypeScript 6.0, npm 11+, limitação do Nx com Angular).
2. Execute as specs **na ordem**. Cada spec vira um ciclo próprio: **spec → plano de implementação (`writing-plans`) → implementação → verificação**.
3. Uma spec só começa depois que as suas dependências estão concluídas e que as perguntas marcadas **[DECIDIR]** dela foram respondidas.
4. Código do modelo citado nas specs (`MyPresentation: <caminho>`) é **referência para copiar/adaptar**. Se o modelo não estiver à mão, a spec descreve o comportamento esperado o bastante para reescrever.

## Índice

| # | Spec | Entrega | Depende de |
|---|---|---|---|
| 01 | [Projeto da lib](01-projeto-da-lib.md) | Workspace, 5 pacotes vazios, ferramentas, CI mínimo, convenções | — |
| 02 | [Tema](02-tema.md) | `@cds/rte-theme`: CSS de 3 cores, modos, plano B em JS | 01 |
| 03 | [Core e esquema do HTML](03-core-e-esquema.md) | `@cds/rte-core`, dividida em 3 partes: | 01 |
| 03a | [Esquema do HTML, embeds e utilitários](03a-esquema-e-utilitarios.md) (concluída) | Contrato do HTML como dados (`getHtmlSchema`), provedores de embed, utilitários puros | 01 |
| 03b | [Extensões de conteúdo, fábrica e teste de contrato](03b-extensoes-de-conteudo.md) (concluída; falta o CI do PR) | Extensões Tiptap que geram HTML, `createEditorExtensions`, fixture e teste de contrato | 03a |
| 03c | [Extensões de produtividade](03c-extensoes-de-produtividade.md) (concluída; falta o CI do PR) | `SearchReplace`, `SlashCommand` (lógica), `CharLimit`, placeholder | 03b |
| 04 | [Sanitizador](04-sanitizador.md) (concluída; falta o CI do PR) | `@cds/rte-sanitizer`: allowlist derivada do esquema, engine única sobre `htmlparser2` | 03a, 03b |
| 05 | [Editor Angular](05-editor-angular.md) (concluída; pendências com dono no ADR 0016: CI do PR, degrau quente e leitores de tela na 08, demo na 07) | `@cds/rte-angular`, dividida em 9 partes: | 02, 03 |
| 05a | [Componente, formulários e base](05a-componente-e-formularios.md) (concluída; falta o CI do PR) | `rte-editor` sem toolbar, ponte de signals, Signal Forms, Reactive/Template Forms pelo caminho nativo (sem CVA) + `[(value)]`, rótulos e `/i18n`, validadores de texto, CSS funcional sem injeção (CSP), casca de SSR, app de teste nos 3 motores | 03c, 02 |
| 05b1 | [Barra de ferramentas, tema por instância e CSS de conteúdo](05b1-barra-de-ferramentas-e-tema.md) (concluída; falta o CI do PR) | Toolbar configurável (presets/grupos) com foco itinerante e menus em `popover` nativo (implementação própria, sem `@angular/aria`), ícones SVG internos, comandos sem diálogo, guarda de tabela > 100, tema por instância por `applyRteTheme`, `content.css` `rt-*` no core (compartilhado com a 06) | 05a |
| 05b2a | [Diálogos, link, idioma, autor da citação e tabela](05b2a-dialogos-link-e-idioma.md) (concluída; falta o CI do PR) | Base de diálogos em `<dialog>` nativo modal dentro do host, carregada por `@defer`, com Signal Forms; diálogos de link (política do core), idioma, autor/cargo da citação e tabela nova; itens `link`/`lang`/`quoteAuthor`, `Mod-K`, `openDialog()`, seção `dialogs` dos rótulos | 05b1 |
| 05b2b | [Menus flutuantes](05b2b-menus-flutuantes.md) (concluída; falta o CI do PR) | Menus flutuantes de texto, link, tabela (guarda > 100) e imagem (alinhamento e remoção) em `popover` manual dentro do host, posição por função pura, sem roubar o foco, `Alt+F10`/`focusFloatingMenu()`, `floatingMenus`, seção `floating` dos rótulos | 05b2a |
| 05c1 | [Diálogos de mídia, detalhes da imagem e `mediaChange`](05c1-dialogos-de-midia.md) (concluída; falta o CI do PR) | Diálogos de imagem (texto alternativo ou decorativa, legenda, crédito, alinhamento, largura), vídeo (pôster, faixas) e *embed* por endereço sobre a base da 05b2a; itens `image`/`video`/`embed`; menus flutuantes de vídeo e *embed* e "Detalhes…" da imagem; seleção de mídia por clique; `mediaChange`/`mediaSession` | 05b2b |
| 05c2a | [Envio de arquivos, marcadores de envio e validadores de mídia](05c2a-envio-de-arquivos.md) (concluída; falta o CI do PR; ADR 0013) | `@defer` próprio dos formulários de mídia, `RteUploadAdapter`, `httpUploadAdapter` (`/upload`), envio por diálogo/colar/soltar com marcadores, bandeja, progresso e cancelamento real, `uploadError`, `rteUploadsFinished`/`rteImagesHaveAlt` | 05c1 |
| 05c2b | [Rascunho, salvamento e colagem externa](05c2b-rascunho-e-salvamento.md) (concluída; falta o CI do PR; ADR 0014) | Rascunho, `isDirty`/`markSaved()`, `onMediaRemoved`, `registerExternal`, URL colada → *embed*, `beforeunload` | 05c2a |
| 05d1 | [Menu `/`, busca e substituição, contadores e validadores de conteúdo](05d1-menu-busca-e-contadores.md) (concluída; ADR 0015) | Fim do D1, menu `/` (`listbox` + `aria-activedescendant`, `onUiItem` → diálogos), barra de busca e substituição (`Mod-F`, anúncios, "1000+"), contadores e anúncios do limite, `rteSafeLinks`/`rteNoEmptyHeadings` | 05c2b |
| 05d2 | [Desempenho, orçamentos finais, `api-extractor` e fechamento da spec 05](05d2-desempenho-e-api.md) (concluída; falta o CI do PR; ADR 0016) | Cenário completo e orçamentos (p95 por tecla nos dois regimes, criação, INP, vazamento), `updateOn` só se reprovar, investigação do custo de criar/destruir, tamanhos finais, `api-extractor` nos 15 entries com relatórios em `packages/*/api/` conferidos no CI, README completo, fechamento da spec 05 | 05d1 |
| 06 | [Renderização](06-renderizacao.md) (concluída; falta o CI do PR) | `@cds/rte-render`: diretiva `[rteContent]` (sanitiza com `createSanitizer` das opções do editor, rolador de tabela, estilos por CSSOM sob CSP, âncoras), sumário `rte-toc`, `render.css`; SSR sem JS; integra antes a `feat/spec-04` | 04, 05b1 |
| 07 | [Demo, docs e servidor de exemplo](07-demo-docs-exemplos.md) (partes 07a, 07b e 07c concluídas; falta o CI do PR; 07d pendente) | App demo/playground, site de docs, `examples/server-node`, dividida em 4 partes: | 05, 06 |
| 07a | Servidor de exemplo (concluída; PR #13) | `examples/server-node` sem dependências: upload por *magic bytes*, CSRF, limpeza de órfãs, sanitização por injeção | 05c2a |
| 07b | [App de demonstração, playground do tema e consumo por tarball](07b-demo-e-playground-do-tema.md) (concluída; falta o CI do PR; ADR 0017) | `apps/demo` Angular 22 pré-renderizado com CSP estrita (editor, barra, formulários, i18n, envio simulado/servidor de exemplo, exibição), playground do tema offline com "copiar CSS/TS" provados, consumo pelos tarballs fora do *workspace* (`tools/consumer.mjs`) e *job* `demo` nos 3 motores | 05, 06, 07a |
| 07c | [Site de docs: infraestrutura e referência de API](07c-site-de-docs.md) (concluída; falta o CI do PR; ADR 0018) | App Angular próprio pré-renderizado, Markdown no *build*, referência de API do `api-extractor`, exemplos compilados (R1), links, publicação de docs + demo | 07b |
| 07d | Site de docs: conteúdo, README raiz e teste de 15 minutos (diretrizes no Apêndice A da 07b; inclui `?preset=` no demo e o guia) | Guia completo, segurança e modelo de ameaças, migração, FAQ, README raiz (R5), teste de 15 minutos, fechamento da spec 07 | 07c |
| 08 | [Qualidade](08-qualidade.md) (concluída; falta o CI do PR; o roteiro de leitor de tela executado e a proteção do branch ficam com o dono; ADR 0019 e 0021) | E2E em 3 engines, a11y, desempenho, visual, pacote; dividida em 2 partes: | 05 |
| 08a | [Matriz de versões, servidor de exemplo, propriedade do tema e relatórios](08a-matriz-de-versoes-e-relatorios.md) (concluída; falta o CI do PR; ADR 0019) | Matriz Angular 22 × Tiptap 3 (piso dos peers e último; `next` não bloqueante) por consumidor de *tarball* e pela suíte do fonte, E2E J8 contra o `examples/server-node`, auditoria dos fluxos e N47 (`Mod-F` em `readonly`), propriedades do tema nos 3 motores, cobertura/tamanho/desempenho/*flakes* como artefatos, branch protegida | 05, 06, 07b |
| 08b | [Regressão visual, móvel e leitores de tela](08b-visual-movel-e-leitores-de-tela.md) (concluída; falta o CI do PR; ADR 0021) | Regressão visual, teclado virtual/emulação móvel, roteiro manual de leitor de tela, matriz de navegadores documentada, *baseline* de desempenho e pendências do ADR 0016 | 08a |
| 09 | [Release e governança](09-release-governanca.md) | Versionamento, npm com provenance, MIT, SECURITY (parte 09a concluída) | todas |

## Decisões

**Decididas (2026-10-02):**

| Decisão | Spec | Resultado |
|---|---|---|
| Engine do sanitizador | 04 | **Uma engine só, própria, sobre o `htmlparser2` do core**, igual em Node e no navegador (revista em 2026-10-03; substitui `sanitize-html` + `DOMPurify`, ver spec 04, S1/S14); a do servidor, na gravação, é a que vale |
| Modo padrão da exibição | 06 | **`sanitize`**, com o sanitizador injetado (`provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) })`); sem ele a diretiva falha na criação (revisto em 2026-10-05: pipe substituído pela diretiva `[rteContent]`, H3/H4) |
| Integração Tiptap × Angular | 05 | **`Editor` direto** com wrapper próprio, sem `ngx-tiptap` |
| Nome e escopo npm | 01 | **`@cds/rte-*`** (produto `cds-text-editor`); falta o autor confirmar a organização npm `cds` |
| Ícones e overlay | 05 | **SVG internos** e **`<dialog>`/popover nativos**, sem lucide e sem CDK (spikes confirmam) |
| Formulários no Angular | 05a | **`FormValueControl` no componente, sem CVA** (no Angular 22.2 o `NgControl` liga o controle customizado nativamente em Reactive/Template Forms; um CVA no elemento venceria esse caminho e o do `[formField]`) |
| `@angular/aria` × implementação própria (S2) | 05b1 | **Implementação própria** do foco itinerante e do *menu button* atrás de diretivas internas (o `@angular/aria@22.2.1` exige `@angular/cdk` 22.2.1 exato como peer, usa entry interno do core e não tem diálogo nem posicionamento) |
| Faixa Angular × Tiptap da matriz de CI (2026-10-07) | 08a | **Piso dos peers** (Angular 22.2.1, Tiptap 3.31.4, lidos dos `package.json`) **e último estável** do *major*, resolvido a cada execução; `next` do Angular não bloqueante; PR roda `latest×latest`, as pernas cruzadas e o `next` rodam toda semana, em `main` e sob demanda (X2–X4) |

**Ainda em aberto:** nenhuma.

## Convenções comuns a todas as specs

- Idioma da documentação interna: **Português-Brasil**. Código e nomes públicos: **inglês**.
- Todo recurso só está "feito" com **teste automatizado e verificação em navegador real** (regra do plano, seção 9).
- Nomes de APIs do Angular 22 nas specs são **esboços**: reconfirmar na documentação oficial ao implementar (plano, seção 6).
- Cada spec termina com **critérios de aceite verificáveis**; uma spec só está concluída quando todos passam.
