# @cds/rte-theme

Tema de 3 cores para o editor de texto rico `cds-text-editor`: você informa até três cores (`primary`, `secondary`, `tertiary`) e todo o resto (hover, ativo, fundo suave, borda, texto legível, foco, neutros, claro e escuro) é **derivado em CSS**, com contraste acessível por construção. Sem build de tema e sem Sass.

O pacote **não depende de Angular** (nem exige Angular 22+): é CSS puro mais helpers de JavaScript opcionais. A integração com Angular (`provideRichText`, `<rte-editor [theme]>`) pertence à spec 05, que consumirá este pacote; ela ainda não existe.

**Status: em construção.** Ainda sem versão publicada. O nome `@cds/rte-theme` é provisório (escopo `@cds` ainda não confirmado no npm).

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

```bash
npm i @cds/rte-theme
```

## Uso mínimo

```ts
import '@cds/rte-theme/theme.css'; // entrada `exports["./theme.css"]` do pacote
```

```html
<div class="rte-root">…</div>
```

```css
/* Opcional: suas cores (qualquer cor CSS). Sem isto, valem as cores do Angular. */
:root {
  --rte-primary: #0ea5e9;
  --rte-secondary: #db2777;
  --rte-tertiary: #4f46e5;
}
```

Os helpers de JavaScript (`createRteTheme`, `applyRteTheme`, `checkRteTheme`, ...) são exports nomeados do pacote (`import { applyRteTheme } from '@cds/rte-theme'`) e não são necessários para o caminho em CSS puro.

## Escada de personalização (níveis 0 a 4)

| Nível | O que você faz      | Variáveis / mecanismo                                                                                                                                                                           | Exemplo                                                     |
| ----- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 0     | Nada                | Paleta do Angular (`#8514f5`, `#f637e3`, `#0546ff`); modo `auto` (claro/escuro do sistema)                                                                                                      | `<div class="rte-root">`                                    |
| 1     | As três sementes    | `--rte-primary`, `--rte-secondary`, `--rte-tertiary` (qualquer cor CSS)                                                                                                                         | `:root { --rte-primary: oklch(0.6 0.2 250); }`              |
| 2     | Forma e tipografia  | `--rte-radius`, `--rte-density`, `--rte-font-sans`, `--rte-font-mono`, `--rte-font-size`, `--rte-line-height`                                                                                   | `.rte-root { --rte-radius: 2px; --rte-font-size: 0.9rem; }` |
| 3     | Tokens finos        | `--rte-surface`, `--rte-surface-raised`, `--rte-text`, `--rte-text-muted`, `--rte-border`, `--rte-focus`, `--rte-focus-width`, `--rte-danger`, `--rte-warning`, `--rte-success`, `--rte-code-*` | `.rte-root { --rte-danger: #c62828; }`                      |
| 4     | CSS dos componentes | Classes estáveis `rte-*` (BEM), estilizáveis dentro de `@layer`                                                                                                                                 | chegam com os componentes (spec 05)                         |

Detalhes por nível:

- **Nível 1.** Um valor inválido (`banana`, vazio, `var(--inexistente)`, `12px`) **cai no padrão do Angular**, só quando não há valor válido acima na cascata: um valor inválido na instância é descartado e vale o do ancestral ou do `:root`; só depois o padrão. As sementes seguem a cascata normal: podem ser definidas em `:root`, num ancestral ou na própria instância.
- **Nível 2.** Também seguem a cascata normal (`:root`, ancestral, instância). `--rte-density` é um número (1 = padrão), `--rte-radius` e `--rte-font-size` são comprimentos, `--rte-line-height` é um número, as fontes são listas de famílias.
- **Nível 3.** `--rte-focus-width` é uma variável pública do nível 3 (`2px`; `3px` com `prefers-contrast: more`). **Contrato importante:** os tokens derivados e os do nível 3 são declarados em `.rte-root`. Sobrescrevê-los exige CSS que mire `.rte-root` (CSS sem camada vence sem `!important`) ou `style` inline na instância. Declarar `--rte-surface` em `:root` ou num ancestral **não** funciona para eles (a regra de `.rte-root` ganha); já as sementes e as variáveis do nível 2 seguem a cascata normal.
- **Nível 4.** Todo o CSS do pacote fica em `@layer rte.reset, rte.base, rte.theme, rte.components, rte.content`; o CSS do consumidor sem camada sempre vence. As classes `rte-*` só existem quando os componentes chegarem (spec 05).

```css
/* Nível 3: mira .rte-root (sem !important). */
.rte-root {
  --rte-surface: #fffdf7;
  --rte-focus-width: 4px;
}
```

## Três formas de configurar

Prioridade: **padrão < `:root` < ancestral < instância (inline)**.

1. **CSS global ou de um ancestral.** Defina as variáveis em `:root` ou em qualquer contêiner acima do `.rte-root`.
2. **JavaScript:** `applyRteTheme(element, options)` aplica o tema num elemento e devolve a função de limpeza.
3. **Por instância:** `style` inline no próprio `.rte-root` (por exemplo `style="--rte-primary: #15803d"`).

```ts
import { applyRteTheme } from '@cds/rte-theme';

const cleanup = applyRteTheme(el, {
  primary: '#0369a1',
  mode: 'dark',
  neutral: 'gray',
});
// ...depois:
cleanup();
```

Opções (`RteTheme` + `force`): `primary`, `secondary`, `tertiary`, `mode` (`'auto' | 'inherit' | 'light' | 'dark'`), `neutral` (`'tinted' | 'gray'`), `force` (usa o plano B mesmo com suporte nativo).

Semântica de `applyRteTheme`:

- **Caminho nativo** (navegador com cores relativas `color(from …)`/`oklch(from …)`, `color-mix(in oklab, …)`, `light-dark()` e `@property`): define só as sementes informadas (texto original, qualquer cor CSS), o atributo `data-rte-mode` (quando `mode` é informado) e, para `neutral: 'gray'`, `--rte-neutral-tint: 0`. O `theme.css` deriva o resto.
- **Plano B** (navegador sem esse suporte, ou `force: true`): calcula tudo com `createRteTheme` e define cada variável inline com `style.setProperty` (sem `unsafe-inline`; ver CSP), mais `color-scheme`.
- O **cleanup** remove tudo o que a função definiu (propriedades, atributo, listener de `prefers-color-scheme`). Ele **não restaura** um valor inline preexistente da mesma propriedade: ele a remove.
- Aplicar de novo no **mesmo elemento** descarta a aplicação anterior.
- Em **SSR/Node** (sem `document`/`window`) é um no-op e devolve uma função vazia.

## Modos

| `mode`    | Comportamento                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------- |
| `auto`    | Padrão. Segue o claro/escuro do **sistema** (`prefers-color-scheme`); **ignora o toggle do site** |
| `inherit` | Segue o `color-scheme` do `<html>` (o do site)                                                    |
| `light`   | Força claro                                                                                       |
| `dark`    | Força escuro                                                                                      |

**Se o seu site tem tema claro/escuro, use `inherit` e declare `color-scheme` no `<html>`** (por exemplo `html[data-theme='dark'] { color-scheme: dark; }`). Com `auto`, o editor segue o sistema operacional e não o botão de tema do seu site.

No plano B o valor é calculado em JS: sob `inherit` o chamador deve invocar `applyRteTheme` de novo quando o site trocar de tema (a mudança de classe/atributo não é observada; a mudança de `prefers-color-scheme` sob `auto`/`inherit` é).

```html
<div class="rte-root" data-rte-mode="inherit">…</div>
```

## Contrato de variáveis

Públicas e estáveis. As variáveis internas do pacote não fazem parte do contrato.

| Nível     | Variáveis                                                                                                                                                                                                                                                                                                                        | Onde sobrescrever                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1         | `--rte-primary`, `--rte-secondary`, `--rte-tertiary`                                                                                                                                                                                                                                                                             | `:root`, ancestral ou instância                   |
| 2         | `--rte-radius`, `--rte-density`, `--rte-font-sans`, `--rte-font-mono`, `--rte-font-size`, `--rte-line-height`                                                                                                                                                                                                                    | `:root`, ancestral ou instância                   |
| 3         | `--rte-surface`, `--rte-surface-raised`, `--rte-text`, `--rte-text-muted`, `--rte-border`, `--rte-focus`, `--rte-focus-width`, `--rte-danger`, `--rte-warning`, `--rte-success`, `--rte-code-bg`, `--rte-code-text`, `--rte-code-comment`, `--rte-code-keyword`, `--rte-code-string`, `--rte-code-number`, `--rte-code-function` | CSS que mira `.rte-root`, ou inline               |
| Derivadas | `--rte-<cor>-hover`, `--rte-<cor>-active`, `--rte-<cor>-subtle`, `--rte-<cor>-border`, `--rte-<cor>-text`, `--rte-on-<cor>` (`<cor>` = `primary`, `secondary` ou `tertiary`)                                                                                                                                                     | Calculadas; leitura (ou CSS que mira `.rte-root`) |

`--rte-neutral-tint` (`1` ou `0`) é a chave que `applyRteTheme` usa para a opção `neutral: 'gray'`; use a opção em vez de defini-la.

## Plano B e API em JavaScript

```ts
import {
  ANGULAR_DEFAULTS,
  RTE_THEME_PRESETS,
  applyRteTheme,
  checkRteTheme,
  createRteTheme,
  parseColor,
  suggestRteColor,
  supportsRelativeColors,
  warnIfPoorTheme,
} from '@cds/rte-theme';
```

| Export                                  | O que faz                                                                                                                                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supportsRelativeColors()`              | `true` só se o navegador entende tudo o que o `theme.css` usa: cores relativas (`color(from …)` e `oklch(from …)`), `color-mix(in oklab, …)`, `light-dark()` e `@property`. Em Node/SSR, `false`                                                               |
| `createRteTheme(options)`               | Devolve o mapa de 37 variáveis `--rte-*` em `#rrggbb` (e valores estáticos). Opções: `primary`, `secondary`, `tertiary`, `mode`, `neutral`, `dark` (vence `mode`), `parseColor` (leitor de cores próprio). Nunca lança: semente inválida cai no padrão Angular |
| `parseColor(input)`                     | Lê uma cor CSS e devolve `[r, g, b]` em 0..1, ou `null` se inválida (máx. 200 caracteres)                                                                                                                                                                      |
| `checkRteTheme(options)`                | Relatório de contraste (`{ ok, checks, invalid }`): 72 verificações, 36 por modo                                                                                                                                                                               |
| `warnIfPoorTheme(options, warn?)`       | Em desenvolvimento: avisa (pt-BR, `console.warn` por padrão) sobre cores ilegíveis e verificações reprovadas; devolve o relatório                                                                                                                              |
| `suggestRteColor(color)`                | Semente mais próxima (menor mudança de luminosidade OKLCH) que passa; `null` se a cor já passa, é ilegível ou nada próximo passa                                                                                                                               |
| `RTE_THEME_PRESETS`, `ANGULAR_DEFAULTS` | Presets e padrão do Angular                                                                                                                                                                                                                                    |

```ts
const vars = createRteTheme({
  primary: '#0ea5e9',
  dark: true,
  neutral: 'gray',
});
// { '--rte-surface': '#121212', '--rte-primary': '#0ea5e9', ... } (37 chaves)
for (const [name, value] of Object.entries(vars))
  el.style.setProperty(name, value);
```

`parseColor`:

- Em qualquer ambiente (Node ou navegador): `#hex` de 3, 4, 6 e 8 dígitos, `rgb()`, `hsl()` e `oklch()`.
- Só no navegador, via `<canvas>`: nomes de cor (`red`), `color(display-p3 …)`, `var()` e demais formas. Sem `document`, devolvem `null`.
- Cor inválida: `null`. Cores fora do gamut sRGB são recortadas.
- **Alfa (divergência conhecida):** alfa totalmente transparente é inválido nos dois caminhos. Alfa parcial é **ignorado** no parser puro (`#ffffff80` vale `#ffffff`), mas **rejeitado** no caminho do canvas (nomes, `color()`, `var()` com alfa menor que 1). Sementes devem ser opacas.

`checkRteTheme` verifica, nos dois modos e para as três cores: texto sobre a cor, hover e active (>= 4,5), `*-text` sobre superfície, superfície elevada e fundo suave (>= 4,5), foco (>= 3), texto neutro (>= 7) e secundário (>= 4,5), além dos tokens estáticos (`danger`, `warning`, `success`, `code-*`) sobre as superfícies. Cada item traz `id`, `mode`, `ratio`, `min` e `pass`.

```ts
const report = checkRteTheme({ primary: '#0ea5e9' });
report.ok; // true
report.checks.length; // 72
warnIfPoorTheme({ primary: 'banana' }); // avisa: valor inválido em `primary`
```

### Presets

| `RTE_THEME_PRESETS` | `primary` | `secondary` | `tertiary` |
| ------------------- | --------- | ----------- | ---------- |
| `angular` (padrão)  | `#8514f5` | `#f637e3`   | `#0546ff`  |
| `ocean`             | `#0369a1` | `#0e7490`   | `#4f46e5`  |
| `forest`            | `#15803d` | `#65a30d`   | `#0d9488`  |
| `sunset`            | `#ea580c` | `#db2777`   | `#9333ea`  |
| `monochrome`        | `#374151` | `#6b7280`   | `#111827`  |

Todos passam em `checkRteTheme` nos dois modos.

## Navegadores, CSP e acessibilidade

Versões em que os testes rodam (ADR 0002, Playwright, local e CI):

| Navegador | Versão testada | Cores relativas | `light-dark()` | `@property` | Contraste (grade)           |
| --------- | -------------- | --------------- | -------------- | ----------- | --------------------------- |
| Chromium  | 153.0.8010.12  | nativas         | nativo         | nativo      | 0 falhas (nativo e plano B) |
| Firefox   | 155.0          | nativas         | nativo         | nativo      | 0 falhas (nativo e plano B) |
| WebKit    | 26.6           | nativas         | nativo         | nativo      | 0 falhas (nativo e plano B) |

Em navegadores sem esses recursos, o `theme.css` sozinho não deriva as cores; use `applyRteTheme` (plano B), que aplica o resultado de `createRteTheme`. Em testes, o plano B forçado (`force: true`) é equivalente ao CSS nativo dentro dos limites do R7 nos três motores.

- **CSP.** O plano B usa `style.setProperty` (CSSOM) e não exige `unsafe-inline` para o que o JS gera. Verificado com `style-src 'self'; script-src 'self'`, sem violações, nos três motores.
- **Contraste do usuário.** Com `prefers-contrast: more`, a borda usa o texto secundário e `--rte-focus-width` vai a `3px`. Com `forced-colors: active`, borda, foco, superfície e texto usam cores do sistema (`CanvasText`, `Highlight`, `Canvas`, `GrayText`, `ButtonBorder`). O foco deve ser desenhado com `outline`, não só com cor.
- **Limite honesto.** Os valores do plano B são aplicados inline e vencem os ajustes de `forced-colors` e `prefers-contrast` do tema. Os testes de acessibilidade emulam a preferência e recarregam a página; a reação **ao vivo** a uma mudança de preferência não é coberta.
- **WCAG 2.x, não APCA.** As razões de contraste são as da WCAG 2.x. APCA está fora de escopo.

## Garantias e limites

- **Contraste por construção.** Texto sobre a cor (`on-*`), hover e active têm razão >= 4,5 para **todas** as 2^24 sementes sRGB de 8 bits (varredura exaustiva; mínimo 4,582). Grades de sementes (223 sRGB, 148 fora do sRGB e 12 junto ao limiar do `on-*`), em claro e escuro, dão 0 falhas nos três motores, no CSS nativo e no plano B; o teste de propriedade (`fast-check`, 5000 execuções por propriedade) não achou contraexemplo.
- **Matiz dos fundos suaves.** Os neutros são tingidos pela `primary` (use `neutral: 'gray'` para cinza). Por isso o `*-subtle` tingido de `secondary`/`tertiary` pode ter desvio de matiz de até cerca de 33 graus em croma baixo (nos trios medidos), por desenho; `*-border` fica em até cerca de 5 graus.
- **Plano B equivale ao nativo.** ΔE (OKLab) medido, plano B contra CSS nativo: derivados lineares 0, texto até 0,0028, neutros até 0,0035, bordas até 0,0032 (spec R7: 0,019 e 0,041). É o piso de quantização de 8 bits.
- **Tamanho (desvio do R11).** O R11 pede <= 3 kB min+gzip. O JS mede mais, e o orçamento é por cenário de importação (ADR 0002):

  | Cenário                                               | min+gzip (B) | Orçamento (B) |
  | ----------------------------------------------------- | ------------ | ------------- |
  | pacote inteiro                                        | 4898         | 5632          |
  | `applyRteTheme` (puxa o plano B)                      | 3460         | 4096          |
  | `createRteTheme`                                      | 2737         | 3072          |
  | `parseColor`                                          | 1450         | 2048          |
  | presets                                               | 304          | 512           |
  | `checkRteTheme`, `warnIfPoorTheme`, `suggestRteColor` | 3994         | 4608          |

  O `sideEffects` declara só `*.css` e o JS é tree-shakeable. Detalhes e opções futuras: [ADR 0002, "Orçamento de tamanho"](../../docs/decisions/0002-tema-cores-padrao-e-navegadores.md).

- **Quatro desvios da fórmula do spike** (ADR 0002, seção "Desvios da fórmula do spike"): (1) erro de digitação na matriz OKLab do plano B do spike; (2) rampa do `on-*` virou degrau (ganho de 1000 para 1e9); (3) limiar do `on-*` de 0,1791 para 0,1791005 (estabilidade entre motores); (4) mistura de `*-subtle`/`*-border` em OKLab, não OKLCH.
- Valor inválido cai no padrão do Angular; as cores padrão vêm da spec e não foram verificadas contra o press kit oficial (ADR 0002).

## Desenvolvimento

No repositório (monorepo Nx):

```bash
npx nx run theme:test                              # testes unitários, de propriedade e do CSS
FC_SEED=1 FC_RUNS=20000 npx nx run theme:test --skip-nx-cache   # propriedade com outra semente/execuções
npx nx run theme:build && npx nx run theme:size    # build e orçamento de tamanho (R11)
npx nx run theme:verify-package                    # npm pack + publint + attw
e2e/with-browser-libs.sh npx playwright test -c e2e   # E2E em Chromium, Firefox e WebKit (WSL, navegadores instalados)
```

No CI os navegadores são instalados com `npx playwright install --with-deps`. Os testes de navegador do tema ficam em `e2e/theme/`; ver `e2e/README.md`.

Repositório: cds-text-editor (monorepo). Licença MIT.
