# Contribuindo

Obrigado pelo interesse. Documentação em português do Brasil; código, nomes públicos e mensagens de erro em inglês.

## Pré-requisitos

- Node.js LTS compatível com Angular 22: `^22.22.3 || ^24.15.0 || >=26.0.0` (campo `engines` do `package.json`).
- npm 10 ou superior.

## Começando

```bash
npm ci
```

O `.npmrc` da raiz tem `legacy-peer-deps=true` (ver ADR 0001).

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
4. Se a mudança afeta um pacote publicado, adicione um changeset (`npx changeset`). Cada pacote tem versão independente.
5. Lint, build, testes e `check:rules` precisam passar.

Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).
