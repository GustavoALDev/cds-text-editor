# Spec 06 — Renderização (`@cds/rte-render`)

> Depende das specs 02 e 04. Referência: plano seções 2.3, 4.4 e 8 (Fase 4). Modelo (MyPresentation): `libs/ui/src/lib/rich-html/` (`rich-html.pipe`, `rich-toc*`, `rich-content.scss`).

## 1. Objetivo

Exibir o conteúdo publicado **idêntico ao do editor**, com segurança por padrão e funcionando em SSR: pipe/diretiva, sumário e CSS de leitura em `--rte-*`.

## 2. Fora de escopo

Edição (spec 05); sanitização no servidor (spec 04, apenas consumida no modo `sanitize`).

## 3. Decisões (decididas)

- **Modo padrão do pipe: `sanitize`**, usando o sanitizador da spec 04 (DOMPurify no navegador, ~11,6 kB gzip; `sanitize-html` no SSR). `trusted` fica documentado como "só se o servidor já sanitiza".
- `injectRteHeadMeta` (descrição e tempo de leitura para `<head>`): **fora da v1**.

## 4. Conteúdo

| Item | Detalhe |
|---|---|
| `RteHtmlPipe` / diretiva `[rteHtml]` | `mode: 'sanitize' \| 'trusted'`; devolve `SafeHtml` apenas depois de sanitizar no modo padrão |
| `RteTocComponent` + `extractToc` | `extractToc` só com string (funciona em SSR, sem DOM); componente em OnPush e signals |
| `rte-content.css` (entry `/styles`) | figuras (alinhamento, legenda, crédito), blocos de notícia (citação em destaque, caixa de destaque ×4, "Leia também"), tabelas com scroll, âncoras com `scroll-margin`, `iframe`/`video` responsivos, código com tema `--rte-code-*`, claro/escuro |

## 5. Requisitos

- **R1.** Usa **os mesmos tokens** do tema (spec 02): mudar as 3 cores muda editor e site juntos.
- **R2.** CSS em `@layer rte.content`; classes `rte-content` e as classes do esquema (`rt-*`) estáveis; sem `::ng-deep`; sem Tailwind.
- **R3.** Aparência equivalente à do editor (mesma tipografia, espaçamentos e blocos): validada por **screenshot comparada** editor × página.
- **R4.** SSR: o conteúdo existente aparece **sem JS**; o pipe funciona no servidor (o sanitizador não pode depender de DOM de navegador).
- **R5.** O sumário usa os ids de título gerados pelo core; `extractToc` ignora títulos vazios.
- **R6.** `sideEffects` declara só o CSS; tamanho dentro de orçamento definido após medir (`size-limit`).

## 6. Testes

Unitários do pipe nos dois modos; do `extractToc` (títulos aninhados, ids duplicados, vazio); **conteúdo do fixture do contrato** renderizado sem nenhum `<script>`/handler; SSR em app mínimo (spec 08); regressão visual editor × render em claro e escuro nos 3 navegadores (spec 08).

## 7. Critérios de aceite

- [ ] Fixture do editor renderiza **idêntico** ao do editor (screenshot, diferença dentro de tolerância definida) em claro e escuro.
- [ ] Modo `sanitize` por padrão; teste prova que `<script>` e `on*` não chegam ao DOM.
- [ ] Renderiza em SSR sem erro e com o conteúdo presente no HTML do servidor.
- [ ] `attw`/`publint` verdes; orçamento de tamanho no CI.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Sanitizador no bundle do site (custo já baixo com DOMPurify) | `trusted` documentado; no navegador a engine é o DOMPurify (~11,6 kB gzip, spec 04) |
| Divergência visual editor × site | Teste visual obrigatório; um só CSS de conteúdo para os dois |
