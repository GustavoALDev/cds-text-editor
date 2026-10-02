# cds-text-editor

Editor de texto rico para **Angular 22+**, construído sobre o **Tiptap 3**, publicado como um conjunto de pacotes independentes sob licença MIT.

> **Status: em construção.** Nada aqui está pronto para uso em produção; nenhuma versão foi publicada.

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

## Pacotes

Os nomes `@cds/rte-*` são provisórios (ver [ADR 0001](docs/decisions/0001-escopo-nome-versoes-e-ferramentas.md)).

| Pacote                                     | Descrição                                       |
| ------------------------------------------ | ----------------------------------------------- |
| [`@cds/rte-core`](packages/core)           | Extensões Tiptap, utilitários e esquema do HTML |
| [`@cds/rte-sanitizer`](packages/sanitizer) | Sanitização do HTML                             |
| [`@cds/rte-theme`](packages/theme)         | Tema (CSS e tokens)                             |
| [`@cds/rte-angular`](packages/angular)     | Componente Angular do editor                    |
| [`@cds/rte-render`](packages/render)       | Renderização do HTML                            |

## Especificações

O projeto é guiado por specs em [`docs/specs`](docs/specs) (índice em [`docs/specs/README.md`](docs/specs/README.md)). Decisões de arquitetura ficam em [`docs/decisions`](docs/decisions).

## Desenvolvimento

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Segurança: [SECURITY.md](SECURITY.md). Licença: [MIT](LICENSE).
