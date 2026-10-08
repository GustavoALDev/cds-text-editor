# cds-text-editor

Editor de texto rico para **Angular 22+**, construído sobre o **Tiptap 3**, publicado como um conjunto de pacotes independentes sob licença MIT.

> **Status: em construção.** Os cinco pacotes estão implementados (spec 05 fechada no ADR 0016) e sem versão publicada; a confirmação nos três navegadores é a rodada do CI. A superfície pública de cada entry está congelada em relatórios `packages/*/api/*.api.md` (alvo `api`).

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

## Pacotes

Os nomes `@cds/rte-*` são provisórios (ver [ADR 0001](docs/decisions/0001-escopo-nome-versoes-e-ferramentas.md)).

| Pacote                                     | Estado                                                | Descrição                                       |
| ------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------- |
| [`@cds/rte-core`](packages/core)           | implementado; API em [`api/`](packages/core/api)      | Extensões Tiptap, utilitários e esquema do HTML |
| [`@cds/rte-sanitizer`](packages/sanitizer) | implementado; API em [`api/`](packages/sanitizer/api) | Sanitização do HTML                             |
| [`@cds/rte-theme`](packages/theme)         | implementado; API em [`api/`](packages/theme/api)     | Tema (CSS e tokens)                             |
| [`@cds/rte-angular`](packages/angular)     | implementado; API em [`api/`](packages/angular/api)   | Componente Angular do editor                    |
| [`@cds/rte-render`](packages/render)       | implementado; API em [`api/`](packages/render/api)    | Renderização do HTML                            |

## Navegadores

Política **sempre atualizada**: o suporte declarado é o das versões abaixo, e só se promete o que se testa. Fonte única; o guia de uso aponta para esta tabela. Spec 08b (O10), [ADR 0021](docs/decisions/0021-visual-movel-e-leitores-de-tela.md).

| Navegador | Faixa suportada | Como é verificado |
| --- | --- | --- |
| Chrome e Edge (desktop) | as duas últimas versões estáveis | Chromium do Playwright no Linux (E2E, visual, desempenho) |
| Firefox (desktop) | a última estável e a ESR corrente | Firefox do Playwright no Linux (E2E e visual) |
| Safari (macOS) | a última versão e a anterior | WebKit do Playwright no Linux; Safari real só pelo [roteiro manual](docs/quality/roteiro-leitor-de-tela.md) |
| Safari (iOS) | a última versão e a anterior | WebKit com o descritor do iPhone no Playwright (**não é** o Safari do iOS); aparelho real só pelo roteiro manual |
| Chrome (Android) | a última versão estável | Chromium com o descritor do Pixel 7 no Playwright; aparelho real só pelo roteiro manual |

As versões exatas dos motores de cada execução ficam no resumo do job `verify` e no artefato `quality-reports` (`e2e/test-results/browsers/`). Motores antigos estão **fora da política** (sem verificação, sem promessa). Leitores de tela: as combinações obrigatórias estão no [roteiro](docs/quality/roteiro-leitor-de-tela.md) (execução do dono, antes da 1.0).

**Recursos que impõem piso** (versão mínima **informativa**: o recurso existe a partir dela e o pacote "pode funcionar" ali, mas só a faixa acima é suportada). Fonte: MDN browser-compat-data 8.1.5, consultado em 2026-10-08.

| Recurso (uso no pacote) | Chrome/Edge | Firefox | Safari (macOS/iOS) |
| --- | --- | --- | --- |
| `popover` e `showPopover()` (menus da barra, menus flutuantes, lista do `/`) | 114 | 125 | 17 (iOS 17; atributo no iOS 18.3) |
| `<dialog>` e `showModal()` (diálogos) | 37 (Edge 79) | 98 | 15.4 |
| `light-dark()` (tema claro/escuro) | 123 | 120 | 17.5 |
| `@property` (tokens do tema) | 85 | 128 | 16.4 |
| Sintaxe de cor relativa (`oklch(from …)`); sem ela vale o plano B em TypeScript ([ADR 0002](docs/decisions/0002-tema-cores-padrao-e-navegadores.md)) | 122 | 128 | 18 |
| `color-mix()` | 111 | 113 | 16.2 |
| `@layer` | 99 | 97 | 15.4 |
| Unidades `dvh` (diálogos e menus em telas móveis) | 108 | 101 | 15.4 |
| `window.visualViewport` (posição dos menus com teclado virtual e zoom) | 61 (Edge 79) | 91 | 13 |
| `prefers-contrast` e `forced-colors` | 96 / 89 | 101 / 89 | 14.1 / 16 |

Notas: o WebKit móvel do Playwright não é o Safari do iOS (sem teclado real nem alças de seleção); o teclado virtual, a autocorreção e a composição só se provam no aparelho (roteiro, seção "Seção móvel real"). O atributo `popover` no iOS só aparece como API a partir do 18.3 na tabela de compatibilidade, embora o recurso funcione desde o 17. Divergências entre motores registradas nos ADR [0019](docs/decisions/0019-matriz-de-versoes-e-relatorios.md) e 0021 (J8 por cookie de CSRF e `SameSite` em `127.0.0.1`, `Range` no WebKit; menu da tabela pelo recuo previsto da M9).

## Especificações

O projeto é guiado por specs em [`docs/specs`](docs/specs) (índice em [`docs/specs/README.md`](docs/specs/README.md)). Decisões de arquitetura ficam em [`docs/decisions`](docs/decisions).

## Desenvolvimento

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Segurança: [SECURITY.md](SECURITY.md). Licença: [MIT](LICENSE).

> Projeto independente, **não afiliado à Tiptap nem ao ProseMirror**.
