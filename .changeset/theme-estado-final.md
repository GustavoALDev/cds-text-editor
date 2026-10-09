---
'@cds/rte-theme': minor
---

Primeira versão do `@cds/rte-theme`: o tema do editor e da exibição a partir de poucas cores-semente, sem Angular. Entries: `.` e `@cds/rte-theme/theme.css`.

**Recursos.** `theme.css` deriva os tokens `--rte-*` com cores relativas nativas do CSS (OKLab). O "plano B" em TypeScript reproduz a mesma fórmula para navegadores sem cores relativas: `createRteTheme` (`RteCreateThemeOptions`, `RteThemeVariables`), `applyRteTheme` (`RteApplyThemeOptions`; grava por CSSOM, compatível com CSP), `checkRteTheme` (`RteCheckThemeOptions`, `RteThemeReport`, `RteThemeCheck`), `suggestRteColor` (`RteSuggestColorOptions`), `warnIfPoorTheme`, `supportsRelativeColors`, `parseColor` (com `RteColorParser` e `RteRgb`), os presets `RTE_THEME_PRESETS` (`RteThemePresetName`) e os tipos `RteTheme`, `RteThemeMode` (`auto`, `inherit`, `light`, `dark`) e `RteNeutral` (`tinted`, `gray`). Fórmulas e constantes de calibração andam juntas no CSS e no TypeScript (ADR 0002).

**Comportamento.** Toda cor relativa fixa o alfa em 1, no CSS nativo e no plano B, então uma semente translúcida não deixa os tokens derivados translúcidos; `parseColor` rejeita alfa negativo. No plano B, os overrides do consumidor (`.rte-root { --rte-surface: … }`) são respeitados e `*-subtle`/`*-border` saem da superfície do consumidor, como no nativo.

**Requisitos.** Sem dependências e sem peers. Não há constante de versão exportada.

**Segurança.** O tema só escreve propriedades `--rte-*` por CSSOM, sem `<style>` injetado nem `unsafe-inline`: funciona sob CSP estrita (`style-src` sem `'unsafe-inline'`).
