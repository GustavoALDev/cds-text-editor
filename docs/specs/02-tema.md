# Spec 02 — Tema de 3 cores (`@cds/rte-theme`)

> Depende da spec 01. Referência: `referencias/plano-geral.md` seção 7 e `referencias/t6-tema/` (spike concluído, com `theme.css` e `theme-fallback.mjs` validados).

## 1. Objetivo

Um pacote **sem Angular e sem build de tema** em que o usuário informa até 3 cores (`primary`, `secondary`, `tertiary`) e todo o resto (hover, ativo, fundo suave, borda, texto legível, foco, neutros, claro/escuro) é **derivado em CSS**, com **contraste acessível garantido por construção**. Padrão: cores do Angular.

## 2. Fora de escopo

- Estilo de componentes do editor (spec 05) e do conteúdo publicado (spec 06); aqui só os **tokens**.
- Regressão visual de componentes (spec 08).

## 3. Decisões já tomadas

T1 3ª cor = `tertiary` · T2 neutros tingidos pela `primary` (opção `neutral: 'gray'`) · T3 modo padrão `auto` · T4 semânticas fixas (ajustáveis só no nível 3) · T5 pacote separado · T6 spike concluído.

Valores padrão: `primary` `#8514f5`, `secondary` `#f637e3`, `tertiary` `#0546ff`. **Confirmar contra o press kit do Angular** ao iniciar.

## 4. Conteúdo do pacote

| Arquivo / export | O que é |
|---|---|
| `theme.css` (export `./theme.css`) | Fórmulas finais (v4 do spike), `@property <color>` com valor inicial, camadas `@layer rte.theme`, modos `data-rte-mode` |
| `createRteTheme(options)` | Devolve o mapa de variáveis CSS pré-calculadas em JS (plano B e uso fora do Angular) |
| `checkRteTheme(options)` | Relatório de contraste das 10 verificações do spike |
| tipos `RteTheme`, `RteThemeMode` | `mode: 'auto' \| 'inherit' \| 'light' \| 'dark'`; `neutral: 'tinted' \| 'gray'` |

Ponto de partida: copiar `referencias/t6-tema/theme.css` e `theme-fallback.mjs`, portar o `.mjs` para TypeScript e **parse de qualquer cor CSS no navegador via `<canvas>`** (a versão do spike só lê `#hex`/`rgb()` em Node).

## 5. Requisitos

- **R1.** Contrato de variáveis públicas e estáveis: nível 1 `--rte-primary/secondary/tertiary`; nível 2 `--rte-radius`, `--rte-density`, `--rte-font-sans`, `--rte-font-mono`, `--rte-font-size`, `--rte-line-height`; nível 3 `--rte-surface`, `--rte-surface-raised`, `--rte-text`, `--rte-text-muted`, `--rte-border`, `--rte-focus`, `--rte-danger`, `--rte-warning`, `--rte-success`, `--rte-code-*`; derivadas `--rte-<cor>-hover/-active/-subtle/-border/-text`, `--rte-on-<cor>`; internas `--_*` nunca documentadas.
- **R2.** Contraste mínimo, para **qualquer** cor válida, em claro e escuro: texto sobre a cor ≥ 4,5 (normal, hover e active); `*-text` ≥ 4,5 sobre superfície, superfície elevada e fundo suave; foco ≥ 3; texto neutro ≥ 7; texto secundário ≥ 4,5.
- **R3.** Valor inválido (`banana`, vazio, `var(--inexistente)`, `12px`) **cai no padrão Angular** (`@property`).
- **R4.** Prioridade: padrão < `:root` < ancestral < instância (inline). Todo o CSS em `@layer rte.reset, rte.base, rte.theme, rte.components, rte.content`; **CSS do consumidor sem camada vence sem `!important`**.
- **R5.** Aceitar `#hex`, `rgb()`, `hsl()`, `oklch()`, `color(display-p3 …)`, nomes e `var()`.
- **R6.** Modos: `auto` segue o sistema e **ignora o toggle do site**; `inherit` segue o `color-scheme` do `<html>`; `light`/`dark` forçam. A documentação diz: *"se o seu site tem tema claro/escuro, use `inherit` e declare `color-scheme` no `<html>`"*.
- **R7.** **Plano B:** `@supports` sem cores relativas → aplicar o resultado de `createRteTheme` (hex pré-calculado). Resultado equivalente (ΔE ≈ 0 nos derivados lineares, ≤ 0,019 nos neutros, ≤ 0,041 em `*-border`).
- **R8.** `prefers-contrast: more` e `forced-colors` respeitados (bordas e foco reforçados; sem depender só de cor).
- **R9.** Aviso em desenvolvimento (função `warnIfPoorTheme`, chamada pelo Angular em `isDevMode`) quando a cor escolhida não permite contraste adequado, sugerindo alternativa.
- **R10.** Custo de trocar a cor ao vivo ≤ 0,5 ms (spike: ≈ 0,2 ms).
- **R11.** `sideEffects` declara só o CSS; o JS é tree-shakeable; tamanho do JS ≤ 3 kB min+gzip (ajustar após medir).
- **R12.** Presets exportados: Angular (padrão), Oceano, Floresta, Pôr do sol, Monocromático.

## 6. Testes

- Unitários de `createRteTheme`/`checkRteTheme` com sementes **extremas** (muito claras, muito escuras, saturadas, cinzas, acromáticas, amarelo claro).
- **Teste de propriedade** (`fast-check`): sementes aleatórias, claro e escuro, nenhuma falha das 10 verificações (o spike usou 223 + 148 cores; aqui, milhares).
- Navegador real (Playwright): reexecutar `harness.mjs`/`analyze.py` em **Chromium, Firefox e WebKit**; prioridade, camadas, valor inválido, modos, plano B × nativo (ΔE).
- **Aceitar o resultado de Firefox/WebKit como parte da spec:** se algum não suportar cores relativas com `calc()`, o plano B deve cobrir e o teste deve provar.
- CSP: variáveis aplicadas via `style.setProperty`/`CSSStyleDeclaration`, sem exigir `unsafe-inline` para atributos gerados por JS.

## 7. Critérios de aceite

- [ ] 0 falhas de contraste no teste de propriedade e na grade do spike, nos 3 navegadores (ou plano B provado equivalente onde o nativo não existe).
- [ ] Prioridade, camadas, valor inválido e modos verificados em navegador real.
- [ ] `createRteTheme` e `theme.css` produzem o mesmo resultado (ΔE dentro dos limites do R7).
- [ ] Pacote sem dependência de Angular; `attw`/`publint` verdes; orçamento de tamanho (R11) no CI.
- [ ] README do pacote com a escada de personalização (níveis 0 a 4) e a regra do `inherit`.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Firefox/WebKit sem suporte a `color(from … srgb-linear …)` com `calc()` | Plano B obrigatório e testado; documentar matriz de navegadores |
| Constantes calibradas (alvos de luminância `0.13`/`0.28`, `0.14`/`0.26`) | Reavaliar se os neutros mudarem; teste de propriedade pega regressão |
| WCAG 2.x × APCA | Fora do escopo; registrar como possível evolução |
