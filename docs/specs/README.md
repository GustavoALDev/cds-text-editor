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
| 05 | [Editor Angular](05-editor-angular.md) | `@cds/rte-angular`: componente, Signal Forms, UI, i18n, a11y, upload | 02, 03 |
| 06 | [Renderização](06-renderizacao.md) | `@cds/rte-render`: pipe, sumário, CSS de leitura | 02, 04 |
| 07 | [Demo, docs e servidor de exemplo](07-demo-docs-exemplos.md) | App demo/playground, site de docs, `examples/server-node` | 05, 06 |
| 08 | [Qualidade](08-qualidade.md) | E2E em 3 engines, a11y, desempenho, visual, pacote | 05 |
| 09 | [Release e governança](09-release-governanca.md) | Versionamento, npm com provenance, MIT, SECURITY | todas |

## Decisões

**Decididas (2026-10-02):**

| Decisão | Spec | Resultado |
|---|---|---|
| Engine do sanitizador | 04 | **`sanitize-html` no servidor/Node e `DOMPurify` no navegador**, mesma API e mesma suíte; a do servidor é a que vale |
| Modo padrão do pipe | 06 | **`sanitize`** |
| Integração Tiptap × Angular | 05 | **`Editor` direto** com wrapper próprio, sem `ngx-tiptap` |
| Nome e escopo npm | 01 | **`@cds/rte-*`** (produto `cds-text-editor`); falta o autor confirmar a organização npm `cds` |
| Ícones e overlay | 05 | **SVG internos** e **`<dialog>`/popover nativos**, sem lucide e sem CDK (spikes confirmam) |

**Ainda em aberto:**

| Decisão | Spec | Recomendação |
|---|---|---|
| Faixa Angular × Tiptap da matriz de CI | 08 | Angular 22 mín. e último × Tiptap 3 mín. e último |

## Convenções comuns a todas as specs

- Idioma da documentação interna: **Português-Brasil**. Código e nomes públicos: **inglês**.
- Todo recurso só está "feito" com **teste automatizado e verificação em navegador real** (regra do plano, seção 9).
- Nomes de APIs do Angular 22 nas specs são **esboços**: reconfirmar na documentação oficial ao implementar (plano, seção 6).
- Cada spec termina com **critérios de aceite verificáveis**; uma spec só está concluída quando todos passam.
