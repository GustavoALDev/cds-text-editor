# @cds/rte-angular

Componente Angular do editor de texto rico (`rte-editor`), sobre Tiptap 3: ponte de signals, Signal Forms, Reactive/Template Forms, rótulos pt-BR/en/es, validadores de texto e CSS funcional sem injeção (compatível com CSP estrita).

**Status: specs 05a (componente e formulários) e 05b1 (barra de ferramentas e tema por instância) concluídas; ainda sem versão publicada.** Menus flutuantes e diálogos (05b2), mídia (05c) e busca/comandos `/` com interface (05d) vêm nas partes seguintes. `features.search` e `features.slashCommands` ficam sempre desligados.

Nome do pacote provisório (escopo `@cds` ainda não confirmado). Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

## Instalação

Exige Angular `>=22.2.1 <23` (a 22.2.1 é a versão verificada para o caminho nativo de Reactive/Template Forms). Todos os peers são obrigatórios; o npm 7+ os instala sozinho, mas o comando completo é:

```bash
npm i @cds/rte-angular @cds/rte-core @cds/rte-theme \
  @tiptap/core@^3.31.4 @tiptap/extension-blockquote@^3.31.4 @tiptap/extension-bold@^3.31.4 \
  @tiptap/extension-code@^3.31.4 @tiptap/extension-code-block@^3.31.4 @tiptap/extension-document@^3.31.4 \
  @tiptap/extension-hard-break@^3.31.4 @tiptap/extension-heading@^3.31.4 \
  @tiptap/extension-horizontal-rule@^3.31.4 @tiptap/extension-italic@^3.31.4 @tiptap/extension-link@^3.31.4 \
  @tiptap/extension-list@^3.31.4 @tiptap/extension-paragraph@^3.31.4 @tiptap/extension-strike@^3.31.4 \
  @tiptap/extension-subscript@^3.31.4 @tiptap/extension-superscript@^3.31.4 @tiptap/extension-table@^3.31.4 \
  @tiptap/extension-text@^3.31.4 @tiptap/extension-text-align@^3.31.4 @tiptap/extension-underline@^3.31.4 \
  @tiptap/extensions@^3.31.4 @tiptap/pm@^3.31.4 lowlight@^3.3.0 highlight.js@^11.11.1
```

`zone.js` não é peer: o componente funciona sem zona (zoneless) e com zone.js.

## CSS

O pacote não injeta CSS em tempo de execução (nem o Tiptap). Inclua os três arquivos, **nesta ordem**, em `angular.json` → `styles`:

```json
"styles": [
  "node_modules/@cds/rte-theme/theme.css",
  "node_modules/@cds/rte-core/styles/content.css",
  "node_modules/@cds/rte-angular/styles/editor.css"
]
```

- `theme.css`: tokens `--rte-*`.
- `content.css` (do core): aparência do conteúdo (`rt-*`, tabelas, `pre`, paleta), em `@layer rte.content`, sempre sob `.rte-content`. É o mesmo arquivo que a página publicada usa (spec 06).
- `editor.css`: só o funcional da edição, a barra e os menus.

Os dois últimos usam `@layer rte.reset, rte.base, rte.theme, rte.components, rte.content` (a mesma ordem do tema); as cores vêm dos tokens `--rte-*`. **Exceção ao "sem `!important`":** no `content.css`, `color` de `span[data-rt-color]` e `background-color` de `mark[data-rt-color]` (o `style` do HTML canônico venceria qualquer regra sem `!important` e quebraria o contraste no escuro). Para personalizar, sobrescreva as variáveis `--rte-content-color` e `--rte-content-highlight`, por exemplo `.rte-content span[data-rt-color='red'] { --rte-content-color: #b00020; }`. As classes `rte-*` (BEM) são API pública: host `rte-root rte-editor`, modificadores `rte-editor--disabled|--readonly|--focused|--invalid`, partes `rte-editor__frame`, `rte-editor__shell`, `rte-editor__mount`, `rte-toolbar` (`__button`, `--pressed`, `--menu`, `__separator`), `rte-menu` (`__item`, `--checked`), `rte-swatch` e `rte-icon`.

## Uso

`provideRichText` é opcional (sem ele: rótulos em inglês e padrões do core).

```ts
// app.config.ts
import { provideRichText } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';

export const appConfig: ApplicationConfig = {
  providers: [provideRichText({ labels: RTE_LABELS_PT_BR })],
};
```

O valor é sempre **HTML canônico** (`getRteHtml`); documento vazio vale `''`; `null`/`undefined` de entrada valem `''`. Não há formato JSON: quem precisa dele lê `editor()?.getJSON()`.

### 1. Signal Forms (caminho principal)

```ts
import { form, FormField } from '@angular/forms/signals';
import { RteEditor } from '@cds/rte-angular';
import { rteMaxChars, rteRequired } from '@cds/rte-angular/validators';

@Component({
  imports: [RteEditor, FormField],
  template: `<rte-editor [formField]="f.body" ariaLabel="Texto" />`,
})
export class Post {
  readonly model = signal({ body: '' });
  readonly f = form(this.model, (p) => {
    rteRequired(p.body);
    rteMaxChars(p.body, 5000);
  });
}
```

`required`, `disabled` (inclusive com motivo), `readonly`, `hidden`, `invalid`, `touched` e `maxLength` do schema chegam ao componente sozinhos. **Não** ligue `[disabled]`, `[readonly]` nem `[maxLength]` junto de `[formField]`: o Angular recusa (NG8022). `f.body().focusBoundControl()` foca o editável e `reset` leva o editor a `''`.

### 2. Reactive Forms e 3. Template Forms (caminho nativo, sem CVA)

No Angular 22.2 o `NgControl` liga um controle customizado (`FormValueControl`) diretamente; o pacote **não** provê `NG_VALUE_ACCESSOR` e nenhuma diretiva extra é necessária:

```html
<rte-editor formControlName="body" ariaLabel="Texto" />
<rte-editor [formControl]="ctrl" ariaLabel="Texto" />
<rte-editor [(ngModel)]="text" name="body" ariaLabel="Texto" />
<!-- com `name` num <form>, ou [ngModelOptions]="{standalone: true}" -->
```

`setValue(null)` vale `''`; `setValue` chega ao editor sem emitir de volta (o controle fica `pristine`); `disable()`/`enable()` ligam o editável. Limitação importante: nesses dois modos o limite do validador **não** chega ao componente (não há metadados de Signal Forms); para o limite barrar a digitação, ligue `[maxLength]="5000"` no elemento; o mesmo vale para `[readonly]` e `[hidden]` (o controle nativo entrega `disabled`, `required`, `invalid` e `touched`; `maxLength`, `readonly` e `hidden` não). `Validators.required` e o atributo `required` valem; use `RteValidators.required`, `maxChars(n)` e `maxWords(n)` para medir o **texto** e não a string HTML.

Sem formulário: `<rte-editor [(value)]="html" />`. Se o pai devolve `value` ao valor anterior antes da detecção de mudanças, a mudança nunca chega ao editor (comportamento do `model()` do Angular).

### `maxLength` nativo × `rteMaxChars`

O `maxLength()` nativo do Signal Forms mede a string HTML, o que não é o que o usuário vê. `rteMaxChars(path, n)` mede o texto (pontos de código de `htmlToText`, sem quebras de linha, a mesma regra do `textStats()` do editor) e publica o limite, que vira o limite de digitação do editor. Só a entrada direta é barrada acima do limite; conteúdo externo acima dele fica com `textStats().overLimit` e o formulário inválido, sem corte. `rteRequired` considera vazio um documento sem texto e sem `img`/`video`/`iframe`; para HTML não canônico (não gerado pelo editor) a detecção de mídia é uma aproximação por expressão regular.

### Mensagens de erro

O componente não desenha mensagens; ligue-as com `ariaDescribedBy` e traduza com `formatRteError(error, labels)` (entry `/validators`) usando `RTE_LABELS`. `aria-invalid="true"` só aparece com `invalid() && touched()`.

`formatRteError` aceita as três formas de erro e nunca lança: o erro de Signal Forms (`{ kind, max, actual }`), o `ReactiveValidationError` (`{ kind, context: { max, actual } }`) e o `control.errors` do Reactive/Template Forms (`{ rteMaxChars: { max, actual } }`; o primeiro erro do editor presente vence). Erro desconhecido ou malformado devolve `''`; rótulo ausente, de tipo errado ou que lança cai no inglês.

```ts
// Signal Forms
readonly messages = computed(() =>
  this.form.body().errors().filter(isRteValidationError).map((e) => formatRteError(e, this.labels())),
);
// Reactive Forms (o mesmo vale para `ngModel.errors`)
readonly labels = inject(RTE_LABELS);
message(): string {
  return formatRteError(this.form.controls.body.errors, this.labels());
}
```

## Barra de ferramentas

A barra é o primeiro filho da moldura do `rte-editor` (`role="toolbar"`). Prioridade: entrada `[toolbar]` > `provideRichText({ toolbar })` > `'article'`; `false` não renderiza a barra. Mudar `toolbar` depois da criação vale (só a interface muda; o editor não é recriado).

```html
<rte-editor toolbar="full" />
<rte-editor [toolbar]="[['undo', 'redo'], ['bold', 'italic']]" />
<rte-editor [toolbar]="false" />
```

Presets (`RTE_TOOLBAR_PRESETS`, congelados; `·` separa grupos):

- `minimal`: `undo redo · bold italic · bulletList orderedList`
- `article` (padrão): `undo redo · blockType · bold italic underline strike · textColor highlight · bulletList orderedList taskList · align · blockquote codeBlock horizontalRule · table · clearFormatting`
- `full`: o `article` mais `code superscript subscript` (marcas), `indent outdent` (listas), `codeLanguage` (blocos) e o grupo `callout pullquote readAlso` antes de `clearFormatting`

Grupos próprios são listas de ids (`RteToolbarItemId`) na ordem de exibição; id desconhecido ou repetido é ignorado com aviso em modo de desenvolvimento. `features` desligado esconde o item correspondente: `colors` (`textColor`, `highlight`), `tasks` (`taskList`), `code` (`codeBlock`, `codeLanguage`, que também some sem `codeLanguages`), `tables` (`table`) e `newsBlocks` (`callout`, `pullquote`, `readAlso`); grupo vazio some.

**Teclado.** A barra é uma parada de `Tab` (foco itinerante: `←`/`→` com volta circular, invertidas em `dir="rtl"`; `Home`/`End`); itens inaplicáveis ficam focáveis com `aria-disabled`. `Alt+F10` no editável, ou `focusToolbar()` no componente, leva o foco ao item ativo; `Shift+Tab` a partir do editável também chega à barra; `Escape` devolve o foco ao editável com a seleção intacta. Os menus (`blockType`, cores, `align`, `codeLanguage`, `table`, `callout`) seguem o padrão _menu button_: `Enter`/`Espaço`/`↓` abrem no primeiro item, `↑` no último; `Escape` fecha e volta ao botão; `Tab` fecha e vai ao editável. Clicar fora de um menu aberto o fecha e devolve o foco ao botão.

**Atalhos** (`Ctrl`, ou `⌘` no Mac; a dica de cada botão mostra o atalho na notação da plataforma): `B`, `I`, `U`, `Shift+S` (tachado), `E` (código), `.` (sobrescrito), `,` (subscrito), `Shift+8`, `Shift+7` e `Shift+9` (listas com marcadores, numerada e de tarefas), `Shift+B` (citação), `Alt+C` (bloco de código), `Alt+0`, `Alt+2`, `Alt+3` e `Alt+4` (parágrafo e títulos), `Shift+L`, `Shift+E`, `Shift+R` e `Shift+J` (alinhamento), `Z` e `Shift+Z`.

**Tabela.** Operações que passariam de 100 em `colspan`/`rowspan` ficam `aria-disabled`, com o motivo no `title`. Limitação: chamadas diretas à API do Tiptap (`editor.commands.*`) não passam pela guarda (ADR 0004).

**Estados e acessibilidade.** Sem editor (SSR, antes da criação), `disabled` ou `readonly`, todos os botões ficam `disabled` nativos, no mesmo leiaute. Alvos de toque ≥ 24 × 24 px; pressionado e marcado são distinguíveis sem cor e em `forced-colors`. Os rótulos vêm da seção `toolbar` de `RteLabels` (pt-BR, en e es em `/i18n`). A direção da barra vem do atributo `dir` (`closest('[dir]')`); direção só por CSS, sem `dir`, não é detectada.

## Tema por instância

```ts
provideRichText({ theme: { primary: '#0b5fff' } });
```

```html
<rte-editor [theme]="{ primary: '#c2185b', mode: 'dark' }" />
```

O tema é mesclado por chave (instância > `provideRichText`) e aplicado ao host por `applyRteTheme` do `@cds/rte-theme` (CSSOM, compatível com CSP estrita; nenhum atributo `style` no HTML do SSR). `data-rte-mode` sai no host. Trocar `[theme]` reaplica, `undefined` limpa e o destroy limpa; duas instâncias com temas diferentes não interferem, e os menus herdam o tema da instância. Em desenvolvimento, `warnIfPoorTheme` avisa **só para valores inválidos** (por exemplo `'banana'`); sementes válidas têm contraste garantido pela derivação. Sem tema em lugar nenhum, vale o CSS em cascata.

## Rótulos e idioma

`RteLabels` = `content` + `slash` + `editor` + `errors` + `toolbar`. A fonte é um objeto parcial **ou uma função** (lida dentro de `computed`, então pode ler signals). Prioridade: entrada `[labels]` > `provideRichText({ labels })` (também aninhado em rotas/componentes) > inglês. Pacotes completos em `@cds/rte-angular/i18n`: `RTE_LABELS_PT_BR`, `RTE_LABELS_EN`, `RTE_LABELS_ES`.

```ts
// Por instância: a entrada `labels` ligada a um signal.
readonly lang = signal<'pt' | 'en'>('pt');
readonly labels = computed(() => (this.lang() === 'pt' ? RTE_LABELS_PT_BR : RTE_LABELS_EN));
// <rte-editor [labels]="labels()" />

// Para a aplicação: a fonte é uma função lida dentro de `computed`; leia um
// signal que exista fora de um componente (de módulo, como aqui).
export const appLang = signal<'pt' | 'en'>('pt');
bootstrapApplication(App, {
  providers: [provideRichText({ labels: () => (appLang() === 'pt' ? RTE_LABELS_PT_BR : RTE_LABELS_EN) })],
});
```

Trocar o idioma atualiza no mesmo ciclo o nome acessível, o placeholder, o título vazio das caixas e o nome das tarefas, sem editar o texto. Detalhe: o título **vazio** de uma caixa serializa com o rótulo do idioma atual, mas a troca não emite valor; o `value` fica com o título no idioma anterior até a próxima edição.

As opções de criação (`[options]` e `provideRichText({ editor })`) são lidas **uma vez**, na criação.

## SSR e hidratação

No servidor o template renderiza só uma **casca**: moldura e um editável falso (`role="textbox"`, nome acessível, `aria-busy`) com o placeholder quando `value` é `''`. O HTML do valor **não** é renderizado (o servidor não tem `DOMParser` para a leitura do esquema e não há sanitizador nesta parte). A exibição de conteúdo sem JavaScript é o papel do `@cds/rte-render` (spec 06). O `Editor` é criado só no navegador (`afterNextRender`, fora da zona).

Hidratação incremental fica para a spec 08. Com CSP estrita, desligue-a (`provideClientHydration(withNoIncrementalHydration())`, sem `withEventReplay()`) e use `optimization.styles.inlineCritical: false`: o _event replay_ injeta um `<script>` inline e o CSS crítico, um `<style>`.

## CSP

Testado com `default-src 'self'; script-src 'self'; style-src 'self'` por cabeçalho. O pacote não cria `<style>` nem usa o atributo `style` em tempo de execução. **Desvio conhecido (Chromium):** ao carregar conteúdo (valor inicial, carga externa e provavelmente colagem) o `DOMParser` do Tiptap faz o Chromium relatar uma violação `style-src-attr` ("inline") por atributo `style` presente no HTML, mesmo sem aplicá-lo; o conteúdo chega íntegro (o core lê o atributo `style`, inclusive o alinhamento, e não o CSSOM, que o Chromium deixa vazio nesse caso). Firefox e WebKit não relatam. Quem usa `report-uri`/`report-to` pode ver esse ruído no Chromium.

## Estados, foco e somente leitura

- `disabled`: fora da ordem de foco, `aria-disabled`; `readonly`: `tabindex="0"`, `aria-readonly`, texto selecionável; `hidden` vira o atributo no host; os checkboxes das tarefas ficam desabilitados nos dois casos.
- `touched`/`editorBlur`/`editorFocus` seguem o foco do **host inteiro**. Ao desabilitar com o foco dentro do editor, o Signal Forms mantém `touched` em `false` (comportamento do Angular para campo não interativo).
- Em `readonly`, setas e `Shift+setas` estendem a seleção por `Selection.modify` (API não padrão, presente nos 3 motores), porque `contenteditable=false` não estende a seleção pelo teclado no Chromium e no WebKit. Limites: os atalhos de seleção por palavra/linha do macOS (`Option`/`Cmd` + `Shift` + seta) não são mapeados (valem Windows/Linux), e não há guarda de composição de IME.
- Carga externa (mudança de `value` pelo modelo) zera o histórico: `Ctrl+Z` logo após uma carga não volta ao conteúdo anterior.

## Teste

`@cds/rte-angular/testing` exporta `getRteEditor(host)`, que lê o `Editor` do Tiptap do elemento `rte-editor` pelo gancho `Symbol.for('@cds/rte-angular/editor')` (funciona em _build_ de produção); `null` antes da criação ou depois de destruir.

## O que vem depois

05b2: menus flutuantes e diálogos (itens `link` e `lang`). 05c: mídia. 05d: busca e comandos `/` com interface, `updateOn`/adiamento da emissão com os números de desempenho, API final. Spec 06: `rte-render` (exibição). Spec 08: matriz de versões do Angular/Tiptap, hidratação incremental e teclado virtual.

Repositório: cds-text-editor (monorepo). Licença MIT.
