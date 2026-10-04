# Spec 05a — Componente, formulários e base (`@cds/rte-angular`)

> Parte 1 de 4 da spec 05 (ver `05-editor-angular.md`). Depende da 03c (concluída: fábrica, `getRteHtml`, getters de estado, placeholder e limite) e da 02 (tokens do `theme.css`). **Não** depende do sanitizador (spec 04): nada desta parte importa `@cds/rte-sanitizer`. Consumida pelas partes 05b, 05c e 05d, que constroem a interface sobre o componente, a ponte de signals, os rótulos e o CSS daqui.
> Decisões tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro". Fatos de pacotes conferidos em `node_modules` em 2026-10-04: `@angular/{core,common,forms,build,compiler-cli}` 22.2.1, `ng-packagr` 22.1.1, Vitest 4.1.11, Playwright 1.63.0, Tiptap 3.31.4; `@angular/forms/signals` exporta `FormValueControl`, `FormUiControl`, `form`, `required`, `maxLength`, `debounce`, `metadata`, `MAX_LENGTH`, `REQUIRED` e `[formField]` como `@publicApi 22.0` (estáveis); `@angular/aria`, `@angular/platform-server`, `@angular/ssr` e `zone.js` **não** estão instalados.

## 1. Objetivo

Entregar o componente `rte-editor` **sem barra de ferramentas**: o `Editor` do Tiptap criado só no navegador com a fábrica do core, a **ponte Tiptap → signals**, a integração com **Signal Forms** (caminho principal), **Reactive/Template Forms** (compatibilidade) e `[(value)]`, o valor canônico (`getRteHtml`), `disabled`/`readonly`/`hidden`/`required`/`maxLength`, o nome acessível do editável, os **rótulos** (`RTE_LABELS`, pacotes pt-BR/en/es), os validadores de texto (`rteRequired`, `rteMaxChars`, `rteMaxWords`), o **CSS funcional** do editor sem injeção em tempo de execução (CSP), a casca de SSR, o gancho de teste `/testing` e o **app de teste** que leva o componente ao navegador real nos 3 motores. Com esta parte, um consumidor já edita texto com atalhos de teclado num formulário real.

## 2. Fora de escopo

Barra de ferramentas, menus flutuantes, diálogos (link, idioma, autor, cores), ícones, `@angular/aria`, tema por instância (`[theme]`, `provideRichText({ theme })`) e o CSS de **aparência** dos blocos `rt-*` (05b); upload, diálogos de mídia, colar/soltar arquivos, `mediaChange`, rascunho e `isDirty`/`markSaved` (05c); menu `/` visual, barra de busca, contadores na tela e `aria-live` (05d; nesta parte `search` e `slashCommands` ficam **desligados**, ver D1); validadores `rteImagesHaveAlt`, `rteUploadsFinished`, `rteSafeLinks`, `rteNoEmptyHeadings` (05c/05d); `updateOn`/adiamento da serialização (05d, decidido pelos números do N8); formato JSON do valor (fora da spec 05, D7); hidratação incremental, matriz Angular × Tiptap e orçamentos finais de desempenho (05d e spec 08); `api-extractor` (05d).

## 3. Decisões

Cada uma com o motivo. Divergências na execução viram o **ADR 0007** (componente e formulários; o 0006 é do sanitizador, em outro branch).

| # | Decisão | Motivo |
|---|---|---|
| D1 | Nesta parte o componente **força** `features.search: false` e `features.slashCommands: false` (valor do consumidor ignorado, com aviso em `isDevMode()`); a 05d os libera junto com a UI. | Sem UI, o menu `/` abriria invisível e capturaria `Enter`/setas (C16 da 03c); a busca ficaria sem barra. |
| D2 | `new Editor(...)` direto (sem `ngx-tiptap`), criado em `afterNextRender` e **fora da zona** (`NgZone.runOutsideAngular`; no-op sem zone.js), destruído por `DestroyRef`; nunca no servidor. Opções fixas: `injectCSS: false`, `element` = um `div` do template, `editable` inicial vindo de `disabled`/`readonly`, `content` = `value()` no momento da criação. | Decisão de 2026-10-02 (README das specs); SSR sem DOM (R11 da spec 05 antiga); CSP (ADR 0004); com zone.js, cada evento do ProseMirror dentro da zona dispararia uma detecção de mudanças da app inteira. |
| D3 | Saídas e *callbacks* do consumidor (`value`, `touch`, `editorReady`, `editorFocus`, `editorBlur`) são emitidos **dentro** da zona (`NgZone.run`). | Em apps com zone.js, um ouvinte que muda estado comum (não signal) precisa disparar a detecção; signals notificam o agendador nos dois modos. |
| D4 | **Ponte de signals:** um único ouvinte de `transaction` do `Editor` incrementa um signal de versão; todo estado exposto é `computed` sobre essa versão **com função de igualdade**; a instância do `Editor` fica num campo comum e num signal raso (`editor`), nunca dentro de signal profundo. Sem `effect` para estado derivado; `effect` só para empurrar entradas ao editor (editável, atributos, rótulos). | Spec 05 antiga R1; `computed` com igualdade evita notificar quando o valor não muda; combina com os getters memoizados por `EditorState` (C18). |
| D5 | **Um contrato, sem CVA:** `RteEditor` implementa `FormValueControl<string>` e **nenhuma** classe do pacote provê `NG_VALUE_ACCESSOR`. Signal Forms (`[formField]`), Reactive Forms (`formControlName`, `[formControl]`) e Template Forms (`[(ngModel)]`, com `name` num `form` ou `standalone`) usam o caminho **nativo** de controle customizado do `@angular/forms` 22.2. | Lido no `@angular/forms` 22.2.1 e provado em teste (Tarefa 7): o `NgControl.ngControlCreate` (`fesm2022/forms.mjs`), sem CVA no elemento e com `host.customControl`, segue o caminho de controle customizado (`listenToCustomControlModel` → `setValue` + `markAsDirty`; saída `touch` → `markAsTouched`; `ngControlUpdate` liga `value`, `touched`, `dirty`, `valid`, `invalid`, `pending`, `disabled`, `required` e `errors` às entradas). Um `NG_VALUE_ACCESSOR` no elemento **vence** esse caminho (`hasCva`), tanto no `NgControl` quanto no `FormField` (`ɵngControlCreate`), e perderia `required`, `maxLength`, `readonly`, `hidden`, `invalid` e `touched`; por isso a diretiva CVA da versão anterior desta spec saiu. A lição 2 (NG01203 sem CVA) não se aplica mais desde o 22.2 (o piso dos peers). Resolve o S1 da spec 05 antiga. |
| D6 | **Valor = `getRteHtml(editor)`**; documento vazio (um único `paragraph` sem conteúdo, mesma definição do R4 da 03c) = **`''`**. Entrada `null`/`undefined` (`setValue(null)`, `reset`) vale `''`. | HTML canônico, igual em Node, jsdom e nos 3 motores (B7); com `''` o `required` nativo e "sem conteúdo" concordam e o banco não guarda `<p></p>`. |
| D7 | Só **HTML**; sem `format: 'json'`. Quem precisa do JSON lê `editor()?.getJSON()`. | Um formato canônico só; JSON não passa pela leitura validada (B9) e seria um segundo contrato a manter. |
| D8 | **Emissão síncrona:** cada transação que muda o documento e não é carga externa escreve `value` (se o HTML mudou); transações só de *meta*, de seleção, `setEditable` e as da carga externa (inclusive as anexadas por `appendTransaction` no mesmo `dispatch`) **não** emitem. Sem *debounce* nesta parte. | Valor nunca defasado (um `submit` por atalho com o foco no editor vê o último texto); o adiamento do modelo já existe no Signal Forms (`debounce(path, ms \| 'blur')`); o custo de serializar por tecla é **medido** no N8 e a 05d decide com dados. |
| D9 | **Valor externo** (mudança de `value` diferente do último HTML emitido ou aplicado): aplicado com `setContent` numa transação **fora do histórico** (`addToHistory: false`), sem emitir e sem focar; o HTML canônico resultante **não** é escrito de volta no modelo; o último valor conhecido passa a ser o canônico. Igual ao último → ignorado. | Sem laço `value → editor → value`; carregar não marca o formulário como alterado; `undo` não volta ao documento anterior à carga. |
| D10 | **Estado do formulário → editor:** editável = `!disabled && !readonly` (`setEditable(…, false)`, sem evento `update`). `disabled`: sem `tabindex` (fora da ordem de foco), `aria-disabled="true"`. `readonly`: `tabindex="0"`, `aria-readonly="true"`, texto selecionável. `hidden`: atributo `hidden` no *host*. `required`: `aria-required`. O placeholder continua visível em `readonly`/`disabled` (C3). | Mesma semântica de `input` nativo; leitor de tela anuncia o estado. |
| D11 | **`touched` e foco:** `touch`, `editorFocus` e `editorBlur` seguem o foco do **host** inteiro: `focusin` vindo de fora do host emite `editorFocus`; `focusout` cujo `relatedTarget` está fora do host (ou é `null`) emite `editorBlur` e `touch`. Foco que anda entre partes internas (toolbar, diálogos das partes seguintes, que ficam dentro do host) não emite. | Regra 3 da spec 05 antiga; vale para as partes seguintes sem mudar o contrato. |
| D12 | **`maxLength` vira `charLimit`** por função (`() => maxLength()` válido, senão `null`), lida a cada verificação (lição 4); a opção `charLimit` do core não é exposta. O `maxLength()` nativo do Signal Forms **não** é recomendado (mede a string HTML); `rteMaxChars` mede o texto (C5) e publica o limite em `MAX_LENGTH`, que chega à entrada `maxLength`. | Consequência da 03c §8; uma fonte só para o limite; o formulário fica inválido em vez de truncar (C6). |
| D13 | `aria-invalid="true"` só com `invalid() && touched()`; o componente **não** desenha mensagens de erro: `ariaDescribedBy` liga o editável às mensagens do host, e `formatRteError` (entry `/validators`) as traduz pelos rótulos. | Não anuncia "inválido" antes da interação; o leiaute dos erros é do formulário do host; evita anúncio duplicado. |
| D14 | **Validadores no entry `@cds/rte-angular/validators`**: `rteRequired`, `rteMaxChars`, `rteMaxWords` (Signal Forms) e `RteValidators` (Reactive Forms), medindo `htmlToText(value)` de `@cds/rte-core/html` com a regra do C5; erros **tipados**, sem `message` (`kind` + parâmetros). `rteRequired` publica `REQUIRED`. | `/html` puxa o `htmlparser2` (≈ 31 kB gzip): fora do caminho do componente; o servidor e o validador dão o mesmo número; erros traduzidos na hora de exibir. |
| D15 | **Rótulos:** `RteLabels` = `content` (`RteContentLabels` do core) + `slash` (`RteSlashLabels` do core) + `editor` + `errors`; token `RTE_LABELS` com `Signal<RteLabels>`. Fonte = objeto parcial **ou função** (lida dentro de `computed`, então pode ler signals: troca de idioma em tempo de execução). Prioridade: entrada `labels` > `provideRichText({ labels })` > `en`. Mudança de rótulos despacha uma transação só de *meta* (placeholder, títulos de caixa, nome das tarefas). Pacotes completos e congelados `RTE_LABELS_EN`, `RTE_LABELS_PT_BR`, `RTE_LABELS_ES` no entry `/i18n` (o `en` também embutido no `.`, como padrão). | Um objeto tipado de todas as strings (spec 05 antiga §5.6); compõe as fontes do core sem duplicar (C17); só os idiomas importados entram no bundle; consequência R4 da 03c. |
| D16 | **CSS sem injeção:** nenhum componente tem `styles`/`styleUrl` e o Tiptap roda com `injectCSS: false`; o CSS vem num arquivo do pacote, `@cds/rte-angular/styles/editor.css`, que o consumidor inclui (por exemplo em `angular.json` → `styles`) depois de `@cds/rte-theme/theme.css`. `ViewEncapsulation.None`; classes `rte-*` (BEM) são API pública. O entry TypeScript `/styles` do esqueleto (vazio) é **removido**. | Funciona com `style-src 'self'` sem *nonce*; ordem de camadas sob controle do consumidor; SSR entrega `<link>`; um entry JS vazio só confunde `attw`/`publint`. |
| D17 | `editor.css` cobre o **funcional** do editor: moldura, editável (`white-space: pre-wrap`, foco visível com `--rte-focus`/`--rte-focus-width`), placeholder (`::before { content: attr(data-placeholder) }`), tarefas (`rte-task__check`, `rte-task__text`), alças e seleção da imagem (`rte-image__handle--*` com `touch-action: none`, `rte-image--selected`), tabelas em edição (`tableWrapper`, `selectedCell`, `column-resize-handle`, `resize-cursor`), `ProseMirror-selectednode`, `ProseMirror-gapcursor`, cursor de soltar, realce `hljs-*` sobre `--rte-code-*`, `rte-search-match(--active)` e `rte-slash-query`. **Toda** classe `rte-*` emitida pelo core tem regra (teste). A aparência dos blocos `rt-*` (caixas, citação, "Leia também", figuras) é da 05b, num CSS de conteúdo compartilhado com a spec 06. | Consequências do ADR 0004 (alças, tarefas, `hljs-*`) e da 03c (placeholder, busca, `/`); sem isso a edição fica quebrada visualmente; aparência é outra entrega. |
| D18 | **Camadas:** a moldura em `@layer rte.components`, as regras dentro de `.rte-content` em `@layer rte.content`; o arquivo declara a mesma ordem do tema (`rte.reset, rte.base, rte.theme, rte.components, rte.content`). Sem `!important`, sem `::ng-deep`. O *host* tem `class="rte-root rte-editor"` (os tokens do tema valem nele). | Spec 02 R4: CSS do consumidor sem camada vence; a ordem não depende de qual arquivo carrega primeiro. |
| D19 | **SSR = casca:** no servidor o template renderiza a moldura e um editável **falso** (`role="textbox"`, nome acessível, `aria-readonly="true"`, `aria-busy="true"`) com o placeholder quando `value` é `''`; o HTML do valor **não** é renderizado. No navegador a casca sai quando o `Editor` está pronto. | O servidor não tem `DOMParser` para a leitura do esquema; injetar HTML não confiável sem sanitizador é inseguro; a exibição sem JS é o papel do `rte-render` (spec 06); uma prévia em texto puxaria o `htmlparser2` para o bundle do cliente. |
| D20 | **Opções de criação** (`options` e `provideRichText({ editor })`) são lidas **uma vez**, na criação; mudar `options` depois não recria o editor e avisa em `isDevMode()`. Mescla: instância > provider > padrões do core; `features` e `linkPolicy` por chave; listas (`extensions`, `codeLanguages`, `embedProviders`) a da instância substitui. | Recriar perde seleção e histórico; extensões do Tiptap são fixas por instância. |
| D21 | **Zoneless primeiro, zone.js suportado:** nada importa `zone.js`; a suíte unitária roda nos dois modos (`test` zoneless e `test-zone` com `zone.js` + `provideZoneChangeDetection()`), e o app de teste tem os dois *builds*. | S4 da spec 05 antiga; apps existentes ainda usam zone.js. |
| D22 | **Pilha de testes:** unitários com o executor do esqueleto (`@nx/angular:unit-test` → *builder* `unit-test` do `@angular/build`, Vitest 4 + jsdom, TestBed); SSR em Node com `renderApplication` de `@angular/platform-server`; navegador real com um **app de teste Angular** (`e2e/angular/app`, *prerender* + hidratação) servido com **CSP estrita** por um servidor estático próprio, iniciado pelo `webServer` do Playwright via Nx (build em cache). | O executor já está no esqueleto; o Tiptap real roda em jsdom (B21); a lição 12 exige navegador real; o *prerender* prova a casca e a hidratação; CSP por cabeçalho prova D16. |
| D23 | **Gancho de teste:** o *host* recebe a propriedade `Symbol.for('@cds/rte-angular/editor')` com o `Editor` (removida no destroy); `getRteEditor(host)` no entry `/testing` a lê. Nada de `ng.getComponent`. | Funciona em *build* de produção e entre bundles (`Symbol.for`); o modelo dependia de *build* de desenvolvimento (plano §9.1). |
| D24 | **Dependências:** peers `@angular/{core,common,forms}` `>=22.2.0 <23` (piso = versão testada até a matriz da spec 08 provar o 22.0); `@cds/rte-core` e `@cds/rte-theme` `0.0.0`; todos os peers Tiptap do core + `lowlight` e `highlight.js` **obrigatórios** (B4). `zone.js` não é peer. Novas devDependencies exatas na raiz: `@angular/platform-server`, `@angular/ssr` (22.2.1), `zone.js`, `axe-core`/`@axe-core/playwright` (MPL-2.0, só dev: o gate de licenças lê o conjunto de produção). | Testar só o que se suporta (como B5); uma cópia do ProseMirror (B3/B4); o tema é dependência de CSS, não de código. |
| D25 | **Guardas por lint** em `packages/angular`: proibidos os decoradores `@Input`/`@Output`/`@HostListener`/`@HostBinding`, `ngOnChanges`, `ChangeDetectorRef.detectChanges`, import de `zone.js`, globais `document`/`window` fora de `inject(DOCUMENT)`/`afterNextRender`, e `setTimeout`/`requestAnimationFrame` para forçar detecção; `prefer-on-push-component-change-detection` obrigatório. Texto fixo em template é barrado por teste (só interpolação de rótulos). | Spec 05 antiga R2 e §5.6, verificados por máquina e não por revisão. |
| D26 | **Orçamento de tamanho** por cenário, como no core: `packages/angular/size-budget.json` sobre a FESM do `dist` (Angular, Tiptap, `@cds/rte-*`, `lowlight` e `highlight.js` externos), alvo `size` no `project.json`; orçamento = `ceil(medido × 1,15 / 64) × 64` (ADR 0003). O tamanho total no app (com *linker*, core e Tiptap) é medido no *build* do app de teste e registrado (informativo). | Mesmo método do repositório; a FESM parcial não é o número final, por isso o total vem do app. |

## 4. API

```ts
// @cds/rte-angular (entry `.`)
import type { EnvironmentProviders, InjectionToken, InputSignal, InputSignalWithTransform,
  ModelSignal, OutputEmitterRef, Signal } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import type { Editor } from '@tiptap/core';
import type { RteCharLimitState, RteContentLabels, RteEditorOptions, RteSlashLabels,
  RteSlashOptions } from '@cds/rte-core/extensions';

/** Opções lidas só na criação (D20). `placeholder`, `charLimit` e `labels` vêm de entradas. */
type RteEditorConfig = Omit<RteEditorOptions, 'placeholder' | 'charLimit' | 'labels' | 'slash'> & {
  slash?: Omit<RteSlashOptions, 'labels'>;
};

interface RteEditorLabels {
  /** Nome acessível do editável sem `ariaLabel` nem `ariaLabelledBy`. */
  ariaLabel: string;
}
interface RteErrorLabels {
  rteRequired: string;
  rteMaxChars(error: { max: number; actual: number }): string;
  rteMaxWords(error: { max: number; actual: number }): string;
}
interface RteLabels {
  readonly content: RteContentLabels;
  readonly slash: RteSlashLabels;
  readonly editor: RteEditorLabels;
  readonly errors: RteErrorLabels;
}
interface RteLabelsInput {
  content?: Partial<Omit<RteContentLabels, 'calloutTitles'>> & {
    calloutTitles?: Partial<RteContentLabels['calloutTitles']>;
  };
  slash?: Partial<RteSlashLabels>;
  editor?: Partial<RteEditorLabels>;
  errors?: Partial<RteErrorLabels>;
}
/** Objeto parcial ou função lida dentro de `computed` (pode ler signals) (D15). */
type RteLabelsSource = RteLabelsInput | (() => RteLabelsInput);

interface RteConfig {
  labels?: RteLabelsSource;
  /** Padrões de criação para toda instância (D20). */
  editor?: RteEditorConfig;
}
/** Opcional: sem ele, rótulos `en` e padrões do core. Em `bootstrapApplication` ou em `providers` de rota. */
function provideRichText(config?: RteConfig): EnvironmentProviders;
/** Rótulos do provider já mesclados sobre `en` (sem a entrada da instância). */
const RTE_LABELS: InjectionToken<Signal<RteLabels>>;

// selector 'rte-editor', exportAs 'rteEditor', OnPush, ViewEncapsulation.None
// host: class="rte-root rte-editor" e modificadores rte-editor--disabled|--readonly|--focused|--invalid
class RteEditor implements FormValueControl<string> {
  // Contrato de controle (preenchido pelo [formField]; utilizável sem formulário)
  readonly value: ModelSignal<string>;                                  // padrão ''
  readonly disabled: InputSignalWithTransform<boolean, unknown>;        // booleanAttribute
  readonly readonly: InputSignalWithTransform<boolean, unknown>;
  readonly hidden: InputSignalWithTransform<boolean, unknown>;
  readonly required: InputSignalWithTransform<boolean, unknown>;
  readonly invalid: InputSignalWithTransform<boolean, unknown>;
  readonly touched: InputSignalWithTransform<boolean, unknown>;
  readonly maxLength: InputSignal<number | undefined>;                  // → charLimit (D12)
  readonly touch: OutputEmitterRef<void>;
  /** Foca o editável; antes da criação, guarda o pedido e foca ao criar. */
  focus(options?: FocusOptions): void;

  // Configuração
  readonly placeholder: InputSignal<string>;                            // padrão '' (C3)
  readonly ariaLabel: InputSignal<string | undefined>;
  readonly ariaLabelledBy: InputSignal<string | undefined>;             // vence `ariaLabel`
  readonly ariaDescribedBy: InputSignal<string | undefined>;
  readonly labels: InputSignal<RteLabelsSource | undefined>;
  readonly options: InputSignal<RteEditorConfig | undefined>;           // só na criação

  // Saídas
  readonly editorReady: OutputEmitterRef<Editor>;
  readonly editorFocus: OutputEmitterRef<void>;
  readonly editorBlur: OutputEmitterRef<void>;

  // Estado (somente leitura)
  readonly editor: Signal<Editor | null>;                               // null antes da criação e no SSR
  readonly isEmpty: Signal<boolean>;
  readonly isFocused: Signal<boolean>;
  readonly textStats: Signal<RteCharLimitState | null>;                 // getCharLimitState (C5)
}

// Sem CVA (D5): `formControlName`, `[formControl]` e `[(ngModel)]` ligam o RteEditor pelo
// caminho nativo de controle customizado do @angular/forms 22.2; nenhum NG_VALUE_ACCESSOR.

// @cds/rte-angular/i18n
const RTE_LABELS_EN: RteLabels;      // congelados; content/slash = RTE_CONTENT_LABELS/RTE_SLASH_LABELS do core
const RTE_LABELS_PT_BR: RteLabels;
const RTE_LABELS_ES: RteLabels;

// @cds/rte-angular/validators
import type { LogicFn, PathKind, SchemaPath, SchemaPathRules, ValidationError } from '@angular/forms/signals';
import type { ValidatorFn } from '@angular/forms';
interface RteRequiredError extends ValidationError { readonly kind: 'rteRequired' }
interface RteMaxCharsError extends ValidationError { readonly kind: 'rteMaxChars'; readonly max: number; readonly actual: number }
interface RteMaxWordsError extends ValidationError { readonly kind: 'rteMaxWords'; readonly max: number; readonly actual: number }
type RteValidationError = RteRequiredError | RteMaxCharsError | RteMaxWordsError;
type RtePath<K extends PathKind> = SchemaPath<string, SchemaPathRules.Supported, K>;
function rteRequired<K extends PathKind = PathKind.Root>(path: RtePath<K>,
  config?: { when?: LogicFn<string, boolean, K> }): void;               // + metadado REQUIRED
function rteMaxChars<K extends PathKind = PathKind.Root>(path: RtePath<K>,
  max: number | LogicFn<string, number | undefined, K>): void;          // + metadado MAX_LENGTH
function rteMaxWords<K extends PathKind = PathKind.Root>(path: RtePath<K>,
  max: number | LogicFn<string, number | undefined, K>): void;
const RteValidators: {
  readonly required: ValidatorFn;                    // { rteRequired: true }
  maxChars(max: number): ValidatorFn;                // { rteMaxChars: { max, actual } }
  maxWords(max: number): ValidatorFn;                // { rteMaxWords: { max, actual } }
};
function isRteValidationError(error: ValidationError): error is RteValidationError;
function formatRteError(error: RteValidationError, labels: RteLabels): string;

// @cds/rte-angular/testing
function getRteEditor(host: Element): Editor | null;   // D23

// @cds/rte-angular/styles/editor.css  (arquivo CSS exportado; sem JS)
```

- **Regras de medida dos validadores (C5):** `t = htmlToText(value)`; caracteres = `countCharacters(t)`, palavras = `countWords(t)` (iguais a `textStats()` para o mesmo documento). `rteRequired` passa quando `t` tem um caractere que não é espaço **ou** o HTML tem `img`, `video` ou `iframe`; o rótulo que a serialização escreve num título vazio de caixa conta como texto (é publicado). O último par valor→medida fica em cache (um *parse* por valor, mesmo com os três validadores). `max` inválido (não inteiro, negativo) = sem limite, nunca lança.
- **`textStats`:** `getCharLimitState(editor)`; `readingTime` fica com quem exibe (`readingTime(words)` do core).
- **Atributos do editável** (o `.ProseMirror`, com a classe `rte-content`): `role="textbox"`, `aria-multiline="true"`, `aria-labelledby` **ou** `aria-label` (`ariaLabel()` ?? `labels.editor.ariaLabel`), `aria-describedby`, `aria-required`, `aria-invalid` (D13), `aria-readonly`/`aria-disabled` e `tabindex` (D10), além do `aria-placeholder` do core. Mudanças de entrada aparecem no mesmo ciclo, sem transação de documento.
- **`provideRichText`** pode ser chamado mais de uma vez em injetores aninhados (rota): o mais próximo vence, sem mescla entre níveis.

## 5. Requisitos

- **R1. Pacote.** Entries `.`, `/i18n`, `/validators` e `/testing` (ng-packagr) com `index.ts` explícito; `styles/editor.css` exportado como arquivo (`exports["./styles/editor.css"]`); `sideEffects` declara só `*.css`; `@cds/rte-core` só pelos aliases do `tsconfig.base.json`; `.` não importa `@cds/rte-core/html` (só `/validators`); dependências conforme D24, sem `ignoredDependencies` sobrando no `dependency-checks` (o `@cds/rte-theme`, peer só de CSS, fica na lista com comentário). `verify-package` (publint + attw) verde.
- **R2. Ciclo de vida (D2).** Nenhum `Editor` antes do primeiro render nem no servidor; criação com a fábrica, `injectCSS: false`, `search`/`slashCommands` desligados (D1), `placeholder`, `charLimit` e `labels` por função; `editorReady` emitido uma vez com a instância; destruir o componente destrói o `Editor`, remove ouvintes e o gancho (D23). Nenhuma propriedade `clipboardParser`/`domParser` é definida (o `RteDOMParser` do core vale, decisão 27 do ADR 0004).
- **R3. Ponte de signals (D4).** Uma transação incrementa a versão uma vez; `isEmpty`, `isFocused` e `textStats` só notificam quando o valor muda (teste com contador de `effect`); ler o estado não serializa o documento.
- **R4. Valor (D6–D9).** Digitar escreve `getRteHtml` em `value` na mesma tarefa; apagar tudo escreve `''`; seleção, foco, `setEditable`, rótulos e carga externa não escrevem; valor externo igual ao último é ignorado, diferente é aplicado fora do histórico sem eco; `undo` logo depois da carga não volta ao documento anterior.
- **R5. Signal Forms (D5, D10–D13).** Com `[formField]`: `required`, `disabled` (inclusive com motivo), `readonly`, `hidden`, `invalid`, `touched` e `maxLength` do schema chegam às entradas e se refletem como em D10/D13; `touch` só quando o foco sai do host; `focus()` funciona (`FormUiControl.focus`); `reset` do formulário leva o editor a `''`; nenhuma ligação `[disabled]`/`[readonly]`/`[maxLength]` junto de `[formField]` aparece nos exemplos (NG8022 documentado no README).
- **R6. Compatibilidade (D5).** Sem diretiva nem CVA, `formControlName`, `[formControl]` e `[(ngModel)]` (com `name` num `form` e `standalone`) pelo caminho nativo: digitar escreve o controle e o deixa `dirty`; `setValue` chega ao editor sem emitir de volta (controle `pristine`); `setValue(null)` vale `''`; `markAsTouched` e o `focusout` para fora do host (D11) tocam; `disable()`/`enable()` ligam o editável e os checkboxes das tarefas; `Validators.required` (ou o atributo `required` com `ngModel`) chega a `required()`/`aria-required`; erros do controle (`RteValidators`) chegam a `invalid()` e, com `touched`, ao `aria-invalid`; nenhum `NG_VALUE_ACCESSOR` no elemento.
- **R7. Limite (D12).** `maxLength` (de `rteMaxChars`, do `maxLength` nativo ou ligado direto sem formulário) vira o limite do `rtCharLimit` sem recriar extensões; mudar o valor vale na verificação seguinte; inválido = sem limite; conteúdo externo acima do limite fica com `textStats().overLimit` e o formulário inválido, sem corte.
- **R8. Rótulos (D15).** Mescla por seção e por chave na prioridade de D15; função que lança ou não devolve objeto vale como ausente (lição 4, como no core); trocar o idioma (signal lido pela função) atualiza no mesmo ciclo, sem editar o texto, o nome acessível, o placeholder, o título vazio de caixa e o nome das tarefas; os três pacotes têm **todas** as chaves, sem string vazia, com o `content`/`slash` idênticos aos do core.
- **R9. Validadores (D14).** Regras de medida da §4, iguais ao `textStats()` do editor para o fixture `all-features` e para documentos gerados; erros tipados; `rteRequired` e `rteMaxChars` publicam `REQUIRED`/`MAX_LENGTH` (o editor recebe `required`/`maxLength` sem ligação manual); `formatRteError` cobre todos os `kind`.
- **R10. CSS (D16–D18).** `editor.css` em camadas, sem `!important`, sem seletor fora de `.rte-root`/`.rte-editor`/`.rte-content` (nada global); toda classe `rte-*` que o core emite (`rte-placeholder`, `rte-placeholder--doc`, `rte-image--selected`, `rte-image__handle`, `--nw|ne|sw|se`, `rte-task__check`, `rte-task__text`, `rte-search-match`, `rte-search-match--active`, `rte-slash-query`) tem regra; cores só por tokens `--rte-*`; foco visível com `outline` de `--rte-focus-width`; `prefers-reduced-motion` desliga transições.
- **R11. CSP.** Com `default-src 'self'; script-src 'self'; style-src 'self'` por cabeçalho, nenhuma violação (`securitypolicyviolation`) ao carregar, hidratar, criar, editar, redimensionar imagem e destruir; nenhum `<style>` novo no documento depois da criação.
- **R12. SSR (D19).** `renderApplication` em Node renderiza a casca (moldura, editável falso com nome acessível, placeholder quando `''`), sem erro, sem acessar `document`/`window` globais e sem o HTML do valor; no navegador, hidratação sem erro (`NG05xx`) e a casca troca pelo editor sem mudar o tamanho da moldura quando `''`.
- **R13. Teclado e foco.** `Tab`/`Shift+Tab` nunca prendem o foco no editável (WCAG 2.1.2): saem do editor num parágrafo, saem da tabela na última/primeira célula (decisão 34 do ADR 0004) e passam pelos checkboxes das tarefas (com a nota do Firefox, decisão 33); atalhos de marca do core (`Mod+B`, `Mod+I`, `Mod+Z`…) funcionam com o teclado real.
- **R14. Zoneless e zone.js (D3, D21).** A mesma suíte unitária verde em `test` e `test-zone`; no *build* com zone.js do app de teste, um ouvinte de `editorBlur` que muda um campo comum (não signal) atualiza a tela.
- **R15. Guardas (D25).** Regras de lint ativas e um teste que falha com texto literal num template do pacote (nós de texto fora de interpolação e `aria-label`/`title`/`placeholder` literais).
- **R16. Tamanho (D26).** Cenários `editor` (`RteEditor`, `provideRichText`), `i18n`, `validators` e `whole` medidos no `npx nx run angular:size` e dentro do orçamento; tamanho inicial do app de teste (com e sem o editor numa rota) registrado no ADR 0007.
- **R17. Documentação.** README do pacote: instalação (peers), CSS (ordem `theme.css` → `editor.css`), os 3 modos de uso com exemplos, NG8022, `maxLength` × `rteMaxChars`, rótulos e troca de idioma, SSR (casca), CSP, gancho de teste e o que fica para 05b–05d. `CLAUDE.md` ganha a seção do Angular (comandos `test-zone`, app de teste, `size`).

## 6. Testes

### 6.1 Unitários (`packages/angular/src/**/*.spec.ts`, `/validators`, `/i18n`, `/testing`; Vitest + jsdom pelo *builder* `unit-test`; alvos `test` e `test-zone`)
- `editor.lifecycle.spec.ts`: nenhum `Editor` antes de `fixture.whenStable()`; opções de criação (`injectCSS: false`, `search`/`slashCommands` desligados com aviso em dev); `editorReady` uma vez; destroy chama `editor.destroy()` e remove o gancho; criar e destruir 100× não deixa `Editor` vivo (contagem pelo gancho e por espião de `destroy`); `options` mudado depois avisa e não recria.
- `editor.value.spec.ts`: R4 completo — digitação por `editor.commands.insertContent`/transações de texto escreve o HTML canônico; vazio → `''`; seleção, `setEditable`, transação só de *meta* e troca de rótulos não emitem; carga externa sem eco, não canônica sem reescrita, fora do histórico (`undo`); `null` → `''`.
- `editor.state.spec.ts`: contadores de notificação de `isEmpty`/`isFocused`/`textStats` (R3); `textStats` igual a `getCharLimitState`.
- `forms.signal.spec.ts`: `form()` com `required`, `rteRequired`, `rteMaxChars`, `disabled` (com motivo), `readonly`, `hidden`; estados D10/D13 nos atributos; `touch` por `focusout` para fora e não para dentro do host; `reset`; `debounce(path, 'blur')` do Signal Forms convive.
- `forms.compat.spec.ts`: `formControlName`, `formControl`, `ngModel` com `name` e `standalone` pelo caminho nativo (R6), sem `NG_VALUE_ACCESSOR`; `Validators.required`; `RteValidators`.
- `labels.spec.ts`: mescla e prioridade; função com signal; função que lança; transação de *meta* na troca; completude dos três pacotes (chaves profundas iguais, nenhuma string vazia, funções devolvem texto não vazio) e igualdade de `content`/`slash` com o core.
- `validators.spec.ts`: regras de medida; cache; `max` inválido; metadados `REQUIRED`/`MAX_LENGTH`; `formatRteError` para cada `kind` nos 3 idiomas; **propriedade** (fast-check, mesmos geradores de documento do core): para documentos gerados, as medidas dos validadores sobre `getRteHtml` são iguais ao `textStats()`.
- `a11y-attrs.spec.ts`: atributos do editável (§4) e sua atualização sem transação de documento.
- `css.spec.ts` (Node): R10 — leitura do `editor.css` (camadas, ausência de `!important` e de seletores globais, regras para a lista de classes do core, tokens só `--rte-*`).
- `templates.spec.ts`: R15 (texto literal em template).
- `testing.spec.ts`: `getRteEditor` antes, durante e depois da vida do editor.
- `ssr.spec.ts` (Node, sem jsdom): R12 com `renderApplication` (nomes reconfirmados no `@angular/platform-server` instalado).

### 6.2 Navegador real (Playwright, Chromium, Firefox e WebKit)
App de teste `e2e/angular/app` (projeto Nx de aplicação, tag `scope:e2e` com permissão para `scope:angular`/`scope:core`; *build* zoneless e *build* `zone`, ambos com *prerender* e hidratação, `inlineCritical` desligado), servido por `e2e/angular/serve.mjs` (Node puro, cabeçalho CSP de R11) e iniciado pelo `webServer` do `e2e/playwright.config.ts` por um alvo Nx que depende do *build* (cache). O app expõe na `window` só o que os testes leem (`getRteEditor`, o valor dos modelos, o estado dos formulários), sem `ng.getComponent`. Em `e2e/angular/`:
- **N1 formulários** (`editor-forms.spec.ts`, nos dois *builds*): três editores (Signal Forms com `rteRequired` + `rteMaxChars` + `disabled` alternável; Reactive Forms; `[(value)]`); digitar com o teclado real atualiza os três modelos com o HTML canônico; botão "carregar" aplica valor externo sem eco nem `dirty`; `Mod+Z` depois da carga não volta ao anterior; `reset`; `touched` só depois de `Tab` para fora (clicar dentro, num controle do host, não marca); no *build* `zone`, o ouvinte de `editorBlur` com campo comum atualiza a tela (R14).
- **N2 estados** (`editor-states.spec.ts`): `disabled` fora da ordem de `Tab` e não editável; `readonly` focável, selecionável, não editável, placeholder visível; `hidden` some; limite: digitar além do `rteMaxChars` é recusado e o formulário fica válido, carga acima fica inválida sem corte; apagar tudo dá `''` e `rteRequired` inválido.
- **N3 rótulos** (`editor-labels.spec.ts`): trocar en → pt-BR → es em tempo de execução muda nome acessível, placeholder (`::before` computado), título vazio de caixa e nome do checkbox da tarefa, sem editar e sem emitir valor.
- **N4 SSR e hidratação** (`editor-ssr.spec.ts`): HTML bruto da rota (`request.get`) com a casca, o nome acessível e o placeholder, sem `.ProseMirror` e sem o HTML do valor; depois de carregar, editor funcional, sem mensagens `NG05` no console e moldura com o mesmo tamanho.
- **N5 CSP e CSS** (`editor-csp.spec.ts`): R11 (ouvinte de `securitypolicyviolation` desde o início, contagem de `<style>`); com o fixture `all-features`: placeholder visível, alças da imagem visíveis na seleção com `touch-action: none` e arrasto que redimensiona, checkbox da tarefa clicável, `column-resize-handle` na borda da coluna, cor de `hljs-keyword` = `--rte-code-keyword` computado, foco visível (`outline-width` = `--rte-focus-width`) em claro e escuro.
- **N6 acessibilidade e teclado** (`editor-a11y.spec.ts`): axe (`@axe-core/playwright`) sem violações `serious`/`critical` na página com os três editores, em claro e escuro; R13 com o teclado real (`Tab`/`Shift+Tab` a partir do parágrafo, da última/primeira célula e de uma tarefa); `role`, `aria-multiline` e nome acessível presentes.
- **N7 ciclo de vida** (`editor-lifecycle.spec.ts`): alternar o editor numa `@if` 100×: número de `.ProseMirror`/`[contenteditable]` volta ao inicial e `getRteEditor` do host removido é `null`; no Chromium, heap depois de coleta forçada (CDP) registrado (informativo).
- **N8 desempenho** (`editor-perf.spec.ts`, informativo): documento de 20 mil palavras; tempo da criação (do `afterNextRender` ao `editorReady`) e custo por tecla com a emissão síncrona (transação + `getRteHtml` + escrita no `[formField]` com `rteMaxChars`), mediana e p95 nos 3 motores, registrados no ADR 0007 para a decisão de `updateOn` da 05d.

## 7. Critérios de aceite

- [ ] `npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size` verde; `npm run check:rules`, `check:licenses` (sem dependência de produção nova fora da allowlist), `notices` sem drift, `test:tools` e `typecheck:e2e` verdes.
- [ ] Unitários 6.1 verdes nos alvos `test` e `test-zone`, inclusive a propriedade de igualdade de medida (R9) e o teste de SSR (R12).
- [ ] N1–N8 verdes em Chromium, Firefox e WebKit (`npx playwright test -c e2e`) e no CI (o `nx affected` do workflow ganha `test-zone`; o *build* do app de teste roda pelo `webServer` ou num passo explícito antes do Playwright).
- [ ] Números do N7/N8 e do tamanho (R16) registrados no ADR 0007; orçamento `angular:size` definido pela regra de D26.
- [ ] ADR 0007 registra D1–D26, os desvios e as pendências; README do pacote e `CLAUDE.md` atualizados (R17); `docs/specs/README.md` marca a 05a como concluída; changeset do `@cds/rte-angular` registrado.

## 8. Consequências para as partes seguintes e outras specs

- **05b:** a toolbar e os diálogos ficam **dentro do host** (D11 não muda); consome `editor()`, a versão da ponte (D4) e `RTE_LABELS` (acrescenta seções `toolbar`/`dialogs`; o teste de completude cobre as novas chaves); o CSS de aparência dos blocos `rt-*` nasce como arquivo de conteúdo compartilhado com a spec 06 (o `rte-render` não pode depender do `rte-angular`); `[theme]` precisa funcionar com a CSP de R11 (CSSOM, não atributo `style` no HTML do SSR); guarda de `colspan`/`rowspan` > 100 e "criar linha" na toolbar (ADR 0004).
- **05c:** diálogos de mídia abertos por API própria (a 05d os liga ao `onUiItem`); `mediaChange`/`uploadError` seguem D3; validadores novos no `/validators`.
- **05d:** libera `search` e `slashCommands` (fim do D1), escreve a UI sobre `getSearchState`/`getSlashMenuState`, decide `updateOn` com os números do N8 e fecha a API (`api-extractor`).
- **Spec 06:** renderiza o valor da 05a (HTML canônico; `''` = sem conteúdo); reaproveita o CSS de conteúdo da 05b.
- **Spec 08:** matriz Angular 22.0 × último e Tiptap 3.31.4 × último sobre o app de teste; hidratação incremental e teclado virtual.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| `metadata(path, MAX_LENGTH/REQUIRED, …)` não aceitar valores de validador próprio na 22.2.1 | Conferir no código instalado na 1ª tarefa; plano B: chaves próprias (`createMetadataKey`) lidas pelo componente através do `FORM_FIELD` injetado (opcional), registrado no ADR 0007 |
| O caminho nativo de controle customizado do `NgControl` mudar numa versão do Angular 22.x | Os testes de R6 (`forms.compat.spec.ts`) cobrem os três modos de ligação nos dois modos de teste e pegam a regressão |
| Serializar a cada tecla passar do orçamento em documento grande | N8 mede nos 3 motores; Signal Forms `debounce` já alivia o formulário; a 05d decide o adiamento com dados |
| Hidratação reclamar dos nós que o Tiptap acrescenta | O `Editor` monta num `div` vazio do template depois da hidratação; N4 confere o console |
| CSP quebrar por recurso do *build* (CSS crítico inline, script de *event replay*) | `inlineCritical` desligado e configuração conferida no N5; o problema é do app de teste, não da lib, e fica documentado no README |
| `test-zone` dobrar o tempo do CI | Mesma suíte, alvo em cache do Nx; só roda quando o pacote é afetado |
| Casca do SSR sem o conteúdo frustrar quem quer prévia | Documentado: exibição sem JS é o `rte-render` (spec 06); hidratação incremental fica para a spec 08 |
| Peers obrigatórios do Tiptap (22 pacotes) assustarem o consumidor | README com o comando de instalação completo; npm 7+ instala peers sozinho |
