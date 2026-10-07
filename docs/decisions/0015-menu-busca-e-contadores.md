# ADR 0015: Menu `/`, busca e substituição, contadores e validadores de conteúdo

- Status: aceita (2026-10-07)
- Spec de origem: `docs/specs/05d1-menu-busca-e-contadores.md` (parte 8 de 9 da spec 05)

## Contexto

A 05d1 entrega a interface dos recursos do core que a 05a deixou desligados (D1): menu `/` com lista acessível, barra de busca e substituição, contadores e anúncios do limite, mais os validadores `rteSafeLinks` e `rteNoEmptyHeadings`. O core ganhou só `inspectRteHtml`. Verificada em jsdom (zoneless e zone.js) e no Chromium (rota `productivity`, N42–N44); os 3 motores ficam para o CI do PR.

## Decisão

### (a) Decisões da spec

K1–K15 valem como escritas na spec (fonte única; não são repetidas aqui). Resumo: divisão 05d1/05d2 (K1); fim do D1, `search` e `slashCommands` ligados por padrão (K2); atalhos, ARIA e contadores no principal, lista do `/` no _chunk_ `rte-slash-menu` e barra de busca no `rte-search` (K3); `textbox` com `aria-activedescendant`, sem `role="combobox"`, e região viva (K4); lista em `popover` posicionada por `coordsAtPos`, sem foco (K5); `onUiItem` abre os diálogos de mídia (K6); `Mod-F`, item `search` e `openSearch` (K7); barra de busca e teclas (K8); comandos em sequência e ciclo de vida (K9); anúncios da busca (K10); contadores (K11); anúncios do limite (K12); validadores sobre `inspectRteHtml` (K13); `newGroupDelay` de 500 ms mantido (K14); rótulos, CSS, testes e tamanho (K15).

### (b) Desvios da execução

- **ARIA do editável:** aplicada por `afterRenderEffect` direto no DOM. Um efeito/_binding_ lendo a versão da ponte dava `NG0101` no zone.js.
- **Lista do `/`:** alinhada ao `/` (âncora de largura zero) e limitada só pela janela e pelos ancestrais que cortam, não pela caixa do editável (bug achado no E2E, commit `7e8ecc6`).
- **Ordem dos `@defer`:** a barra de busca é o bloco 0 e a lista do `/` o último.
- **Chunk compartilhado:** `viewport-watch` (acompanha rolagem e redimensionamento), medido pelo cenário `overlay-shared`.
- **Teclas:** `Escape` no editável não fecha a barra (só dentro dela); `F3` só vale com a barra aberta.
- **Limiares:** `remaining` estrito (`<`); o estado visual `--near` é ≤ 10% do limite, enquanto o anúncio é `< max(10, 10%)`.
- **`inspectRteHtml` com `truncated`** (revisão final): HTML com mais de 256 níveis faz os validadores falharem em vez de passarem em silêncio.
- **axe:** `scrollable-region-focusable` desligado só na lista do `/`. É falso positivo do desenho K4: a lista nunca recebe foco; `tabindex="-1"` não resolve e `0` criaria uma parada de `Tab` que fecha o menu.
- **Glifos dos botões da busca (↑ ↓ Aa ab ×):** ficam em `<span aria-hidden>` e o nome acessível vem dos rótulos (WCAG 2.5.3: tratados como símbolos, não como texto visível).
- **Falha de carga da busca:** o primeiro `Mod-F` é engolido (o navegador não busca) quando o _chunk_ falha; desvio aceito do R1.
- **A validar com leitores de tela reais na spec 08:** a região viva do `/` e o `aria-activedescendant` em `contenteditable` (K4).

### (c) Números (2026-10-07)

`min+gzip` medidos após a revisão final (`nx run angular:size`); orçamento = `ceil(medido × 1,15 / 64) × 64`, exceto `slash-menu` e `search`, que cresceram com as correções da revisão e mantêm a folga atual (147 e 207 bytes).

| Cenário              | Medido | Orçamento |
| -------------------- | ------ | --------- |
| `slash-menu` (chunk) | 1901   | 2048      |
| `search` (chunk)     | 2737   | 2944      |
| `overlay-shared`     | 1363   | 1600      |
| `i18n`               | 5300   | 6144      |
| `validators`         | 2438   | 2816      |

Os demais cenários estão em `packages/angular/size-budget.json`; a 05d2 refaz os orçamentos finais.

### (d) Evolução

Leitores de tela reais (spec 08); `updateOn`/adiamento e `api-extractor` (05d2); busca por expressão regular e dentro da seleção.

## Consequências

- **Mudança de padrão (K2):** `search` e `slashCommands` passam a valer por padrão; o `Mod-F` do navegador vai ao editor com o foco no _host_. Desligar com `features`. _Changeset_ `minor` com nota.
- **05d2:** mede a digitação com busca ativa em documento grande e fecha a API.
- **Spec 08:** leitores de tela no `/` e na busca; teclado virtual.
