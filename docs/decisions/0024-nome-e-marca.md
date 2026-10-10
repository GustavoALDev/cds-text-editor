# ADR 0024: Nome, escopo e marca (Como DEVI.A ser)

- Status: aceita (2026-10-10)
- Decisão do dono; executa a troca mecânica prevista na PB2 da spec 09b (`docs/specs/09b-publicacao.md`). Substitui a parte (a) do ADR 0001 (escopo `@cds` provisório).

## Contexto

O escopo `@cds` era provisório (ADR 0001) e, pela verificação da 09b, parece pertencer ao Clarity Design System (`@cds/core`, `@cds/angular`). O projeto será divulgado no canal do YouTube e no blog **Como DEVI.A ser**, do dono, e o nome precisa seguir a marca. Nada foi publicado, então a troca não quebra nenhum consumidor.

## Decisão

- Marca: **Como DEVI.A ser**. Produto: **DEVI.A Editor** (títulos do demo, do site de docs e dos READMEs).
- Escopo npm: **`@comodeviaser`**, mantendo os nomes dos pacotes: `@comodeviaser/rte-core`, `@comodeviaser/rte-sanitizer`, `@comodeviaser/rte-theme`, `@comodeviaser/rte-angular`, `@comodeviaser/rte-render`. O workspace raiz passa a `@comodeviaser/source` (também a condição de export usada no desenvolvimento).
- Repositório: `GustavoALDev/comodeviaser-editor` (o GitHub redireciona o nome antigo); site em `/comodeviaser-editor/`.
- Ficam como estão: o seletor `rte-editor`, os prefixos `Rte`/`RTE_` dos nomes públicos e `provideRichText` (ADR 0023).
- Os arquivos derivados do nome do pacote mudam junto: `fesm2022/comodeviaser-rte-angular*.mjs`, tarballs `comodeviaser-rte-*.tgz`, a marca `.comodeviaser-rte-consumer` do `consumer.mjs`. A variável `CDS_BROWSER_LIBS_ROOT` do `e2e/with-browser-libs.sh` passa a `RTE_BROWSER_LIBS_ROOT`.
- O `check:rules` reprova `@cds/`, `cds-rte-` e `cds-text-editor` em qualquer arquivo rastreado fora de `docs/decisions/`, `docs/specs/` e `docs/superpowers/` (`OLD_PROJECT_NAMES` em `tools/check-repo-rules.mjs`), que ficam como registro histórico.

## Consequências

- Antes de publicar, o dono cria a organização npm `comodeviaser` (`https://www.npmjs.com/org/create`); se o nome não estiver livre, a troca é outro commit mecânico igual a este. Esse item continua em `docs/release/prontidao-1.0.md` (`TODO-AUTOR`).
- Consumidores locais antigos (`~/.cache/cds-rte-consumer/*`) não têm a marca nova: o `prepare` recusa o diretório até ele ser apagado ou receber `touch .comodeviaser-rte-consumer`.
- Os changesets já registrados passam a citar os nomes novos; a primeira versão continua `0.1.0`.
