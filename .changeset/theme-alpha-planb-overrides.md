---
'@cds/rte-theme': patch
---

Corrige dois bugs do tema: (1) no CSS nativo, uma semente translúcida deixava os tokens derivados translúcidos; agora toda cor relativa fixa o alfa em 1, como o plano B, e `parseColor` rejeita alfa negativo; (2) no plano B, `applyRteTheme` gravava inline todos os tokens e anulava os overrides do nível 3 do consumidor (`.rte-root { --rte-surface: … }`); agora esses overrides são respeitados e `*-subtle`/`*-border` saem da superfície do consumidor, como no nativo.
