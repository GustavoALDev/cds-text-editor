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

## Especificações

O projeto é guiado por specs em [`docs/specs`](docs/specs) (índice em [`docs/specs/README.md`](docs/specs/README.md)). Decisões de arquitetura ficam em [`docs/decisions`](docs/decisions).

## Desenvolvimento

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Segurança: [SECURITY.md](SECURITY.md). Licença: [MIT](LICENSE).

> Projeto independente, **não afiliado à Tiptap nem ao ProseMirror**.
