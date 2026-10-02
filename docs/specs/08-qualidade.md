# Spec 08 — Qualidade (E2E, acessibilidade, desempenho, visual, pacote)

> Depende da spec 05 (e usa 02, 06 e 07). Referência: plano seções 3.4, 6.6, 8 (Fase 6), 9 e 9.1.

## 1. Objetivo

Portas de qualidade **obrigatórias para merge**: nenhum recurso é "feito" sem teste automatizado **e** verificação em navegador real, em **3 engines**.

## 2. Fora de escopo

Publicação (spec 09). Teste manual com leitor de tela é um roteiro documentado, executado antes da 1.0 (spec 09).

## 3. [DECIDIR]

- **Matriz de CI:** Angular 22 mínimo e mais recente × Tiptap 3 mínimo e mais recente; `next`/canário do Angular **não bloqueante**. Recomendação acima; confirmar faixas ao implementar.

## 4. Camadas

| Camada | Ferramenta | Conteúdo |
|---|---|---|
| **E2E** | Playwright em Chromium, Firefox e WebKit | digitar, formatar, colar print, arrastar imagem, **redimensionar pelos 4 cantos**, menu `/`, Ctrl+F, modal de link com `rel`, upload (progresso e cancelamento), rascunho + `beforeunload`, Vimeo/Spotify, tabela, desfazer/refazer, teclado virtual (emulação mobile) |
| **Acessibilidade** | axe + roteiro manual | toolbar, modais, anúncios, foco; **0 violações sérias** |
| **Desempenho** | Playwright + `performance.measure` | metas da spec 05 R4; comparação com *baseline*, **falha se piorar > 10 %** |
| **Visual** | Playwright screenshots | tema padrão e 4 temas × claro/escuro × densidades; editor × render (spec 06) |
| **SSR** | `apps/ssr-smoke` | compila, renderiza, hidrata; variáveis do tema presentes no HTML do servidor; CSP restritiva |
| **Zoneless e zone.js** | mesma suíte | os dois modos |
| **Pacote** | publint, attw, instalação limpa | tarballs instalados num app Angular 22 limpo; peers corretos |
| **Tamanho** | size-limit | orçamento por entry point |
| **Licenças** | license-checker | só MIT/ISC/BSD/Apache; nenhum `@tiptap-pro/*` |

## 5. Requisitos (como montar, lições do modelo)

- **R1.** E2E com **API simulada no navegador** (`page.route`): rápido e determinístico, sem back-end; um segundo conjunto menor roda contra o `examples/server-node`.
- **R2.** **Gancho de teste estável** para o `Editor` (entry `/testing`, spec 05), nunca `ng.getComponent`.
- **R3.** O CI roda **`build` junto dos testes** (o `serve` pode ficar com bundle antigo, lição 15).
- **R4.** Chromium em ambientes sem bibliotecas (ex.: WSL): extrair `libnspr4`, `libnss3`, `libasound2` de `.deb` e usar `LD_LIBRARY_PATH` + `CHROME`; documentado em `CONTRIBUTING`.
- **R5.** Evitar as armadilhas já vividas: `Ctrl+End` não colapsa a seleção (usar `editor.commands.focus('end')` e esperar), clicar em imagem selecionada move o cursor, alças fora da área visível exigem rolagem, leituras de layout durante animação exigem `expect.poll` (lições 16 e 17).
- **R6.** Teste de propriedade do tema (spec 02) roda aqui nos 3 navegadores.
- **R7.** Matriz de navegadores suportados **documentada** com base nos resultados reais.
- **R8.** Relatórios de cobertura e de tamanho publicados como artefatos do CI.

## 6. Critérios de aceite

- [ ] Todos os fluxos da tabela passam em Chromium, Firefox e WebKit (ou divergência documentada e justificada).
- [ ] axe: 0 violações sérias; roteiro manual de leitor de tela executado e registrado.
- [ ] Desempenho dentro das metas e com *baseline* versionado; regressão > 10 % derruba o CI.
- [ ] App SSR de fumaça verde; instalação limpa em Angular 22 verde.
- [ ] Pipeline **obrigatório** para merge (branch protegida).

## 7. Riscos

| Risco | Mitigação |
|---|---|
| E2E instável (flaky) | Esperas por estado (`expect.poll`), nunca por tempo fixo; repetição limitada e relatório de flakes |
| WebKit/Firefox divergentes em seleção e foco | Tratar como achado, corrigir ou documentar |
| Orçamentos de desempenho irreais | Calibrar com o S3 (spec 05) antes de travar o CI |
