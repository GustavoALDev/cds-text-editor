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
| 04 | [Sanitizador](04-sanitizador.md) | `@cds/rte-sanitizer`: allowlist derivada do esquema | 03 |
| 05 | [Editor Angular](05-editor-angular.md) | `@cds/rte-angular`, dividida em 8 partes: | 02, 03 |
| 05a | [Componente, formulários e base](05a-componente-e-formularios.md) (concluída; falta o CI do PR) | `rte-editor` sem toolbar, ponte de signals, Signal Forms, Reactive/Template Forms pelo caminho nativo (sem CVA) + `[(value)]`, rótulos e `/i18n`, validadores de texto, CSS funcional sem injeção (CSP), casca de SSR, app de teste nos 3 motores | 03c, 02 |
| 05b1 | [Barra de ferramentas, tema por instância e CSS de conteúdo](05b1-barra-de-ferramentas-e-tema.md) (concluída; falta o CI do PR) | Toolbar configurável (presets/grupos) com foco itinerante e menus em `popover` nativo (implementação própria, sem `@angular/aria`), ícones SVG internos, comandos sem diálogo, guarda de tabela > 100, tema por instância por `applyRteTheme`, `content.css` `rt-*` no core (compartilhado com a 06) | 05a |
| 05b2a | [Diálogos, link, idioma, autor da citação e tabela](05b2a-dialogos-link-e-idioma.md) (concluída; falta o CI do PR) | Base de diálogos em `<dialog>` nativo modal dentro do host, carregada por `@defer`, com Signal Forms; diálogos de link (política do core), idioma, autor/cargo da citação e tabela nova; itens `link`/`lang`/`quoteAuthor`, `Mod-K`, `openDialog()`, seção `dialogs` dos rótulos | 05b1 |
| 05b2b | [Menus flutuantes](05b2b-menus-flutuantes.md) (concluída; falta o CI do PR) | Menus flutuantes de texto, link, tabela (guarda > 100) e imagem (alinhamento e remoção) em `popover` manual dentro do host, posição por função pura, sem roubar o foco, `Alt+F10`/`focusFloatingMenu()`, `floatingMenus`, seção `floating` dos rótulos | 05b2a |
| 05c1 | [Diálogos de mídia, detalhes da imagem e `mediaChange`](05c1-dialogos-de-midia.md) (concluída; falta o CI do PR) | Diálogos de imagem (texto alternativo ou decorativa, legenda, crédito, alinhamento, largura), vídeo (pôster, faixas) e *embed* por endereço sobre a base da 05b2a; itens `image`/`video`/`embed`; menus flutuantes de vídeo e *embed* e "Detalhes…" da imagem; seleção de mídia por clique; `mediaChange`/`mediaSession` | 05b2b |
| 05c2a | [Envio de arquivos, marcadores de envio e validadores de mídia](05c2a-envio-de-arquivos.md) (concluída; falta o CI do PR; ADR 0013) | `@defer` próprio dos formulários de mídia, `RteUploadAdapter`, `httpUploadAdapter` (`/upload`), envio por diálogo/colar/soltar com marcadores, bandeja, progresso e cancelamento real, `uploadError`, `rteUploadsFinished`/`rteImagesHaveAlt` | 05c1 |
| 05c2b | Rascunho, salvamento e colagem externa (a escrever; diretrizes H1–H10 no Apêndice A da 05c2a) | Rascunho, `isDirty`/`markSaved()`, `onMediaRemoved`, `registerExternal`, URL colada → *embed*, `beforeunload` | 05c2a |
| 05d | Menu `/`, busca, contadores e fechamento (a escrever) | UI do menu `/` e da busca, contadores e `aria-live`, orçamentos de desempenho, `api-extractor` | 05c2b |
| 06 | [Renderização](06-renderizacao.md) | `@cds/rte-render`: pipe, sumário, CSS de leitura | 02, 04 |
| 07 | [Demo, docs e servidor de exemplo](07-demo-docs-exemplos.md) | App demo/playground, site de docs, `examples/server-node` | 05, 06 |
| 08 | [Qualidade](08-qualidade.md) | E2E em 3 engines, a11y, desempenho, visual, pacote | 05 |
| 09 | [Release e governança](09-release-governanca.md) | Versionamento, npm com provenance, MIT, SECURITY (parte 09a concluída) | todas |

## Decisões

**Decididas (2026-10-02):**

| Decisão | Spec | Resultado |
|---|---|---|
| Engine do sanitizador | 04 | **`sanitize-html` no servidor/Node e `DOMPurify` no navegador**, mesma API e mesma suíte; a do servidor é a que vale |
| Modo padrão do pipe | 06 | **`sanitize`** |
| Integração Tiptap × Angular | 05 | **`Editor` direto** com wrapper próprio, sem `ngx-tiptap` |
| Nome e escopo npm | 01 | **`@cds/rte-*`** (produto `cds-text-editor`); falta o autor confirmar a organização npm `cds` |
| Ícones e overlay | 05 | **SVG internos** e **`<dialog>`/popover nativos**, sem lucide e sem CDK (spikes confirmam) |
| Formulários no Angular | 05a | **`FormValueControl` no componente, sem CVA** (no Angular 22.2 o `NgControl` liga o controle customizado nativamente em Reactive/Template Forms; um CVA no elemento venceria esse caminho e o do `[formField]`) |
| `@angular/aria` × implementação própria (S2) | 05b1 | **Implementação própria** do foco itinerante e do *menu button* atrás de diretivas internas (o `@angular/aria@22.2.1` exige `@angular/cdk` 22.2.1 exato como peer, usa entry interno do core e não tem diálogo nem posicionamento) |

**Ainda em aberto:**

| Decisão | Spec | Recomendação |
|---|---|---|
| Faixa Angular × Tiptap da matriz de CI | 08 | Angular 22 mín. e último × Tiptap 3 mín. e último |

## Convenções comuns a todas as specs

- Idioma da documentação interna: **Português-Brasil**. Código e nomes públicos: **inglês**.
- Todo recurso só está "feito" com **teste automatizado e verificação em navegador real** (regra do plano, seção 9).
- Nomes de APIs do Angular 22 nas specs são **esboços**: reconfirmar na documentação oficial ao implementar (plano, seção 6).
- Cada spec termina com **critérios de aceite verificáveis**; uma spec só está concluída quando todos passam.
