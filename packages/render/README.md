# @cds/rte-render

Renderização do HTML produzido pelo editor, para exibir o conteúdo sem carregar o editor.

**Status: em construção.** Ainda sem versão publicada.

Instalação (nome provisório, escopo `@cds` ainda não confirmado): `npm i @cds/rte-render`

Modo `trusted` (`<article [rteContent]="html" [mode]="'trusted'">`): o HTML precisa estar **já sanitizado por `createSanitizer`** (mesma versão maior do `@cds/rte-sanitizer`, com as opções do editor); as transformações de exibição só são seguras sobre essa saída canônica.

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

Repositório: cds-text-editor (monorepo). Licença MIT.
