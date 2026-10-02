# Spike T6 — Tema de 3 cores em CSS puro

> **Pergunta (do plano, seção 7):** dá para derivar um tema completo (hover, estados, fundos suaves, texto legível, foco, claro/escuro) de **apenas 3 cores**, só com CSS, sem Sass e sem build, mantendo o **contraste acessível** para qualquer cor que o usuário escolha? E existe um **plano B** para navegadores sem esses recursos?
>
> **Resposta curta:** **sim.** A versão final das fórmulas (`theme.css`) passou em **todas as verificações de contraste para 223 cores sRGB e 148 cores fora do sRGB, em claro e escuro** (0 falhas), e o plano B em JavaScript (`theme-fallback.mjs`) reproduz o resultado nativo e passa nas mesmas verificações.

Data: 2026-10-02 · Navegador: **Chromium 153** (headless) · **Firefox e WebKit não foram testados** (indisponíveis neste ambiente).

## 1. Como foi medido

1. As fórmulas de `theme.css` rodam num Chromium real (Playwright). Para cada cor-semente e cada modo (`color-scheme: light|dark`), o script lê a **cor realmente exibida** de cada token (via `<canvas>`, que converte para sRGB de 8 bits como o navegador pintaria).
2. Sobre essas cores calcula-se a **razão de contraste WCAG 2.x** em 10 verificações (tabela abaixo).
3. **Sementes:** cores de marca conhecidas (padrão Angular, Stripe, Spotify, Twitter…), extremos (branco, preto, cinzas no limiar de 4,5:1, amarelos, ciano, verde/vermelho/azul puros) e uma **grade HSL** (12 matizes × 3 saturações × 8 luminosidades) = **223 cores sRGB**. Separadamente, **148 cores fora do sRGB** (`oklch` com croma até 0,37 e `display-p3`).
4. O plano B (JavaScript) é comparado **token a token** com o resultado nativo (ΔE em OKLab) e submetido às mesmas verificações.

Reproduzir: `CHROME=/caminho/chrome-headless-shell ./run.sh` (ver o topo do script se faltarem bibliotecas do sistema).

## 2. Resultados

### 2.1 Contraste (pior caso medido em cada verificação)

| Verificação | Meta | sRGB (446 casos) | Fora do sRGB (296) |
|---|---|---|---|
| C1 texto sobre a cor (`on-*` sobre `primary`) | ≥ 4,5 | **4,61** | 4,61 |
| C2a texto sobre a cor em **hover** | ≥ 4,5 | 5,17 | 5,19 |
| C2b texto sobre a cor em **active** | ≥ 4,5 | 5,74 | 5,80 |
| C3a `primary-text` (link/texto colorido) sobre a superfície | ≥ 4,5 | 5,54 | 5,53 |
| C3b `primary-text` sobre superfície elevada | ≥ 4,5 | 5,26 | 5,26 |
| C4 anel de **foco** sobre a superfície | ≥ 3 | 5,54 | 5,53 |
| C5a texto neutro sobre a superfície | ≥ 7 | 16,42 | 16,43 |
| C5b texto secundário sobre a superfície | ≥ 4,5 | 7,01 | 7,02 |
| C6a texto neutro sobre o fundo suave da cor | ≥ 4,5 | 11,51 | 12,74 |
| C6b `primary-text` sobre o fundo suave da cor | ≥ 4,5 | 4,74 | 4,54 |

**Falhas: 0 em todas as linhas.** O 4,61 de C1 é o limite teórico: para cores de luminância intermediária nenhuma escolha entre preto e branco passa de ≈ 4,58.

### 2.2 O que **não** funcionou (e por quê) — evolução das fórmulas

| Versão | Ideia | Resultado |
|---|---|---|
| v1 | `on-*` por **limiar de luminosidade OKLCH** (`l < 0.6`), hover/active misturando com preto/branco, `*-text` limitando `l` | **Falhou:** C1 12 falhas (pior 4,19), C2a 32, **C2b 82 (pior 2,60)**, C6b 1. Um limiar único em OKLCH **ignora croma e matiz**: nem o melhor limiar (0,58) evita que 24 de 1873 cores sRGB fiquem abaixo de 4,5 |
| v2 | **Luminância real em `calc()`**: dentro de `color(from … srgb-linear …)` os canais são lineares, então `Y = 0.2126r + 0.7152g + 0.0722b`. `on-*` = branco se `Y ≤ 0.1791` (limiar WCAG exato); hover/active **afastam** a cor do texto (escurece sementes escuras, clareia as claras): o contraste só **aumenta**; `*-text` por **escala linear** (claro) e **mistura linear com branco** (escuro) até uma luminância-alvo | **0 falhas** em cores sRGB |
| v3 | Interruptor de neutros (`--rte-neutral-tint`) | Neutros tingidos ⇄ cinza funcionando |
| v4 (final) | `clamp(0, canal, 1)` em cada canal antes das contas | **Corrige cores fora do sRGB** (de 10 falhas em C1, pior 3,81, para 0) sem regredir as sRGB |

### 2.3 Plano B em JavaScript × nativo

`theme-fallback.mjs` replica as mesmas contas (srgb-linear e mistura em OKLCH).

| Token | ΔE médio | ΔE máximo | Observação |
|---|---|---|---|
| `on-*`, `hover`, `active`, `seed` | 0,0000 | 0,0000 | Idênticos (mesma aritmética linear) |
| `*-text`, `focus` | 0,0001 | 0,0032 | Imperceptível |
| `surface`, `surface-raised`, `text`, `text-muted`, `border`, `*-subtle` | ≈ 0,002–0,003 | ≤ 0,019 | Dentro do limiar de diferença perceptível (~0,02) |
| `*-border` | 0,0075 | **0,041** | Maior desvio: matiz saturado (`#0000ff`) misturado a um neutro quase acromático; só afeta bordas finas |

O plano B passa nas **mesmas 10 verificações de contraste** (0 falhas, mesmos piores casos).

### 2.4 Comportamentos verificados (Chromium 153)

| Comportamento | Resultado |
|---|---|
| **Valor inválido** (`banana`, vazio, `var(--inexistente)`, `12px`) | Cai no **padrão Angular** `#8514f5`, graças a `@property` com `syntax: '<color>'` (a interface nunca "quebra") |
| Formatos aceitos | `#hex` (3 e 6), `rgb()`, `hsl()`, `oklch()`, `color(display-p3 …)`, nomes (`lightseagreen`, `rebeccapurple`) |
| **Prioridade** | padrão < `:root` < ancestral < instância (inline), como projetado |
| **Camadas** | CSS do consumidor **sem `@layer`** vence o da lib **sem `!important`** (`rgb(1,2,3)` sobrescreveu o `hover` derivado) |
| Neutros tingidos × cinza | Superfície `#faf9fe` (tingida) × `#fafafa` (com `--rte-neutral-tint: 0`); **semente cinza não tinge** os neutros |
| Modo claro/escuro | Mesmos tokens, superfície `#faf9fe` (claro) e `#121116` (escuro) via `light-dark()` |
| **Custo** de trocar a cor ao vivo | **≈ 0,19–0,25 ms** por troca (300 trocas com recálculo forçado de estilo) |
| Suporte (neste Chromium) | cores relativas, `color(from … srgb-linear …)` com `calc`, `color-mix`, `light-dark`, `@property`, `contrast-color()` |

### 2.5 Modos: achado importante

| Modo | Segue | Observação medida |
|---|---|---|
| `auto` (`color-scheme: light dark`) | **Sistema operacional** | Com sistema claro e o site **forçando** escuro por conta própria, o editor ficou **claro** (251) — ele **ignora o toggle do site** |
| `inherit` (`color-scheme: inherit`) | **`color-scheme` do site** | Acompanha o toggle do site; sem toggle e sem `color-scheme` no site fica **claro** mesmo com o sistema escuro |
| `light` / `dark` | Forçado | Sempre igual, independente de sistema e site |

## 3. Conclusões e mudanças no plano

1. **O motor de tema em CSS puro é viável** e cumpre a promessa de "3 cores e o resto é automático", com contraste **garantido por construção** (não só aviso).
2. **A técnica decisiva é calcular a luminância em `srgb-linear` dentro do CSS.** O limiar em OKLCH previsto no plano **não basta** e foi substituído (seção 7.5 do plano atualizada).
3. **`@property <color>` com valor inicial** dá "valor inválido → padrão" e é o que permite a **prioridade herdada** (ancestral → instância) sem JavaScript.
4. **Modo:** `auto` é o padrão (decisão T3), mas deve ser documentado que **apps com toggle próprio** devem usar `mode: 'inherit'` e declarar `color-scheme` no `<html>`. Recomendação de documentação: *"se o seu site tem tema claro/escuro, use `inherit`"*.
5. **Plano B (JS)** é equivalente: pode ser carregado só quando `CSS.supports` falhar; para o parse de qualquer cor CSS no navegador, usar um `<canvas>` (a versão do spike só lê `#hex`/`rgb()` em Node).
6. **Metas de contraste do tema** passam a ser: texto sobre a cor ≥ 4,5:1 (todos os estados), `*-text` ≥ 4,5:1 sobre superfície e fundo suave, foco ≥ 3:1, texto neutro ≥ 7:1.

## 4. Limites do spike (o que **não** foi verificado)

- **Só Chromium 153.** Firefox e WebKit não puderam ser testados aqui; o suporte a cores relativas com `calc()` e a `light-dark()` nesses navegadores deve ser confirmado na Fase 6 (matriz Playwright) e é a razão de existir o plano B.
- **Contraste WCAG 2.x** (razão de luminância). O **APCA/WCAG 3** não foi avaliado.
- A grade de sementes é ampla, mas **não exaustiva** (223 + 148 cores). Uma varredura maior e um teste de propriedade (ex.: `fast-check`) entram na Fase 6.
- Foram medidos **tokens e contrastes**, não a **aparência** de componentes reais (isso é o teste visual da Fase 6).
- Fórmulas dependem de constantes calibradas (`0.13` alvo claro, `0.28` alvo escuro, `0.14`/`0.26` de hover/active); a calibração ficou boa para os neutros definidos aqui e **deve ser reavaliada** se os neutros mudarem.
- Em `primary-border` o plano B tem ΔE de até 0,041 (maior que os demais tokens).

## 5. Arquivos

| Arquivo | O que é |
|---|---|
| `theme.css` | **Fórmulas finais** (v4) + regras de modo; é o candidato a base do pacote de tema |
| `theme-fallback.mjs` | Plano B em JavaScript (`createRteTheme`) |
| `harness.mjs` / `analyze.py` | Mede os tokens no navegador e calcula os contrastes |
| `compare.mjs` | Plano B × nativo (ΔE) |
| `extra.mjs` | Inválido, formatos, prioridade, camadas, neutros, custo e suporte |
| `modes.mjs` | `auto` × `inherit` × forçado com `prefers-color-scheme` emulado |
| `make-seeds.py` | Gera as sementes (sRGB ou `wide`) |
| `run.sh` | Roda tudo |
