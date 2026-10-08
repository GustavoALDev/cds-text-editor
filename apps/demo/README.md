# Demo e playground do tema

App Angular 22 pré-renderizado (spec 07b, ADR 0017) que consome os pacotes `@cds/rte-*` **pelos tarballs**, fora do repositório, como um consumidor externo. Rotas: `/`, `/editor`, `/toolbar`, `/forms`, `/i18n`, `/files`, `/render` e `/theme` (playground com CSS e TypeScript copiáveis).

## Como rodar

```bash
npx nx run-many -t build -p core sanitizer theme angular render   # pacotes primeiro
node tools/consumer.mjs pack prepare install test build           # ciclo completo
node tools/consumer.mjs check-snippets                            # tsc dos snippets do tema
node apps/demo/serve.mjs                                          # serve o build com a CSP estrita
node apps/demo/serve.mjs --with-server                            # idem + servidor de exemplo (envio real)
node tools/consumer.mjs dev                                       # ng serve com proxy para o servidor de exemplo
```

Variáveis: `RTE_CONSUMER_DIR` (diretório do consumidor, **fora** do repositório; padrão `$RUNNER_TEMP` ou `$TMPDIR/cds-rte-consumer/demo`), `RTE_NPM` (npm a usar, ex.: `npx -y npm@11`), `HOST` (`dev` e servidor de exemplo; padrão `127.0.0.1`), `RTE_DEMO_PORT` e `RTE_SERVER_PORT`.

Nunca rode `npm install` dentro de `apps/demo`: ele não é um _workspace_; o `prepare` copia o app para o diretório do consumidor.

## Envio de arquivos

Por padrão o envio é **simulado**: nada é lido nem enviado, só nome, tipo e tamanho. Com `--with-server` (ou `dev`) a página `/files` usa o servidor de exemplo de verdade.

## CSP

`serve.mjs` envia a CSP estrita por cabeçalho e o `index.html` a repete numa `<meta>`; `frame-ancestors` só vale pelo cabeçalho. O `ng serve` não prova a CSP.

## E2E

```bash
npx playwright test -c apps/demo/e2e --project=chromium --workers=2
```

Firefox e WebKit rodam no _job_ `demo` do CI.
