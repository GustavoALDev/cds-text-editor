# Notas para o ADR 0016 (frente B: desempenho, 05d2)

Números preliminares, Chromium, `--workers=1`, máquina com carga leve (vídeo). Orçamentos não ajustados por eles.

## T3 / N45

| Medida | Mediana (ms) | p95 (ms) | Orçamento |
|---|---|---|---|
| Linha de base N8 (sem `?full`), frio | 10,8 a 13,0 | 15,8 a 25,8 | n/a |
| Completo frio, com render | 15,2 a 16,1 | 20,1 a 25,0 | 50 |
| Completo frio, sem render | 12,2 a 14,1 | 19,5 a 22,1 | n/a |
| Completo quente (teclas 251–300), com render | 45,7 a 49,9 | 61,8 a 65,4 | 50 |
| Completo quente, sem render | 37,4 a 38,2 | 46,3 a 47,0 | n/a |
| Busca capada (1000+) | 14,4 a 16,2 | 20,8 a 22,3 | 50 |
| Criação completa (8 amostras) | 90 a 102 | 100 a 143 | 300 |
| Criação vazia, minimal (20) | 9,3 a 9,5 | 12,6 a 13,6 | 50 |
| INP (teclado real, 50 ms entre teclas) | 56 a 96 | n/a | 200 |
| Gravação do rascunho | 0,9 / 2,5 / 1,6 | n/a | 16 |

## Degrau depois de ~150–200 transações (ADR 0008)

- Por fase, tudo sobe junto (~3,5x): `dispatch` 3,6 -> 12 ms, leitura de `valid` 7,7 -> 27 ms, `tick` 2,8 -> 10 ms. Cenário completo: degrau perto da transação 150; linha de base: perto da 200.
- Não é GC: `HeapProfiler.collectGarbage` a cada 50 teclas não remove o degrau; heap 30–130 MB.
- Experimento do laço de CPU: um laço sem relação com o editor (2 milhões de iterações, intercalado com as teclas) passou de 2,0 para 7,5 ms (~3,7x) no mesmo ponto. Conclusão: degrau do ambiente (CPU/processo do navegador sob carga sustentada), não do pacote.
- Decisão do autor: T3b (`valueEmission: 'idle'`) NÃO acionada; orçamento de 50 ms mantido; re-medir com a máquina ociosa e ler no CI Linux (guarda de 2x).

## T4 / Z9: criação e destruição

Mediana por ciclo (criar + estabilizar), jsdom, barra `minimal` (30 ciclos) e `full` (20 ciclos); sondas temporárias, não commitadas. Primeiro ciclo de `minimal`: ~500 a 1060 ms (módulos, JIT e chunks).

| Fase (jsdom, minimal) | ms |
|---|---|
| `show.set(true)` até o construtor do `RteEditor` | 8 |
| construtor até `afterNextRender` (renderização do template, barra, efeitos) | 28 (`full`: 115) |
| `createEditorExtensions` (+ leitura de entradas) | ~3 |
| `new Editor` até `editorReady` | ~23 (extensões do Tiptap 7, comandos 1, `EditorView` 10) |
| depois do `editorReady` até estabilizar (`@defer` dos menus flutuantes etc.) | ~50 (menus ligados) |
| ciclo de criação total | 109 a 143 (com `[floatingMenus]="false"`: 60) |
| destruição | 0,4 |

- O custo evitável aparente é a renderização eager dos 6 menus flutuantes (~50 ms no jsdom). No Chromium, `editorReady` e o aparecimento de `.rte-floating` ficam no mesmo instante (mediana 17,8 ms, barra `full`, editor quase vazio): o custo é do DOM do jsdom, não de produção. Não foi alterado (refatorar o template dos menus para renderização preguiçosa por tipo arriscaria N21–N24 por ganho só em teste).
- Criação do editor vazio com `minimal` no Chromium: mediana 9,3 a 9,6 ms (orçamento provisório 50 ms; não ajustado, conforme combinado).
- Sem ouvinte de `document`/`window` nem temporizador sobrevivendo à destruição (teste novo `editor.listeners.spec.ts`: 10 ciclos com barra `full`, `draftKey` e contadores).
- Destruição: sem `setTimeout` pendente do editor (atrasos > 1 ms).

## T4 / Z10 e N46

- `editor.lifecycle.spec.ts` sem o `90_000`, com a guarda de crescimento (mediana dos 10 últimos ciclos <= 3x a dos 10 primeiros). 100 ciclos (`minimal`) e 20 (`full`) cabem em 30 s: o arquivo inteiro leva ~17 s de testes isolado; `run-many -t test,test-zone -p angular` (1791 testes) verde nos dois modos, exceto `index.spec.ts` (exports de `/validators`, mudança da frente A em andamento).
- N46 (Chromium, `lifecycle?full`, 100 alternâncias depois de 10): heap depois de GC 7,5 -> 8,6 -> 9,0 MB (aquecimento, 50, 100; delta 50->100 = 0,40 MB, limite 1 MB); `JSEventListeners` 316 -> 316 -> 316; DOM estável igual depois do aquecimento; `Editor` vivo 1 com o editor à mostra e 0 escondido (após GC por CDP).
- DOM da primeira criação difere do estável (14 popovers/563 nós contra 13/533): a referência do N46 é o estado depois do aquecimento.
- Achado externo: na página `perf` (com `[formField]`), o último `Editor` destruído continua vivo até o próximo `FormField` ser criado: caminho de retenção no heap = sinal de módulo -> `computed` do `FieldNode` (`parseErrors`/`validationState`) -> `FormField.destroyRef._lView`. É comportamento do Signal Forms (constante, não cresce: 1 vivo após 100 ciclos), não do pacote; por isso o N46 usa a página `lifecycle` sem formulário.
