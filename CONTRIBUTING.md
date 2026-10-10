# Contribuindo

Obrigado pelo interesse. Documentação em português do Brasil; código e nomes públicos em inglês; mensagens das ferramentas (`tools/`, regras de lint) em pt-BR.

## Pré-requisitos

- Node.js LTS compatível com Angular 22: `^22.22.3 || ^24.15.0 || >=26.0.0` (campo `engines` do `package.json`).
- npm 11 ou superior (`engine-strict=true`: o npm 10 recusa a instalação). O Node 24 LTS já traz o npm 11; em outros Node use `npm i -g npm@11`.

## Começando

```bash
npm ci
```

O `.npmrc` da raiz tem `engine-strict=true` e não usa `legacy-peer-deps` (ver ADR 0001).

## Comandos

```bash
npx nx run-many -t lint,build,test   # lint, build e testes de todos os pacotes
npx nx run-many -t verify-package    # npm pack + publint + attw
npm run check:rules                  # regras do repositório
npm run check:licenses               # licenças das dependências
npm run test:tools                   # testes das ferramentas em tools/
npx prettier --check .               # formatação
```

Testes E2E: veja [e2e/README.md](e2e/README.md).

## Fluxo

1. O trabalho segue **spec → plano → implementação → verificação** (índice em `docs/specs/README.md`).
2. **Nenhum recurso é feito sem teste automatizado e verificação em navegador real.**
3. Crie uma branch a partir de `main` e abra um PR usando o template.
4. Se a mudança afeta um pacote publicado, adicione um changeset (`npx changeset`). Os 5 pacotes são versionados juntos (`fixed`): todos saem na mesma versão. Mudança no relatório de API (`packages/*/api/*.api.md`), no CSS público (`*.css-api.md`) ou no esquema (`docs/html-schema.md`) exige changeset do tipo certo: em `0.x`, remoção ou alteração pede `minor`; a partir da `1.0`, `major`. Para regravar os relatórios use `UPDATE_API=1 npx nx run-many -t api`. PR que toca `packages/**` sem mudança publicável (refatoração interna, testes) leva um changeset vazio: `npx changeset add --empty`; sem ele o `changeset status` do `release-plan` reprova o PR.
5. Lint, build, testes e `check:rules` precisam passar; o CI (`.github/workflows/ci.yml`) roda essas verificações em todo PR.

## Desempenho

Os números de desempenho do editor são preliminares e de 2026-10-07 ([ADR 0016](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/docs/decisions/0016-desempenho-e-api.md)): no Chromium local, no cenário completo, a tecla leva 15 a 16 ms de mediana a frio e 46 a 63 ms depois de 150 a 200 transações seguidas, contra um orçamento de 50 ms no p95. Os orçamentos só reprovam localmente, com `RTE_PERF_ENFORCE=1` (`e2e/angular/editor-perf-budget.spec.ts`); no CI eles apenas informam, porque os runners são cerca de 2 vezes mais lentos que a máquina local (adendo de 2026-10-08 do ADR 0016), e lá vale só a guarda de 2 vezes o orçamento. Quem muda algo que afeta o custo por tecla ou de criação roda essa verificação local antes de abrir o PR.

Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).
