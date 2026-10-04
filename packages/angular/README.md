# @cds/rte-angular

Componente Angular do editor de texto rico (`rte-editor`), sobre Tiptap 3: ponte de signals, Signal Forms, Reactive/Template Forms, rótulos pt-BR/en/es, validadores de texto e CSS funcional sem injeção (compatível com CSP estrita).

**Status: spec 05a (componente e formulários) concluída; ainda sem versão publicada.** Esta parte entrega o editor **sem barra de ferramentas**: edição por atalhos de teclado. Toolbar, menus e diálogos (05b), mídia (05c) e busca/comandos `/` com interface (05d) vêm nas partes seguintes. `features.search` e `features.slashCommands` ficam sempre desligados nesta parte.

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

O pacote não injeta CSS em tempo de execução (nem o Tiptap). Inclua os dois arquivos, nesta ordem, em `angular.json` → `styles`:

```json
"styles": [
  "node_modules/@cds/rte-theme/theme.css",
  "node_modules/@cds/rte-angular/styles/editor.css"
]
```

O `editor.css` usa `@layer rte.reset, rte.base, rte.theme, rte.components, rte.content` (a mesma ordem do tema), sem `!important` e sem seletor global; as cores vêm dos tokens `--rte-*`. As classes `rte-*` (BEM) são API pública: host `rte-root rte-editor`, modificadores `rte-editor--disabled|--readonly|--focused|--invalid`, partes `rte-editor__frame`, `rte-editor__shell`, `rte-editor__mount`.

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

Sem formulário: `<rte-editor [(value)]="html" />`.

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

## Rótulos e idioma

`RteLabels` = `content` + `slash` + `editor` + `errors`. A fonte é um objeto parcial **ou uma função** (lida dentro de `computed`, então pode ler signals). Prioridade: entrada `[labels]` > `provideRichText({ labels })` (também aninhado em rotas/componentes) > inglês. Pacotes completos em `@cds/rte-angular/i18n`: `RTE_LABELS_PT_BR`, `RTE_LABELS_EN`, `RTE_LABELS_ES`.

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

05b: barra de ferramentas, menus flutuantes, diálogos e tema por instância. 05c: mídia. 05d: busca e comandos `/` com interface, `updateOn`/adiamento da emissão com os números de desempenho, API final. Spec 06: `rte-render` (exibição). Spec 08: matriz de versões do Angular/Tiptap, hidratação incremental e teclado virtual.

Repositório: cds-text-editor (monorepo). Licença MIT.
