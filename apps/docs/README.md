# Documentação (apps/docs)

Site de documentação do DEVI.A Editor (spec 07c, ADR 0018): app Angular 22 pré-renderizado, com a CSP estrita do demo, que consome os pacotes `@comodeviaser/rte-*` **pelos tarballs**, fora do repositório, como um consumidor externo. Guias em Markdown (`content/`), referência de API gerada dos `.d.ts` publicados, exemplos compilados (`examples/`), busca offline e links verificados.

## Como rodar

```bash
npx nx run-many -t build -p core sanitizer theme angular render   # pacotes primeiro

# Modelo de API (os relatórios packages/*/api/*.api.md não mudam) e Markdown da referência
export RTE_API_MODEL=dist/api-model
node tools/api-report.mjs packages/core
node tools/api-report.mjs packages/sanitizer
node tools/api-report.mjs packages/theme
node tools/api-report.mjs dist/packages/angular
node tools/api-report.mjs dist/packages/render
npx api-documenter markdown -i dist/api-model -o dist/api-markdown

node tools/docs-content.mjs                                       # dist/docs-content/: páginas, nav, índice de busca, links
node tools/consumer.mjs --app docs pack prepare install test build
node tools/check-links.mjs "$RTE_CONSUMER_DIR/dist/docs/browser" --base /comodeviaser-editor/ --readmes
node apps/docs/serve.mjs --dir "$RTE_CONSUMER_DIR/dist/docs/browser"   # serve sob /comodeviaser-editor/ com a CSP
```

Mudou só um Markdown ou exemplo? Repita `node tools/docs-content.mjs` e o `consumer.mjs --app docs prepare install test build` (os pacotes e o modelo de API só mudam com o código dos pacotes).

Variáveis: `RTE_CONSUMER_DIR` (consumidor, **fora** do repositório; padrão `$TMPDIR/comodeviaser-rte-consumer/docs`), `RTE_NPM` (npm a usar, ex.: `npx -y npm@11`), `RTE_SITE_BASE` (prefixo da publicação, padrão `/comodeviaser-editor/`; vale só no `consumer.mjs` e no `serve.mjs`), `RTE_DOCS_PORT` (padrão 4320; +1 para `--no-csp-header`) e `RTE_DOCS_DIR` (E2E: serve outra pasta, como o site montado do _job_ `pages`).

Nunca rode `npm install` dentro de `apps/docs`: ele não é um _workspace_; o `prepare` copia o app (sem `content/` nem `e2e/`) e o conteúdo gerado para `src/generated/` do consumidor. No Git Bash use `MSYS_NO_PATHCONV=1` ao passar `--base /x/`.

## Escrever uma página

1. Crie `content/guia/<slug>.md` com _front matter_ (`title`, `description`) e um único `# título`; seções são `##`/`###` (id por _slug_ ASCII ou `{#id}` explícito; `conteudo` e `docs-search-*` são reservados).
2. Registre a página em `content/nav.json`.
3. Links entre páginas: `[texto](guia/outra#secao)` ou `outra.md`, sempre relativos à base (sem `/` inicial).
4. Todo bloco de código precisa de uma diretiva na linha anterior, no nível raiz da página (não dentro de lista nem de citação):
   - `<!-- example: examples/pasta/arquivo.ts#regiao -->`: código vindo de arquivo compilado (regiões `// #region nome` / `// #endregion` ou `<!-- #region nome -->`);
   - `<!-- generated: install-command -->` ou `<!-- generated: styles-order [render] -->`: gerado dos `package.json` publicados;
   - `<!-- no-compile: motivo -->` seguido do bloco cercado escrito à mão (saída de terminal, sintaxe);
   - `<!-- live: id -->`: exemplo vivo registrado em `examples/registry.ts`.
5. HTML cru só `b`, `i`, `em`, `strong`, `code`, `br`, `p`, `sup`, `sub`, `kbd`; o resto é escapado, e padrões perigosos (`script`, `style`, `on*`, `javascript:`) falham o _build_. Comentários HTML são descartados (só as diretivas valem).

## Exemplos

Tudo em `examples/**` é compilado em modo estrito pelo `ng build` do consumidor contra os tarballs. Afirmações negativas são `// @ts-expect-error` no próprio exemplo. Funções e componentes testáveis têm `*.example.spec.ts`, rodado pelo `ng test` do consumidor.

## Referência de API

Uma página por entry publicado (`api/<entry>`, por exemplo `api/core-html`), agrupada do Markdown do `api-documenter` por `tools/docs/api-group.mjs`, sem membros `ɵ*` nem `@internal`. Para mudar a referência, mude o JSDoc do pacote.

## E2E

```bash
npx playwright test -c apps/docs/e2e --project=chromium --workers=2
```

I1 (fumaça, CSP, offline e axe), I2 (navegação), I3 (sem JS), I4 (busca), I5 (exemplos vivos) e I6 (API). Dois servidores sob `/comodeviaser-editor/`: um com a CSP por cabeçalho e `<meta>`, outro só com a `<meta>`; exigem `RTE_CONSUMER_DIR` com o `build` pronto. Firefox e WebKit rodam no _job_ `docs` do CI; no Windows, o Firefox com 4 _workers_ às vezes trava (repita com `--workers=2`).

## Publicação

O _job_ `pages` do `ci.yml` monta `docs-static` na raiz e `demo-pages` em `demo/`, confere os links do site montado e publica no GitHub Pages, só em _push_ no `main` e com a variável de repositório `RTE_PAGES = true` (TODO-AUTOR: ativar Pages com origem "GitHub Actions"). O `links.yml` consulta os links externos uma vez por semana e só registra o resultado. Para trocar a base (domínio próprio), veja as pendências do ADR 0018: `RTE_SITE_BASE` sozinho não basta.
