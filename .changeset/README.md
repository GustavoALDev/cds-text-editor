# Changesets

Este diretório guarda os changesets (notas de versão) dos pacotes `@cds/rte-*`. Os 5 pacotes são versionados juntos (`fixed`): todos saem na mesma versão, com dependências internas exatas.

- Mudança no relatório de API, no CSS público ou no esquema do HTML exige changeset do tipo certo (em `0.x`, remoção ou alteração pede `minor`).
- Regravar os relatórios: `UPDATE_API=1 npx nx run-many -t api`.

- Criar um changeset: `npx changeset`
- Ver o estado: `npx changeset status`

Mais detalhes: [documentação do Changesets](https://github.com/changesets/changesets).
