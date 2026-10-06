# Spec 06 — Renderização (`@cds/rte-render`)

> Depende das specs 04 (sanitizador, concluída na branch `feat/spec-04`, ainda **fora** da pilha da 05: ver H2), 05b1 (concluída: `@cds/rte-core/styles/content.css`, R12/N13 de equivalência por estilo computado, página `/content-static`), 05a (concluída: app de teste `e2e/angular/app` com CSP estrita, *prerender*, hidratação e *builds* zoneless e zone.js) e 02 (concluída: `theme.css`, `.rte-root`, `data-rte-mode`). Consumida pelas specs 07 (demo e docs exibem o conteúdo com o `rte-render`), 08 (regressão visual editor × página por captura de tela, matriz de motores) e 09 (`docs/security.md` e `SECURITY.md`).
> **Revisão de 2026-10-05.** A versão original (2026-10-02) previa o `DOMPurify` no navegador, um pipe `rteHtml` e um `rte-content.css` próprio; os três foram superados: a spec 04 adotou **uma engine só, própria**, igual em Node e no navegador (ADR 0006, S1), a 05b1 pôs a aparência `rt-*` num arquivo único do core (U16) e o ADR 0006 pediu esta revisão (§3 e §8 da versão anterior). Decisões tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro". Fatos conferidos em 2026-10-05 no repositório: `@angular/core` 22.2.1; `packages/render` é o andaime da spec 01 (`RENDER_VERSION`, só o alvo `test`, sem `test-zone` nem `size`, `sideEffects: false`, *peers* `@angular/core|common|forms`, tag `scope:render` já autorizada a depender de `scope:core` e `scope:sanitizer`, `scope:e2e` ainda não autorizada a depender de `render` nem de `sanitizer`); o `@cds/rte-sanitizer` (na `feat/spec-04`) expõe `createSanitizer(opções)` → `(html) => string`, `sanitizeRichText`, `RteSanitizeError` (`code: 'input-too-long' | 'max-depth'`, `limit`) e o cenário de tamanho `whole` de 31 940 B min+gzip (com o `htmlparser2`); a saída do sanitizador é **canônica** (S13: texto escapa `& nbsp < >`, atributos `& nbsp " < >`), ids repetidos perdem o `id` da 2ª ocorrência (S7) e o fixture `all-features.html` é ponto fixo; `@cds/rte-core/html` exporta `extractToc(html, { levels = [2, 3], idPrefix, maxDepth })` (sem DOM, valida o `id` pela regra do esquema, ignora título vazio, **não** remove `id` repetido, texto puro decodificado) e `htmlToText`/`validateHtml`; o `content.css` tem paleta clara/escura por `light-dark()` com `!important` só em `[data-rt-color]` (U17), mas **não** tem estilo para `label` de tarefa publicada (o editor usa `rte-task__*`), `caption` de tabela nem rolador de tabela (o editor usa o `.tableWrapper` do `prosemirror-tables`); o HTML canônico usa o atributo `style` em `p`/`h2`–`h4` (`text-align`), `col` (`width`), `iframe` (`aspect-ratio`) e na paleta (`color`/`background-color`), e a CSP estrita do app de teste (`default-src 'self'; script-src 'self'; style-src 'self'`) bloqueia esses atributos (exclusões da R12 da 05b1); o realce `hljs-*` existe só no `editor.css` (decorações do Tiptap; o HTML não tem *tokens*, ADR 0003); a pendência do ADR 0010 promete que "o `rte-render` da spec 06 mantém o rolador focável".

## 1. Objetivo

Exibir o HTML publicado **igual ao do editor**, **seguro por padrão** e **funcionando sem JavaScript** (SSR e *prerender*), num pacote Angular pequeno: a diretiva `[rteContent]` (sanitiza com o mesmo sanitizador e as mesmas opções do editor, transforma para exibição, reaplica sob CSP estrita os estilos que o esquema permite e torna focáveis as tabelas largas), o componente `rte-toc` (sumário a partir dos títulos, sem DOM) e o `render.css` (só o que é de leitura: rolador, sumário e margem de rolagem das âncoras), sobre o `theme.css` (spec 02) e o `content.css` do core (05b1).

## 2. Fora de escopo

Edição e a casca do SSR do editor (spec 05; D19 do ADR 0007); a sanitização em si e o servidor (spec 04 e spec 07: a sanitização que vale é a do servidor, **na gravação**); **realce de código na exibição** (H15, evolução); `injectRteHeadMeta` e metadados de `<head>` (decisão de 2026-10-02; tempo de leitura pelo core: `readingTime(htmlToText(html))`); pipe `rteHtml` (H3); tema por instância com `[theme]` (H14; o consumidor usa CSS ou `applyRteTheme`); conversão de HTML legado (filtro, não conversor: S11 do ADR 0006); regressão visual por captura de tela editor × página e matriz de motores antigos (spec 08); suporte a `HashLocationStrategy` nas âncoras (H6: documentado como limitação); interação com o conteúdo além do nativo (copiar código, ampliar imagem, *lightbox*); `crossorigin` em `track`/`video` (o esquema não tem o atributo: legendas de outra origem não carregam, evolução do core, §8).

## 3. Decisões

Cada uma com o motivo. Divergências na execução viram o **ADR 0012** (renderização; o 0011 está reservado para a mídia da 05c1, que corre em paralelo). Numeração própria (H1…) para não colidir com S1–S14 e N1–N7 (04), D1–D26 (05a), U1–U20 (05b1), G1–G21 (05b2a), F1–F9 e M1–M21 (05b2b), V1–V18 e P1–P16 (05c1). Os requisitos são R1… desta spec e os testes de navegador são **L1–L7** (série própria do `rte-render`; a série N do `rte-angular` segue nas specs 05).

| # | Decisão | Motivo |
|---|---|---|
| H1 | **Uma parte só**, sem divisão: diretiva, sumário, CSS, rótulos, SSR, CSP e testes cabem em ~13 tarefas. Realce de código (H15) e metadados de `<head>` ficam fora. | Abaixo do critério de divisão (~14 tarefas) usado na 05b2a/05c1; o que empurraria acima (realce, com gramáticas sob demanda e SSR) não é necessário para "igual ao editor" no que o HTML contém. |
| H2 | **Pré-requisito: integrar a `feat/spec-04` à `feat/spec-06`** (merge, 1ª tarefa do plano). Conflitos conhecidos: `docs/specs/README.md` e `e2e/README.md` (texto; vale a união); `CLAUDE.md`, `package-lock.json`, `packages/core/README.md` e `tsconfig.base.json` mesclam sem conflito. Depois do merge: `npm ci`, `nx run-many -t lint,typecheck,build,test` dos seis projetos e `npx playwright test -c e2e e2e/sanitizer` verdes antes de qualquer código da 06. | O sanitizador, o ADR 0006, o `docs/security.md` e os interpretadores S4 do core (`escapeHtmlAttribute` entre eles) só existem na `feat/spec-04`, que saiu da 03c em paralelo à pilha da 05; a 06 não pode ser executada sem eles. Merge (não *rebase*) preserva os *hashes* que os ADRs citam. |
| H3 | **Diretiva `[rteContent]`** (não componente, não pipe) é a única forma de exibir: o elemento do consumidor (`article`, `section`, `div`) vira o contêiner, ganha as classes `rte-root rte-content` e recebe o HTML por ligação de `innerHTML` do *host* com `SafeHtml`. **Sem** pipe na v1. | O consumidor escolhe o elemento semântico; um só caminho faz tudo o que a exibição precisa (sanitizar, transformar, reaplicar estilos, rolador). Um pipe com `[innerHTML]` solto perderia o rolador e os estilos sob CSP e criaria um segundo caminho a manter; pode voltar como evolução se pedido. |
| H4 | **Modo padrão `sanitize`, com o sanitizador injetado:** `provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) })` (raiz, rota ou componente). `[mode]="'trusted'"` é explícito por instância e dispensa o sanitizador. Em `sanitize` **sem** sanitizador fornecido a diretiva **lança** na criação (erro com instrução de configuração), no servidor e no navegador. O pacote **não** importa o código do `@cds/rte-sanitizer` (só `import type`). | Seguro por padrão (plano, princípio 1) sem pagar 31,9 kB de quem só usa `trusted`: o sanitizador entra no *bundle* só se o consumidor chamar `createSanitizer`; as **mesmas opções do editor** (provedores de *embed*, `mediaHosts`, `linkPolicy`) são obrigatórias na prática (ADR 0006, consequência para a 06), e um padrão silencioso divergiria delas; falhar cedo e alto é melhor que exibir sem barreira ou vazio sem explicação. |
| H5 | **Erro do sanitizador:** `RteSanitizeError` (`input-too-long`, `max-depth`) → conteúdo **vazio**, `console.warn` com `code` e `limit` (inclusive no servidor) e o *signal* público `error()` com o erro; qualquer outra exceção propaga. Reconhecido por `error.name === 'RteSanitizeError'` (não `instanceof`, H4). `html` `null`/`undefined` = `''`. | ADR 0006 (consequência para a 06): conteúdo antigo grande não derruba a página; o consumidor mostra a alternativa pelo `error()`; `name` funciona com duas cópias do pacote. |
| H6 | **Transformações de exibição** por uma função pura **interna** (`prepareRteHtml`), aplicadas **depois** do sanitizador (ou ao HTML `trusted`), iguais no servidor e no navegador: (a) cada `<table …>…</table>` vira `<div class="rte-table-scroll"><table …>…</table></div>`; (b) `href="#x"` de `a` vira `href="<caminho do documento>#x"` (caminho e consulta de `PlatformLocation`, escapados por `escapeHtmlAttribute` do core), com `provideRteRender({ fragmentLinks: 'document' \| 'keep' })`, padrão `'document'`. Feitas por varredura de *tags* sobre o HTML **canônico**: como a saída do sanitizador escapa `<` no texto e `<`/`>` nos atributos (S13), `<table`, `</table>` e `<a ` só podem ser *tags* e `[^>]*` não sai da *tag*. Pré-condição documentada de `trusted`: HTML saído de `createSanitizer` (mesma versão maior). O HTML guardado não muda. | Rolador sem JS e sem divergência de hidratação (a marcação é a mesma nos dois lados); com o `<base href="/">` de todo app Angular, `href="#x"` resolve para `/#x` e **navega para a raiz**: reescrever para o caminho do documento faz a âncora funcionar nativamente (rolagem, `:target`, ponto de partida do foco, histórico, abrir em nova aba), com e sem JS, sem interceptar clique; um *parser* a mais custaria ~30 kB a quem usa `trusted`. |
| H7 | **Rolador de tabela focável quando transborda** (pendência do ADR 0010): no HTML (servidor e navegador) o `div.rte-table-scroll` sai **sem** `tabindex`; no navegador um `ResizeObserver` por rolador põe `tabindex="0"`, `role="region"` e `aria-label` (rótulo `tableScroller`) **só** enquanto `scrollWidth > clientWidth`, e os retira quando deixa de transbordar. CSS: `overflow-x: auto`, foco visível com `--rte-focus`. | WCAG 2.1.1 (rolar pelo teclado) nos 3 motores — o Chromium ≥ 130 e o Firefox já focam roladores sem `tabindex`, o WebKit não; tabela que cabe não vira parada de `Tab` nem *landmark* (ruído para leitor de tela); o HTML do servidor fica determinístico (sem medida no SSR). |
| H8 | **Estilos do conteúdo sob CSP estrita:** no navegador, depois de cada inserção, a diretiva reaplica por **CSSOM** (`el.style.cssText = el.getAttribute('style')`) o `style` de cada elemento do conteúdo que o tenha. Em `sanitize` só chega o que o esquema permite (`text-align`, `width` de `col`, `aspect-ratio` de `iframe`, cores da paleta); em `trusted`, o que o servidor deixou. Sem JS e com `style-src` sem `'unsafe-inline'`, alinhamento, larguras de coluna e proporção de *embed* ficam de fora (a paleta não depende disso, U17): documentado. | A CSP bloqueia o **atributo** `style` vindo do HTML, mas não a escrita por CSSOM (por isso o editor funciona com a mesma CSP); é a mesma informação que o servidor já validou, sem `'unsafe-inline'`; fecha a consequência das exclusões da R12 da 05b1 (ADR 0008, consequência para a 06). |
| H9 | ***Trusted Types:*** o HTML só entra no DOM pela ligação de `innerHTML` do Angular com `DomSanitizer.bypassSecurityTrustHtml` (a política `angular#unsafe-bypass` do Angular cria o `TrustedHTML`); nenhuma escrita direta de `innerHTML`/`outerHTML`/`insertAdjacentHTML` no pacote (lint, H19). README: CSP `require-trusted-types-for 'script'; trusted-types angular angular#unsafe-bypass`. | Compatível com Trusted Types sem política própria; uma só porta de entrada de HTML, fácil de auditar. |
| H10 | **SSR e hidratação:** o mesmo código roda no servidor (sanitizador puro, `extractToc` sem DOM, `PlatformLocation` do servidor); o HTML do servidor já traz o conteúdo transformado (H6), visível sem JS. `ResizeObserver` e CSSOM só no navegador (`afterNextRender`/`afterRenderEffect`). **Pré-voo do plano:** conferir no Angular 22.2.1 se a hidratação re-atribui `innerHTML` (identidade dos nós e recarga de `iframe`/`video`); se re-atribuir, aceitar e registrar no ADR 0012 (conteúdo idêntico, sem `NG05xx`), **sem** `ngSkipHydration` (que destrói e recria). | Plano 6.6: "conteúdo existente visível sem JS (via `render`)"; mesma saída do sanitizador nos dois lados (ADR 0006); o custo de uma re-atribuição é uma recarga de mídia, não uma divergência de conteúdo. |
| H11 | **Sumário `rte-toc`:** `<rte-toc [html]="…" [levels]="[2, 3]" />` usa `extractToc` do core (entra no *bundle* só com o componente); `id` repetido: vale a **primeira** ocorrência (como S7); lista aninhada `nav > ol > li > a` por nível, com nível que salta (h4 sem h3) aninhado sob o último anterior e título sem ancestral no nível de cima; `href` com a mesma base da H6; `nav` com `aria-label` (rótulo `toc`); sem entradas, nada é renderizado (nem o `nav`). A diretiva expõe `renderedHtml()` (o HTML exibido, antes da H6) para alimentar o sumário: `<article #c="rteContent" [rteContent]="body"></article>` + `<rte-toc [html]="c.renderedHtml()" />`; HTML do servidor também serve. | Sem DOM (SSR); ids coerentes com o que está na página (o sanitizador já tirou os repetidos; em `trusted` a regra é a mesma); o custo do `htmlparser2` só para quem quer sumário; *landmark* `navigation` nomeado. |
| H12 | **Âncoras e rolagem:** nenhuma interceptação de clique; a navegação é nativa (H6). `render.css` dá `scroll-margin-top: var(--rte-scroll-margin, 1rem)` a `[id]` dentro de `.rte-content` (cabeçalho fixo do site: o consumidor ajusta o *token*). | Comportamento nativo é o mais acessível e o menos código; o *token* resolve o cabeçalho fixo sem JS. |
| H13 | **CSS:** o `rte-render` não tem aparência `rt-*` própria. O `content.css` do core ganha o que falta ao **HTML publicado** e vale igual para qualquer página: `.rt-task > label` em `flex` com o mesmo alinhamento e `accent-color` do editor (sem estilo de "concluída" riscado: o editor não tem), e `caption` (o esquema e o sanitizador o aceitam) discreto, como `figcaption`. `@cds/rte-render/styles/render.css`: rolador e sumário em `@layer rte.components`, `scroll-margin` em `@layer rte.content`; só `--rte-*`; foco visível; `forced-colors`; nenhum `!important`. Ordem: `theme.css` → `content.css` → `render.css`. | Uma fonte da aparência para editor e página (U16); a R12 da 05b1 (N13) continua comparando `li.rt-task`; o que é só de leitura fica fora do core. |
| H14 | **Tema sem dependência de `@cds/rte-theme`:** o *host* é `.rte-root` (tokens do `theme.css`); claro/escuro por `data-rte-mode` posto pelo consumidor no próprio elemento, e tema por instância por CSS ou `applyRteTheme(el)` chamado pelo consumidor. | Grafo do repositório (`render` depende só de `core` e `sanitizer`); uma entrada `[theme]` exigiria a dependência e duplicaria o que o CSS já faz. |
| H15 | **Realce de código fora da v1:** o `pre > code.language-*` usa `--rte-code-text`/`--rte-code-bg` do tema, sem cores de *token*. A divergência com o editor (que realça) é aceita, documentada e excluída da equivalência (R9). Evolução: entrada opcional do `rte-render` com `@cds/rte-core/code-languages`. | O HTML não carrega *tokens* (ADR 0003, decisão da 06); realçar exigiria o `highlight.js` no *bundle* do site e no SSR (dezenas de kB) para um ganho cosmético. |
| H16 | **Rótulos:** `RteRenderLabels { toc; tableScroller }`; `RTE_RENDER_LABELS_EN` (padrão) no entry `.`, `RTE_RENDER_LABELS_PT_BR`/`_ES` no entry `/i18n`; `provideRteRender({ labels })` e a entrada `labels` (parcial) na diretiva e no `rte-toc`, que vence o *provider* e troca ao vivo. | Mesmo arranjo do `rte-angular` (D15: uma fonte por *string*; idiomas fora do *bundle* padrão); sem texto fixo em template. |
| H17 | **Pacote:** *peers* `@angular/core`, `@angular/common` (22.x) e `@cds/rte-core` (mesma versão); `@cds/rte-sanitizer` *peer* **opcional** (só tipos, H4); sai o *peer* `@angular/forms` (não usado); nenhuma dependência nova no *lockfile*. Entries `.`, `/i18n` e o arquivo `styles/render.css` (`sideEffects: ["**/*.css"]`). Alvos novos `test-zone` e `size` (como o `rte-angular`); `scope:e2e` passa a poder depender de `scope:render` e `scope:sanitizer`. | O mínimo para funcionar; a mesma estrutura do `rte-angular` (D21, D26); o app de teste usa os dois pacotes. |
| H18 | **Detecção de mudanças:** nada escrito em *signal* a partir de `ResizeObserver` ou CSSOM (só atributos do DOM, fora da zona); `renderedHtml()` e `error()` são `computed` do `html`/modo/sanitizador; a mesma suíte nos alvos `test` (zoneless) e `test-zone`. | D2/D21 da 05a: sem `NG0100`/`NG0101`, sem *ticks* por redimensionamento. |
| H19 | **Guardas por lint** da D25 da 05a aplicadas ao `rte-render` (sem `@Input`/`@Output`/`@HostListener`/`@HostBinding`, `ngOnChanges`, `zone.js`, globais de DOM, texto literal em template; OnPush, `ViewEncapsulation.None`, `templateUrl`, sem `styles`), mais: proibido `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` e `bypassSecurityTrust*` fora do arquivo da diretiva. | H9; a mesma disciplina do pacote irmão, conferida por `lint-guards.spec.ts`. |
| H20 | **Equivalência editor × página por estilo computado e geometria**, não por captura: o fixture `all-features` no editor (rota `content` da 05b1) e na rota `render` (diretiva, CSP estrita, depois da H8) têm os mesmos estilos computados (lista do N13 **mais** `text-align`, larguras de coluna e `aspect-ratio`, agora reaplicados) e a mesma largura/altura de cada bloco (±1 px), em claro e escuro, nos 3 motores. Exclusões: o que só existe na edição (alças, `tableWrapper`, *placeholder*, DOM interno da tarefa), o realce (H15) e a altura das tabelas largas (rolador). A captura de tela fica com a spec 08. | Comparação determinística entre motores e sem imagens de referência; pega divergência de leiaute; mesma decisão da 05b1 para a R12. |
| H21 | **Tamanho:** cenários `content` (`RteContent` + `provideRteRender`), `toc`, `whole`, `i18n` com `@angular/*` e `@cds/*` externos, e `page` (diretiva + sumário + `createSanitizer`, com `@cds/*` **embutidos**: o custo real de uma página publicada); orçamento pela regra do D26 (`ceil(medido × 1,15 / 64) × 64`). | Mostra o custo do pacote e o da página inteira (dominado pelo `htmlparser2`, compartilhado pelo sanitizador e pelo `extractToc`). |

## 4. API

```ts
// @cds/rte-render (entry `.`)
type RteRenderMode = 'sanitize' | 'trusted';

interface RteRenderLabels {
  /** `aria-label` do `nav` do sumário (en: "Table of contents"). */
  toc: string;
  /** `aria-label` do rolador de tabela que transborda (en: "Scrollable table"). */
  tableScroller: string;
}

interface RteRenderOptions {
  /** Sanitizador do modo `sanitize`: `createSanitizer(opçõesDoEditor)` do `@cds/rte-sanitizer` (H4). */
  sanitize?: (html: string) => string;
  /** `href="#x"` → `<caminho do documento>#x` (padrão) ou mantido (H6). */
  fragmentLinks?: 'document' | 'keep';
  labels?: Partial<RteRenderLabels>;
}

function provideRteRender(options: RteRenderOptions): Provider[];
const RTE_RENDER_LABELS: InjectionToken<RteRenderLabels>;
const RTE_RENDER_LABELS_EN: RteRenderLabels;

/** Forma estrutural do `RteSanitizeError` (H5), sem importar o código do sanitizador. */
interface RteSanitizeErrorLike {
  readonly name: 'RteSanitizeError';
  readonly code: 'input-too-long' | 'max-depth';
  readonly limit: number;
  readonly message: string;
}

/** <article [rteContent]="post.body" [mode]="'sanitize'" #c="rteContent"></article> */
class RteContent {                              // selector `[rteContent]`, exportAs `rteContent`
  readonly rteContent: InputSignal<string | null | undefined>;   // o HTML
  readonly mode: InputSignal<RteRenderMode>;                    // padrão 'sanitize'
  readonly labels: InputSignal<Partial<RteRenderLabels> | undefined>;
  /** HTML exibido (sanitizado ou `trusted`), antes das transformações da H6; `''` com erro. */
  readonly renderedHtml: Signal<string>;
  /** Último `RteSanitizeError` (H5) ou `null`. */
  readonly error: Signal<RteSanitizeErrorLike | null>;
}

/** <rte-toc [html]="c.renderedHtml()" [levels]="[2, 3]" /> */
class RteToc {                                  // selector `rte-toc`
  readonly html: InputSignal<string | null | undefined>;
  readonly levels: InputSignal<readonly number[]>;              // padrão [2, 3]
  readonly labels: InputSignal<Partial<RteRenderLabels> | undefined>;
  /** Entradas exibidas (ids únicos, H11). */
  readonly entries: Signal<readonly RteTocEntry[]>;
}

// @cds/rte-render/i18n
const RTE_RENDER_LABELS_PT_BR: RteRenderLabels;   // "Sumário", "Tabela com rolagem horizontal"
const RTE_RENDER_LABELS_ES: RteRenderLabels;

// @cds/rte-render/styles/render.css
```

**Interno (não exportado):** `prepareRteHtml(html, { fragmentBase })` (H6); o observador dos roladores (H7); a reaplicação por CSSOM (H8); a montagem da árvore do sumário (H11).

**DOM e classes** (API pública, BEM): o *host* da diretiva ganha `rte-root rte-content`; `div.rte-table-scroll` (com `tabindex="0"`, `role="region"` e `aria-label` só quando transborda); `rte-toc` renderiza `nav.rte-toc > ol.rte-toc__list > li.rte-toc__item > a.rte-toc__link` (sub-listas `ol.rte-toc__list` aninhadas no `li`).

**Uso** (README):

```ts
// app.config.ts — as MESMAS opções do editor
import { createSanitizer } from '@cds/rte-sanitizer';
import { editorOptions } from './editor-options';
providers: [provideRteRender({ sanitize: createSanitizer(editorOptions) })]
```

```html
<!-- styles: @cds/rte-theme/theme.css → @cds/rte-core/styles/content.css → @cds/rte-render/styles/render.css -->
<rte-toc [html]="c.renderedHtml()" />
<article [rteContent]="post.body" #c="rteContent" data-rte-mode="auto"></article>
```

## 5. Requisitos

- **R1. Pacote.** Entries e exports da §4; `verify-package` (`publint`, `attw`) verde; *peers* da H17; nenhum import de código do `@cds/rte-sanitizer` no `dist` (só tipos; `grep` no `fesm2022`) e nenhum de `@cds/rte-core/html` alcançável a partir de `RteContent`/`provideRteRender` (cenário `content` sem `htmlparser2`); `check:licenses` e `notices` sem *drift*.
- **R2. Modos (H4, H5).** Em `sanitize`, o HTML exibido é exatamente `sanitize(html)` + H6; em `trusted`, `html` + H6; sem sanitizador em `sanitize`, a criação lança com mensagem que cita `provideRteRender({ sanitize: createSanitizer(…) })`, no navegador e no SSR; `RteSanitizeError` dá conteúdo vazio, `error()` preenchido e um `console.warn` por erro; outra exceção propaga; trocar `html`, `mode` ou o sanitizador (outro *provider*) re-renderiza; `null`/`undefined` = vazio.
- **R3. Segurança.** O fixture `all-features` sai **byte a byte** igual (mais as transformações da H6); com o corpus de XSS do sanitizador (290 casos) e 2000 casos do gerador hostil, nenhum `<script>`, atributo `on*`, `javascript:`/`data:` em URL nem `srcdoc` chega ao DOM, e nenhuma violação `script-src*` é registrada (com o controle positivo do ADR 0006 (e)); a diretiva nunca chama `bypassSecurityTrustHtml` com HTML não sanitizado no modo `sanitize` (teste de unidade com espião).
- **R4. Transformações (H6).** **Propriedade** (fast-check, saídas de `createSanitizer` sobre o gerador hostil e o `editor-corpus`): ler `prepareRteHtml(h)` com o `htmlparser2` e retirar os `div.rte-table-scroll` dá a mesma árvore que `h`, exceto os `href` de fragmento de `a`, que valem `base + valor original`; toda `table` fica dentro de exatamente um rolador; nada fora de `a[href^="#"]` muda (texto com `href="#` ou `<table` escapado fica intacto); a base é escapada (`"`, `<`, `&`); `fragmentLinks: 'keep'` só embrulha tabelas.
- **R5. Estilos sob CSP (H8).** Na rota `render` (CSP estrita), `text-align` de `p`/`h2`–`h4`, `width` de `col` e `aspect-ratio` de `iframe` do fixture têm o valor do HTML no estilo computado, nos 3 motores; as cores da paleta valem no claro e no escuro; sem JS, o conteúdo aparece com a paleta e sem os três estilos (documentado).
- **R6. Rolador (H7).** Tabela larga (colunas largas numa *viewport* de 400 px): o rolador recebe `tabindex="0"`, `role="region"` e o `aria-label` do idioma; `Tab` chega a ele, setas e `Home`/`End` rolam, o foco é visível; ao alargar a *viewport* até caber, os três atributos saem; tabela estreita nunca vira parada de `Tab`; o ADR 0010 tem a pendência marcada como atendida pelo `rte-render`.
- **R7. Sumário e âncoras (H11, H12).** Tabela de casos de `rte-toc`: títulos aninhados, nível que salta, título vazio ignorado, `id` repetido (primeira vence), `levels` customizado, HTML sem títulos (nada renderizado), texto com entidades exibido como texto; no navegador, clicar numa entrada do sumário e num link de fragmento do conteúdo rola até o título respeitando `--rte-scroll-margin`, aplica `:target`, muda o fragmento da URL sem recarregar nem sair da rota (com `<base href="/">` numa rota aninhada) e o próximo `Tab` parte do título; `fragmentLinks: 'keep'` mantém o `href` original.
- **R8. SSR e hidratação (H10).** No HTML do servidor (rota `render` pré-renderizada) o conteúdo transformado e o sumário estão presentes; com JS desligado o texto, as tabelas com rolador, os links do sumário e a paleta funcionam; com JS, hidratação sem `NG05xx` nos *builds* zoneless e zone.js; o resultado do pré-voo da H10 (identidade dos nós, recarga de `iframe`) está registrado no ADR 0012 e coberto por teste; `ssr.spec.ts` (Node) renderiza a diretiva e o sumário com `renderApplication` sem tocar em globais de DOM.
- **R9. Equivalência (H20).** Editor × rota `render`: estilos computados (lista do N13 + `text-align`, `width` de `col`, `aspect-ratio`) iguais e geometria de cada bloco a ±1 px, em claro e escuro, nos 3 motores, com as exclusões da H20; `video` e `iframe` recebem clique na página (a regra de `pointer-events` da 05c1 é só do editor).
- **R10. CSP e *Trusted Types* (H8, H9).** Na rota `render`: nenhuma violação além de `style-src-attr` dos atributos `style` do conteúdo na inserção (esperadas e listadas: só elementos com estilo do esquema); na rota `render-tt` (`require-trusted-types-for 'script'; trusted-types angular angular#unsafe-bypass`): 0 violações nos motores que aplicam *Trusted Types* e conteúdo exibido nos 3.
- **R11. Acessibilidade.** axe sem violações `serious`/`critical` na rota `render` (fixture, sumário, tabela larga) em claro, escuro e `forced-colors`; `nav` do sumário nomeado; contraste ≥ 4,5 de links do sumário e do conteúdo; foco visível no rolador e nos links; alvos do sumário ≥ 24 px.
- **R12. Rótulos (H16).** `RTE_RENDER_LABELS_EN`/`PT_BR`/`ES` completos e sem string vazia; a entrada `labels` vence o *provider* e troca ao vivo o `aria-label` do `nav` e dos roladores que transbordam; nenhum texto fixo em template.
- **R13. Detecção de mudanças e lint (H18, H19).** Suíte igual em `test` e `test-zone`; redimensionar a janela não dispara *tick* (contador do app de teste no *build* zone); `lint-guards.spec.ts` prova cada guarda (inclusive `innerHTML` e `bypassSecurityTrust*` fora da diretiva).
- **R14. Desempenho.** Exibir o documento de 20 mil palavras (fixture repetido, ~400 kB) — sanitizar, transformar e inserir — tem a mediana e o p95 registrados no ADR 0012 por motor (informativo); a transformação da H6 não passa de 10% do tempo do sanitizador em Node (teste de unidade pela melhor de 3, como o *ruling* 23 do ADR 0006).
- **R15. Tamanho e documentação.** Cenários da H21 medidos e orçados (`nx run render:size`); README do pacote (instalação, ordem do CSS, `provideRteRender` com as opções do editor, `trusted` "só se o servidor já sanitiza com `createSanitizer`", CSP e *Trusted Types*, sem JS, âncoras e `--rte-scroll-margin`, `HashLocationStrategy`, `error()`, tema e `data-rte-mode`, sumário, limitações: realce e legendas de outra origem); `docs/security.md` ganha a seção da exibição (H4, H8, H9); `CLAUDE.md` ganha a seção "Render"; changesets do `@cds/rte-render` e do `@cds/rte-core` (`content.css`).

## 6. Testes

### 6.1 Unitários (alvos `test` e `test-zone` do `@cds/rte-render`; `packages/render/src/**/*.spec.ts`)

- `prepare-html.spec.ts`: R4 por tabela de casos e **propriedade** (oráculo: árvore do `htmlparser2`); escape da base; `keep`; R14 (custo relativo).
- `content.spec.ts`: R2 caso a caso (modos, *provider* ausente, `RteSanitizeError`, outra exceção, trocas de entrada, `null`), espião em `bypassSecurityTrustHtml` (R3), classes do *host*, `renderedHtml()`/`error()`.
- `styles-restore.spec.ts`: H8 (elementos com `style` reaplicados por CSSOM depois de cada inserção; nada no servidor).
- `table-scroller.spec.ts`: H7 com `ResizeObserver` falso (entra e sai do transbordo, rótulo, desconexão no `destroy`, nada no servidor).
- `toc.spec.ts`: R7 (montagem da árvore, ids repetidos, `levels`, vazio, `href` com a base, rótulo).
- `ssr.spec.ts` (`// @vitest-environment node`): R8 com `renderApplication` (conteúdo, rolador sem `tabindex`, sumário, erro de *provider* ausente no servidor).
- `labels.spec.ts`, `templates.spec.ts`, `lint-guards.spec.ts`, `css.spec.ts` (Node: `render.css` só com `--rte-*`, camadas, `forced-colors`, sem `!important`; `content.css` com as regras novas da H13), `index.spec.ts`/`api.spec.ts` (exports da §4 nos dois entries).
- Core: o teste de cobertura do `content.css` (05b1) passa a cobrir `.rt-task > label` e `caption`.

### 6.2 Navegador real (Playwright, Chromium, Firefox e WebKit; app `e2e/angular/app` com CSP estrita, *prerender*, hidratação, *builds* zoneless e zone)

Rotas novas: `render` (diretiva em `sanitize` com `createSanitizer` das opções do editor da rota `content`, fixture `all-features`, uma tabela larga, sumário, botões de idioma, modo `trusted`, entrada do corpus de XSS, `fragmentLinks`; rota aninhada `render/artigo` para as âncoras com `<base href="/">`) e `render-tt` (o `serve.mjs` acrescenta os cabeçalhos de *Trusted Types* só nela). Mídia do fixture (`example.com`) respondida por `context.route` (sem rede). Em `e2e/angular/`:

- **L1 segurança** (`render-security.spec.ts`): R3 (fixture byte a byte, corpus e gerador hostil, ouvinte de CSP com controle positivo, `trusted` exibe o que recebe).
- **L2 SSR e hidratação** (`render-ssr.spec.ts`): R8 (HTML do servidor, JS desligado, hidratação sem `NG05xx` nos dois *builds*, pré-voo da H10).
- **L3 equivalência** (`render-equivalence.spec.ts`): R9 e R5 (editor × render, claro e escuro, estilos e geometria; clique em `video`/`iframe`).
- **L4 CSP e *Trusted Types*** (`render-csp.spec.ts`): R10 e R5 (violações esperadas só de `style-src-attr`; rota `render-tt`).
- **L5 acessibilidade e rolador** (`render-a11y.spec.ts`): R6, R11, R12 (axe em claro, escuro e `forced-colors` emulado com recarga, como o N14; `Tab`/setas no rolador; troca de idioma ao vivo).
- **L6 sumário e âncoras** (`render-toc.spec.ts`): R7 no navegador (clique, `:target`, `scroll-margin`, URL, ponto de partida do `Tab`, rota aninhada).
- **L7 desempenho** (`render-perf.spec.ts`): R14 informativo e contador de *ticks* ao redimensionar (R13).
- N1–N26 do `rte-angular` e S1–S3 do sanitizador continuam verdes.

## 7. Critérios de aceite

- [x] H2 feito: `feat/spec-04` integrada (merge 9c34da0 e correção bb13502), conflitos resolvidos, suítes do sanitizador verdes na `feat/spec-06` (`e2e/sanitizer` nos 3 motores: Chromium 6, Firefox 5 + 1 pulado, WebKit 5 + 1 pulado; o pulado é o R10, só Chromium).
- [x] `npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size --parallel=1` verde (Tarefa 13: 33 tarefas, 9 min 34 s; `render:size`, `core:size`, `angular:size` e `verify-package` de `render` verdes; a única falha, `angular:test-zone` em `editor.lifecycle.spec.ts` "alternar o editor 100×", estourou os 30 s sob carga da máquina compartilhada e passa isolada, 12/12); `check:rules`, `check:licenses`, `notices` sem *drift*, `test:tools` (84/84) e `typecheck:e2e` verdes.
- [x] Unitários 6.1 verdes nos alvos `test` e `test-zone` (`render` 237/237 nos dois depois da revisão final, eram 207; core 1099), inclusive a propriedade da R4.
- [x] L1–L7 verdes em Chromium, Firefox e WebKit, N1–N26 e S1–S3 sem regressão (regressão completa final, `fbb3223`: Chromium 480, Firefox 468, WebKit 468 aprovados, **0 falhas**; nas corridas anteriores da Tarefa 12 houve 1 *flake* de carga no Firefox e 1 no WebKit, ambos passando isolados). **Falta o CI do PR.**
- [x] ADR 0012 (`docs/decisions/0012-renderizacao.md`) registra H1–H21, os *rulings*, o pré-voo da H10, os números da R14 (navegador: mediana/p95 por motor na seção (d)) e os tamanhos (H21); pendência do ADR 0010 (rolador) marcada como atendida; README do `rte-render`, `docs/security.md`, `CLAUDE.md`, `docs/specs/README.md` (06 concluída) e changesets atualizados.

## 8. Consequências para outras specs

- **Spec 07:** a demo e o site de docs exibem conteúdo com `[rteContent]` e `provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) })`; o `examples/server-node` sanitiza na gravação com as mesmas opções (ADR 0006) e pode servir o HTML já sanitizado para o modo `trusted` e o sumário pré-calculado com `extractToc`.
- **Spec 08:** regressão visual por captura de tela editor × página (H20 deixa a comparação de imagens para lá); matriz de motores antigos (`light-dark()`, `ResizeObserver`, roladores focáveis nativos); leitores de tela no sumário e no rolador; o oráculo I1 do sanitizador cobre também a saída da H6.
- **Spec 09:** `SECURITY.md` aponta para a seção de exibição de `docs/security.md`; mudar a H6 ou a H8 é mudança que afeta a segurança (changeset que a descreva).
- **05d:** o `api-extractor` cobre também o `@cds/rte-render`.
- **Core (evolução):** `crossorigin` em `video`/`track` (legendas de outra origem); marcar "decorativa" no HTML (V7 da 05c1); legenda de tabela produzida pelo editor (`caption`, ruling 16 do ADR 0004); realce opcional na exibição (H15).

## 9. Riscos

| Risco | Mitigação |
|---|---|
| A hidratação re-atribuir `innerHTML` e recarregar `iframe`/`video` | Pré-voo da H10 mede; aceito e documentado se ocorrer (conteúdo idêntico); L2 cobre |
| Varredura de *tags* da H6 falhar em HTML não canônico no modo `trusted` | Pré-condição documentada e **de segurança**: em `sanitize` a forma canônica é garantida (S13) e a propriedade da R4 prova; em `trusted` com HTML fora da saída de `createSanitizer` (`<` cru em valor de atributo) a varredura pode fechar um atributo e criar marcação, isto é, executar script (teste "pré-condição" em `prepare-html.spec.ts`); endurecer a varredura é pendência do ADR 0012 |
| Consumidor usar `trusted` com HTML que o servidor não sanitizou | Nome explícito; README e `docs/security.md`; `sanitize` é o padrão e falha alto sem configuração (H4) |
| Sanitizador do navegador com opções diferentes das do servidor | README: o mesmo objeto de opções nos dois lados; o servidor é a autoridade; a diferença só remove mais ou menos, nunca executa |
| CSP do consumidor bloquear os estilos sem JS | H8 reaplica com JS; sem JS a paleta continua (U17) e o resto é documentado |
| `HashLocationStrategy` quebrar as âncoras | Documentado; `fragmentLinks: 'keep'` |
| Conteúdo antigo acima dos limites do sanitizador sumir da página | H5: `error()` para o consumidor mostrar alternativa; limites folgados (1 MB, 256) |
| Divergência visual editor × página | Um só `content.css`; R9 (estilo e geometria) nos 3 motores; captura de tela na spec 08 |
| Custo do `htmlparser2` numa página pública (~32 kB com sanitizador e sumário) | Cenário `page` medido (H21); `trusted` sem sumário não o carrega; o servidor pode pré-calcular o sumário com `extractToc` |
| Profundidade do ponto de inserção + `maxDepth` > 512 (hipótese 3 de `docs/security.md`) | README: manter o padrão 256 e o conteúdo a menos de ~250 níveis da raiz do documento |
