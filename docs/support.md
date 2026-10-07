# Suporte e depreciação

## Versionamento

Semver, com versão **independente por pacote** (Changesets). Pré-lançamentos saem com a tag `next` (modo `npx changeset pre enter next`); a tag `latest` só passa a existir na `1.0.0`.

## API pública

São públicos, e sujeitos ao semver:

- os `exports` de cada pacote `@cds/rte-*` (tipos incluídos);
- as classes CSS `rte-*`;
- as variáveis `--rte-*` dos níveis 1 a 3 do tema.

Todo o resto (caminhos internos, `rte-*` de implementação não documentados, variáveis de nível 4+) é interno e pode mudar em qualquer versão.

## Depreciação

Uma API pública é marcada `@deprecated` (com a alternativa) e só é removida **em uma versão major**, depois de ao menos **uma versão minor** com o aviso.

## Angular

- `peerDependencies` `@angular/*` em `>=22.0.0 <23` (o `@cds/rte-angular` exige `>=22.2.1 <23`, por causa do `FormValueControl`).
- **Minors do 22**: a suíte (unitária, zone.js e E2E) roda contra a versão fixada no lockfile; mudanças nos minors seguintes entram por atualização de dependências e, se quebrarem, viram correção em patch.
- **Angular 23**: suporte novo é uma versão minor ou major da lib, publicada depois que a suíte passar no 23; o intervalo `<23` só sobe junto com esse suporte.

## Versões suportadas

Ver [SECURITY.md](../SECURITY.md).
