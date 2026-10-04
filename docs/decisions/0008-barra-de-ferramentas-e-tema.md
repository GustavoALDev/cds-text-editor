# ADR 0008: Barra de ferramentas, tema por instância e CSS de conteúdo

- Status: aceita (2026-10-04)
- Spec de origem: `docs/specs/05b1-barra-de-ferramentas-e-tema.md` (parte 2a de 5 da spec 05)

## Contexto

A 05a entregou o `rte-editor` sem interface. A 05b1 dá a ele a barra de ferramentas acessível (APG _toolbar_ e _menu button_, `popover` nativo, ícones SVG internos, estado por transação sem re-render, comandos sem diálogo, guarda de tabela > 100), o tema por instância compatível com a CSP, o `content.css` `rt-*` no `@cds/rte-core` e a correção do `blur` em `disabled`/`hidden`. Tudo foi provado em jsdom (zoneless e zone.js) e nos 3 motores do Playwright. O 0006 é do sanitizador; este é o 0008.

## Decisão

### (a) Decisões da spec (U1–U20)

| #   | Decisão                                                                                                                                                                    | Motivo                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| U1  | Foco itinerante e _menu button_ próprios (`RteRovingFocus`, `RteMenu`), sem `@angular/aria`.                                                                               | O `@angular/aria@22.2.1` exige `@angular/cdk` exato como peer e usa entry interno do Angular; os dois padrões são pequenos. |
| U2  | Barra dentro do host, primeiro filho de `.rte-editor__frame`, `role="toolbar"`; quebra linha em telas estreitas.                                                           | D11 da 05a (foco interno não emite `touch`); a quebra não esconde itens.                                                    |
| U3  | Um `tabindex="0"`, setas com volta circular (invertidas em `rtl`), `Home`/`End`, itens inaplicáveis focáveis com `aria-disabled`; `Alt+F10` e `focusToolbar()`.            | APG; `Alt+F10` é a convenção de CKEditor/TinyMCE.                                                                           |
| U4  | Comando sempre por `editor.chain().focus().<cmd>().run()`; `mousedown` com `preventDefault()`.                                                                             | Continuar digitando sem perder a seleção.                                                                                   |
| U5  | Um `computed` por transação calcula o estado de todos os itens; cada item lê um `Signal` próprio com igualdade por campos.                                                 | "0 re-render quando o estado não muda" por construção.                                                                      |
| U6  | Menus no padrão APG _menu button_ (`aria-haspopup`, `aria-expanded`, `aria-controls`, teclado completo, `Tab` com destino explícito).                                      | Não depender de como cada motor move o foco quando o elemento focado some.                                                  |
| U7  | `popover="auto"` nativo dentro do host; posição calculada em TypeScript e aplicada por CSSOM; margem de 8 px; vira para cima; reposiciona em `scroll`/`resize`.            | _Top layer_ escapa de `overflow`; descendente do host mantém D11; CSSOM é aceito pela CSP; `anchor()` não é uniforme.       |
| U8  | `toolbar: preset \| grupos \| false` na entrada e em `provideRichText`; id desconhecido/repetido avisa em dev; recurso desligado remove o item; vale ao vivo.              | A barra não depende das opções de criação (D20).                                                                            |
| U9  | Presets `minimal`, `article` (padrão) e `full`, congelados em `RTE_TOOLBAR_PRESETS`.                                                                                       | Casos comuns; a lib está antes da 1.0.                                                                                      |
| U10 | Sem `Editor`, `disabled` ou `readonly`: todos os botões `disabled` nativos, mesmo leiaute; `hidden` esconde tudo.                                                          | Sem salto de leiaute na hidratação; D10 da 05a.                                                                             |
| U11 | `aria-label`, `title` com atalho na notação da plataforma e `aria-keyshortcuts`; plataforma lida depois do primeiro render; `blockType` mostra o texto do bloco.           | Atalho de uma tabela só, conferida contra o _keymap_; sem diferença de hidratação.                                          |
| U12 | Ícones Lucide 1.52.0 (ISC) copiados como `d` de _path_ em `icons.ts`; cinco vêm do Feather (MIT); aviso em `tools/third-party-embedded.json`.                              | Sem `lucide-angular`; atributo SVG não é estilo (CSP).                                                                      |
| U13 | Menus de cor listam a paleta do esquema com amostra por classe e nome, mais "Cor padrão".                                                                                  | WCAG 1.4.1; sem atributo `style` no SSR.                                                                                    |
| U14 | Guarda de tabela por ensaio (`dispatch` que só captura) das operações que crescem; > 100 bloqueia com o motivo no `title`; ensaios só com o menu aberto.                   | Mede o resultado real do `prosemirror-tables`; limita o custo.                                                              |
| U15 | `theme` por instância e em `provideRichText`, mesclado por chave, aplicado por `applyRteTheme` num `afterRenderEffect`; `data-rte-mode` no host; `warnIfPoorTheme` em dev. | CSSOM é aceito pela CSP; o plano B não duplica fórmula; grafo `angular` → `theme`.                                          |
| U16 | `@cds/rte-core/styles/content.css`: camada `rte.content`, tudo sob `.rte-content`; `editor.css` fica só com o funcional. Ordem: `theme.css`, `content.css`, `editor.css`.  | O core é dono do contrato `rt-*`; o `rte-render` (spec 06) reaproveita.                                                     |
| U17 | Cores da paleta com `light-dark()` por variáveis `--rte-content-color`/`--rte-content-highlight`; `!important` só nessas duas declarações.                                 | O `style` do HTML canônico venceria qualquer regra sem `!important` e quebraria o contraste no escuro.                      |
| U18 | `blur()` de `disabled`/`hidden` passa para `afterRenderEffect`.                                                                                                            | Evita saídas e estado de formulário durante a detecção (`NG0100`).                                                          |
| U19 | A barra faz parte do `RteEditor`; orçamento de tamanho remedido.                                                                                                           | Uma API só (`toolbar: false` desliga).                                                                                      |
| U20 | Unitários em `test`/`test-zone`; navegador real nos 3 motores; "0 re-render" por `MutationObserver`.                                                                       | Regra principal do repositório.                                                                                             |

### (b) Rulings

**Pré-voo do plano**

1. **Empacotamento do `content.css`.** Fonte e arquivo publicado em `packages/core/styles/content.css` (sem cópia para `dist`), `exports["./styles/content.css"]`, `files` com `styles`, `sideEffects: ["**/*.css"]`; o `check-pack` aceita `styles/*.css` também em pacotes tsup.
2. **"Só o funcional" no `editor.css`.** A aparência (bordas de célula, fundo do `pre`, lista de tarefas sem marcador, figura) vai ao `content.css`; as regras de edição que colidiriam passam a `.rte-editor .rte-content …`. Regra de teste: seletor com `.rt-*`, `table`, `td`, `th` ou `pre` só declara propriedades funcionais. `hljs-*` fica no `editor.css`.
3. **Cobertura de classes.** "Toda classe `rt-*`" = `classes.values` de `getHtmlSchema` com todos os recursos e os provedores de embed embutidos; padrões abertos ficam fora.
4. **Página estática `content-static`.** `serve.mjs` monta a página em memória (com a mesma CSP), em vez de uma rota Angular com `[innerHTML]` (que passaria pelo sanitizador do Angular). Os atributos `style` do fixture ficam bloqueados: é o cenário da R12.
5. **Exclusões da R12.** O `style` bloqueado cobre também `aspect-ratio` dos _embeds_; as tarefas comparam só o `li.rt-task`. Consequência para a spec 06.
6. **`Shift+Tab` do editável para na barra.** O N6 da 05a foi ajustado; o N2 continua valendo porque os botões ficam `disabled` nativos.
7. **Recursos antes da criação.** O _gating_ lê `getHtmlSchema` sobre a configuração mesclada (ao vivo antes da criação, fixada depois); opção inválida cai em `getHtmlSchema({})`.
8. **Espiões de ESM.** Não se espia `applyRteTheme`; o teste confere o efeito real no DOM (plano B no jsdom) e `console.warn` para `warnIfPoorTheme`.
9. **`ngDevMode` × `isDevMode()`.** `ngDevMode` só no `warnIfPoorTheme`; os avisos da barra seguem `isDevMode()`.
10. **`data-rte-mode` em dois lugares** (ligação de host e `applyRteTheme`), com o mesmo valor.
11. **Direção.** `rtl` = `closest('[dir]')` com `dir="rtl"`; direção só por CSS, sem `dir`, não é detectada.
12. **Alinhamento sem atributo:** nenhum `menuitemradio` marcado e ícone `alignLeft`.
13. **Guarda no Angular** (`src/toolbar/table-guard.ts`), com propriedade comparando com o comando do Tiptap numa segunda instância; spans > 100 pré-existentes também bloqueiam.
14. **Ícones:** Lucide fixado, baixado com `npm pack` em diretório temporário; elementos não-`path` convertidos em `d`.
15. **Avisos de terceiros:** `generate-notices` ganha a seção "Código incorporado" a partir de `tools/third-party-embedded.json`.
16. **Cache do app de teste:** `content.css` entra nos `inputs` do build; `styles` na ordem `theme.css`, `content.css`, `editor.css`.
17. **N15 × N8:** custo por tecla medido na mesma rodada também com `toolbar: false`.

**Desta execução**

18. Execução em `feat/spec-05b` no checkout principal, sem worktree. Implementadores Opus nas tarefas 4–9 e Sonnet nas demais; a revisão das Tarefas 8–9 correu em paralelo com a 10.
19. **Ctrl+Shift+B do blockquote.** O `Bold` do Tiptap também liga `Mod-B`, que no _keymap_ equivale a `Mod-Shift-b`: o atalho alterna negrito. Correção no core na onda final (remover o `Mod-B` maiúsculo do Bold), com teste; até lá o atalho fica fora da tabela.
20. **`rtTaskList` sem `Mod-Shift-9`.** Registrar na onda final e devolver à tabela de atalhos.
21. **`setCallout` não se desfaz.** Usa `ReplaceAroundStep(structure: true)` com título com texto; o passo inverso falha e o `undo()` consome a entrada do histórico sem remover a caixa. Marcado com `it.fails`; correção na onda final.
22. **Indentar/recuar em lista de tarefas.** `can().sinkListItem('rtTaskItem')` diz sim e lança `TransformError` (`rtTaskItem` é `inline*`); a barra ensaia em `try/catch` e desabilita. Pendência do core.
23. **Foco itinerante.** `openAtPointerDown` vale só para clique de ponteiro (`event.detail > 0`) e é zerado em todo `click`/`pointercancel`; `disabled` do item é um _signal_ (todos nascem `disabled` pela U10, senão a barra ficava sem parada de `Tab`).
24. **Teste de alternar o editor 100×** sobe de 30 s para 90 s (com a barra, ~85 ms por ciclo no jsdom) em vez de `toolbar: false`: mantém a cobertura de vazamento.
25. **Aviso `[rte-theme]` só para valores inválidos** (`'banana'`, terciária `'12px'`). O exemplo `#ffff00` do plano estava errado: a derivação do tema garante contraste para qualquer semente, então não avisa.
26. **Blur em `readonly`,** só quando o foco está dentro da `.rte-toolbar`, e fecha os menus (a área editável mantém o foco).
27. **Forced-colors.** Marcado/pressionado passa a usar `Canvas` sobre `CanvasText` com borda `Highlight` (o axe acusava 3,77:1 e 2,94:1 no Firefox e no WebKit). Mudança visual aceita.
28. **Achados do navegador nas Tarefas 8–9, corrigidos com teste unitário:** (1) o `focusout` do Chromium ao remover o item focado emitia `editorBlur`/`touch` (decisões passam à fase _read_ de `afterNextRender`); (2) clique/Enter antes da renderização usava estado velho (`run`/`choose` leem o estado atual); (3) `Tab` logo após uma seta usava `tabindex` velho (atualiza no `keydown`); (4) salto de leiaute do `blockType` de ~654 px em pt-BR/es (o botão empilhava todos os rótulos invisíveis); (5) contraste em forced-colors (ruling 27).
29. **Clicar fora de um menu aberto** conta como saída (touch) e o foco volta ao gatilho.
30. **`[(value)]` revertido antes da detecção** nunca chega ao editor (comportamento do `model()` do Angular); anotado no README.
31. **Core:** a regra do `check-pack` para `styles/*.css` vale para todos os pacotes tsup (exceção ampla; deferido).

### (c) Mudanças na spec

- **§7:** critérios marcados com a evidência; o do CI do PR fica aberto.
- **Linha do tema na `05-editor-angular.md`:** deixa de ser "peer só de CSS" (agora é importado).
- **Atalhos:** `blockquote` e `taskList` ficam fora da tabela até a correção do core (rulings 19 e 20).
- **Plano:** exemplo `#ffff00` corrigido (ruling 25).

### (d) Números (2026-10-04)

Tamanho (`min+gzip`, Angular, Tiptap, `@cds/*`, `lowlight` e `highlight.js` externos; orçamento = `ceil(medido × 1,15 / 64) × 64`):

| Cenário      | Antes (05a) | Agora (B) | Orçamento antes | Orçamento agora |
| ------------ | ----------- | --------- | --------------- | --------------- |
| `editor`     | 5230        | 17376     | 6016            | 20032           |
| `whole`      | 5242        | 17417     | 6016            | 20032           |
| `i18n`       | 387         | 1544      | 448             | 1792            |
| `validators` | 1156        | 1156      | 1344            | 1344 (igual)    |

O acréscimo vem da barra, dos ícones, do modelo de itens e dos rótulos da seção `toolbar` nos três idiomas. O custo do `applyRteTheme` é o cenário `apply` do tema: 9810 B min, 4400 B gzip (orçamento 5120); no cenário do Angular o `@cds/*` é externo e não entra na conta. Core e tema dentro do orçamento (`whole` do core 8391 B, `extensions` 34716 B).

`content.css`: 9266 B brutos, 2481 B gzip. `editor.css`: 17287 B brutos, 4197 B gzip (inclui barra e menus).

App de teste (`angular-e2e-app:build`, informativo): _bundle_ inicial 892,92 kB brutos / 238,39 kB transferidos (não comparável ao da 05a: `e2e-bridge.ts` importa Tiptap, `@cds/rte-core/extensions` e `applyRteTheme` no _bundle_ principal); _chunk_ lazy da rota `toolbar` 4,27 kB / 1,20 kB.

N15 (mediana por tecla em ms, documento de 20 mil palavras, `toolbar: false` / `full` / `full` + render; 0 mutações na barra em 50 teclas):

| Motor    | `false` | `full` | `full` + render |
| -------- | ------- | ------ | --------------- |
| Chromium | 11,7    | 11,0   | 13,1            |
| Firefox  | 11      | 11     | 14              |
| WebKit   | 16      | 16     | 23              |

Comparação com o N8 da 05a (mediana de 10–17 ms, ADR 0007 (d)): a barra `full` não muda o custo por tecla de forma mensurável, e o ruído entre rodadas é do tamanho da diferença. **Achado para a 05d:** o custo por tecla salta de ~8 para ~44 ms depois de ~200 transações no documento de 20 mil palavras (Chromium e WebKit, com ou sem barra); isso entra nos orçamentos de desempenho da 05d.

### (e) Verificação em navegador real

N9–N15 em `e2e/angular/editor-toolbar-*.spec.ts`, `editor-theme.spec.ts` e `editor-content-css.spec.ts`, nos 3 motores (teclado, menus, comandos, tema, CSS de conteúdo, acessibilidade com axe em claro, escuro e `forced-colors`, desempenho). N1–N8 da 05a continuam verdes. Achados reais do navegador: ruling 28 e o bug do float das figuras (a figura cheia seguinte pintava por cima e interceptava cliques; `clear: both` nas figuras centro/cheia/vídeo). No Windows, o Firefox com 4 _workers_ às vezes trava; com 2 fica estável (registrado em `e2e/README.md` e no `CLAUDE.md`). Execução completa local (`npx playwright test -c e2e --workers=4`, 3 motores): 733 passaram, 25 ignorados (embeds externos) e 1 falha em WebKit (E4 da 04, "Tab alcança o checkbox e Space o alterna"), intermitente sob carga e verde em 30/30 execuções isoladas; o Firefox não travou com 4 _workers_ nesta rodada. Critérios e pendências na spec (§7).

## Pendências conhecidas

- **Core (onda final):** rulings 19–22; filtro de violações do N13 sem restringir diretiva e `style-src-attr` filtrado em todos os motores; `border-left` físico com `padding-inline-start` em blockquote/pullquote (RTL); regra de _embed_ redundante; propriedade da guarda leva 45–55 s em 100 execuções (timeout 120 s), risco em CI sob carga.
- **Configuração e rótulos:** `String(id)` lança `TypeError` para id objeto sem protótipo (`config.ts`); grupo não-array descartado sem aviso; `colorNames` fora da paleta ignorados em silêncio; entradas de `third-party-embedded.json` sem validação; cabeçalho de `icons.ts` sem `minus` na lista do Feather.
- **Estado e guarda:** `editor.can()` refeito por item a cada transação e `can(insertTable)` monta uma tabela 3 × 3 (só se o N15 acusar custo); helpers `can` duplicados; `opts.features` substitui em vez de mesclar nos ajudantes de teste.
- **Foco e menus:** vínculo gatilho → menu por campo público mutável; tipo `'backward'` de `tabOut` nunca emitido; "cor padrão" marcada em seleção mista (WCAG 4.1.2, baixo dano); `catch {}` engole erro do `getHtmlSchema`; regex `HOST_STYLE` não pega `[style.width.px]`; SVG repetido 5× no template.
- **Tema:** `closeMenus()` a cada execução do efeito mesmo sem menu aberto; `warnedThemes` por instância.
- **Chamadas diretas de tabela** fora da guarda continuam como no ADR 0004 (saem com 1 no HTML).
- **Direção só por CSS,** sem atributo `dir`, não é detectada.
- **Plano B do tema sob demanda** é opção futura para quem não usa tema por instância (o `apply` pesa ~4,4 kB gzip).
- **`Alt+F10`** pode ser capturado por alguma plataforma; `focusToolbar()` e `Shift+Tab` do editável cobrem.
- **Spec 08:** regressão visual editor × página por captura de tela.

## Consequências

- **Spec 05b2:** reaproveita `RteRovingFocus`, `RteMenu`, `positionMenu`, `createToolbarState` e `readTableMenuState` nos menus flutuantes (a mesma guarda de tabela); acrescenta `link`/`lang` à barra e aos presets; diálogos em `<dialog>` dentro do host.
- **Spec 05c:** os itens de mídia entram no modelo de itens e nos presets.
- **Spec 05d:** usa o N15 e o salto de ~8 para ~44 ms por tecla depois de ~200 transações nos orçamentos de desempenho e em `updateOn`; libera busca e `/`.
- **Spec 06:** o `rte-render` usa `@cds/rte-core/styles/content.css` (o contêiner precisa de `.rte-root > .rte-content`); com CSP sem `'unsafe-inline'` em `style-src-attr`, o `text-align`, as larguras de coluna e o `aspect-ratio` dos _embeds_ (atributo `style`) não se aplicam: a spec 06 decide (CSSOM, aceitar ou documentar); as cores da paleta não dependem disso (U17).
- O orçamento do `@cds/rte-angular` agora é `editor` 20032 B, `whole` 20032 B, `i18n` 1792 B e `validators` 1344 B.
