# @cds/rte-angular

Componente Angular do editor de texto rico (`rte-editor`), sobre Tiptap 3: ponte de signals, Signal Forms, Reactive/Template Forms, rótulos pt-BR/en/es, validadores de texto e CSS funcional sem injeção (compatível com CSP estrita).

**Status: specs 05a (componente e formulários), 05b1 (barra e tema por instância), 05b2 (diálogos e menus flutuantes) e 05c1 (diálogos de mídia) concluídas; ainda sem versão publicada.** Upload e rascunho (05c2) e busca/comandos `/` com interface (05d) vêm nas partes seguintes. `features.search` e `features.slashCommands` ficam sempre desligados.

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

- `minimal`: `undo redo · bold italic link · bulletList orderedList`
- `article` (padrão): `undo redo · blockType · bold italic underline strike link · textColor highlight · bulletList orderedList taskList · align · blockquote codeBlock horizontalRule · table · clearFormatting`
- `full`: o `article` mais `code superscript subscript lang` (marcas; `lang` depois de `subscript`), `indent outdent` (listas), `codeLanguage` (blocos) e o grupo `callout pullquote quoteAuthor readAlso` antes de `clearFormatting`

Grupos próprios são listas de ids (`RteToolbarItemId`) na ordem de exibição; id desconhecido ou repetido é ignorado com aviso em modo de desenvolvimento. `features` desligado esconde o item correspondente: `colors` (`textColor`, `highlight`), `tasks` (`taskList`), `code` (`codeBlock`, `codeLanguage`, que também some sem `codeLanguages`), `tables` (`table`) e `newsBlocks` (`callout`, `pullquote`, `quoteAuthor`, `lang`, `readAlso`); `link` está sempre disponível; grupo vazio some.

**Teclado.** A barra é uma parada de `Tab` (foco itinerante: `←`/`→` com volta circular, invertidas em `dir="rtl"`; `Home`/`End`); itens inaplicáveis ficam focáveis com `aria-disabled`. `Alt+F10` no editável, ou `focusToolbar()` no componente, leva o foco ao item ativo; `Shift+Tab` a partir do editável também chega à barra; `Escape` devolve o foco ao editável com a seleção intacta. Os menus (`blockType`, cores, `align`, `codeLanguage`, `table`, `callout`) seguem o padrão _menu button_: `Enter`/`Espaço`/`↓` abrem no primeiro item, `↑` no último; `Escape` fecha e volta ao botão; `Tab` fecha e vai ao editável. Clicar fora de um menu aberto o fecha e devolve o foco ao botão.

**Atalhos** (`Ctrl`, ou `⌘` no Mac; a dica de cada botão mostra o atalho na notação da plataforma): `B`, `I`, `U`, `Shift+S` (tachado), `E` (código), `.` (sobrescrito), `,` (subscrito), `Shift+8`, `Shift+7` e `Shift+9` (listas com marcadores, numerada e de tarefas), `Shift+B` (citação), `Alt+C` (bloco de código), `Alt+0`, `Alt+2`, `Alt+3` e `Alt+4` (parágrafo e títulos), `Shift+L`, `Shift+E`, `Shift+R` e `Shift+J` (alinhamento), `K` (link, abre o diálogo), `Z` e `Shift+Z`.

**Tabela.** Operações que passariam de 100 em `colspan`/`rowspan` ficam `aria-disabled`, com o motivo no `title`. Limitação: chamadas diretas à API do Tiptap (`editor.commands.*`) não passam pela guarda (ADR 0004).

**Estados e acessibilidade.** Sem editor (SSR, antes da criação), `disabled` ou `readonly`, todos os botões ficam `disabled` nativos, no mesmo leiaute. Alvos de toque ≥ 24 × 24 px; pressionado e marcado são distinguíveis sem cor e em `forced-colors`. Os rótulos vêm da seção `toolbar` de `RteLabels` (pt-BR, en e es em `/i18n`). A direção da barra vem do atributo `dir` (`closest('[dir]')`); direção só por CSS, sem `dir`, não é detectada.

## Diálogos

Os itens `link`, `lang`, `quoteAuthor`, `image`, `video` e `embed` e a entrada "Inserir tabela…" do menu `table` (`insertTableCustom`) abrem um `<dialog>` nativo **modal** (`showModal()`), último filho do `rte-editor`, com o título em `h2.rte-dialog__title` (`aria-labelledby`). Os formulários são Signal Forms; os textos vêm da seção `dialogs` de `RteLabels` (trocar o idioma com o diálogo aberto atualiza os textos sem perder o digitado). Fecha com `Escape`, "Cancelar" ou aplicação; clicar no fundo não fecha. Só um diálogo por vez. Se o documento mudar por fora, ou o editor ficar `disabled`/`readonly`/`hidden` ou for destruído, o diálogo fecha como cancelamento e nada é aplicado. Abrir e fechar não emitem `editorBlur`/`editorFocus`/`touch`, mas `Tab` depois do último controle leva o foco à interface do navegador (a lib não prende o foco) e isso conta como saída: o campo fica `touched`.

**Carga sob demanda (`@defer`).** Os formulários ficam num _chunk_ separado (`fesm2022/cds-rte-angular-rte-dialogs-<hash>.mjs`), carregado por `@defer (when ...; prefetch on idle)`: ele é buscado quando o navegador está ocioso, e o primeiro pedido espera a chegada se ainda for preciso. O _bundler_ do consumidor precisa manter `import()` dinâmico (o padrão do Angular CLI). Se o _chunk_ falhar, o pedido é descartado com aviso em desenvolvimento e `openDialog` passa a devolver `false` até recarregar a página.

**`Mod-K`** (`Ctrl+K`, ou `⌘K`) abre o diálogo de link com o foco no editável, só quando aplicável (senão a tecla segue para o navegador).

**`openDialog(kind)`** (método do componente; devolve `boolean`, `true` = pedido aceito, o diálogo abre assim que o _chunk_ chegar):

| `kind`        | Aplicável quando                                                                                          | Recurso      |
| ------------- | --------------------------------------------------------------------------------------------------------- | ------------ |
| `link`        | fora de bloco de código e de `code`; seleção de texto, cursor/seleção num link, ou cursor onde cabe texto | sempre       |
| `lang`        | fora de bloco de código; seleção não vazia ou cursor num trecho de idioma                                 | `newsBlocks` |
| `quoteAuthor` | cursor dentro de uma citação em destaque (`pullquote`)                                                    | `newsBlocks` |
| `table`       | fora de tabela                                                                                            | `tables`     |
| `image`       | sempre que o editor é editável; com uma imagem selecionada abre no modo _editar_, senão _inserir_         | `media`      |
| `video`       | idem, para o vídeo                                                                                        | `media`      |
| `embed`       | idem, para o _embed_; exige ao menos um provedor ativo                                                    | `embeds`     |

Devolve `false` quando não há editor, não é editável (`disabled`/`readonly`/`hidden`), o recurso está desligado, o caso é inaplicável, outro diálogo está aberto (em qualquer instância da página) ou os diálogos falharam ao carregar. Funciona com `toolbar: false`. O foco volta à origem (o item da barra, ou o elemento focado no host) ao cancelar e ao editável ao aplicar.

**Link.** A URL passa por `normalizeHref` com a **mesma política de links** que criou o editor (`linkPolicy` da instância > `provideRichText` > padrão); URL recusada mostra erro e o que é gravado é o `href` canônico. "Abrir em nova aba" só aparece com `target: 'preserve'`. Modos: inserir (cursor vazio: URL e Texto), aplicar (seleção de texto), editar (dentro de um link; com "Remover") e remover.

**Idioma.** Lista `RTE_DIALOG_LANGUAGES` (`en es fr de it pt la ja zh ru ar he`, congelada) e "Outro…" com código BCP 47 validado pela regra `span[lang]` do esquema; direção "Padrão", `ltr` ou `rtl` (`ar` e `he` sugerem `rtl`). **Autor da citação:** Autor e Cargo, opcionais (até 200 caracteres). **Tabela:** Linhas 1–100 (padrão 3), Colunas 1–20 (padrão 3), "Linha de cabeçalho" (marcada) e "Coluna de cabeçalho"; os `th` ganham `scope`.

**Seleção pendente.** Com o diálogo aberto o navegador esconde a seleção; o intervalo-alvo recebe a classe `.rte-pending-selection` (decoração, fora do histórico e do valor). O `editor.css` a estiliza com `--rte-primary-subtle`.

**Classes (API pública, BEM).** `.rte-dialog`, `.rte-dialog__form`, `.rte-dialog__field`, `.rte-dialog__label`, `.rte-dialog__hint`, `.rte-dialog__error`, `.rte-dialog__actions` (com `.rte-dialog__remove`, "Cancelar" e `.rte-dialog__apply`); o item ativo da barra usa `.rte-toolbar__button--active`. O CSS usa só `--rte-*`, nenhum atributo `style` (CSP estrita), alvos >= 24 px e borda `CanvasText` em `forced-colors`.

**Rolagem.** A lib não trava a rolagem da página por trás do modal. Se quiser, no CSS do consumidor:

```css
:root:has(.rte-dialog[open]) {
  overflow: hidden;
}
```

## Diálogos de mídia

`openDialog('image' | 'video' | 'embed')` e os itens `image`, `video` e `embed` da barra (presets `article`: imagem e _embed_; `full`: imagem, vídeo e _embed_) abrem o diálogo no modo **inserir** ou, com a mídia do tipo selecionada, **editar** (o item vira "Editar imagem/vídeo/embed" e fica `--active`). Os formulários de imagem, vídeo e _embed_ vivem no _chunk_ `rte-media-forms` e os demais no `rte-dialogs` (um componente por formulário, em `src/dialogs/forms/`); o de mídia é pré-carregado em ocioso. Depois de inserir, a mídia fica **selecionada** e o menu flutuante do tipo aparece; digitar logo depois substitui a mídia selecionada (um passo de desfazer a recupera). Se o comando recusar na aplicação, o diálogo fecha como cancelamento, com aviso em desenvolvimento.

**Endereços.** Todo endereço de imagem, vídeo, pôster e faixa passa pela regra do esquema do editor (`https:` e, com `allowRelativeMedia` (padrão `true`), caminho relativo à raiz, restritos por `mediaHosts`); `http:`, `data:`, `blob:`, `//host` e `site.com/a.png` são recusados (erro de endereço) e o que se grava é o valor canônico. Os diálogos **não carregam** o endereço (sem pré-visualização).

**Imagem.** Endereço, Texto alternativo (até 1000 caracteres), "Imagem decorativa", Legenda e Crédito (até 300) e, ao editar, Alinhamento e Largura em px (inteiro 1-10000, vazio = sem largura; alternativa às alças de arrasto, WCAG 2.5.7). O diálogo nunca grava um `alt` ausente: exige o texto ou "decorativa" (WCAG 1.1.1, técnica H67; `alt=""`). Atenção: o HTML canônico escreve `alt=""` nos dois casos, então **imagem decorativa e `alt` esquecido não se distinguem no HTML salvo**; a validação "toda imagem tem `alt`" depende do estado do editor (`rteImagesHaveAlt`, ver "Envio de arquivos").

**Vídeo.** Endereço, Pôster (opcional), Legenda e de 0 a 10 faixas de legenda (`captions` ou `subtitles`, endereço, idioma BCP 47, rótulo obrigatório e "Padrão", exclusivo). Faixa inválida mostra erro no campo e nada é aplicado em silêncio. Sem faixa `captions` o diálogo mostra uma dica (WCAG 1.2.2, não bloqueia). Um vídeo vindo do HTML com mais de 10 faixas as mantém todas (só "Acrescentar faixa" fica desabilitado).

**_Embed_.** Cola-se o endereço **da página** (YouTube `watch?v=`, `youtu.be/`, `/shorts/`, Vimeo, Spotify, mais os provedores que o consumidor registrar em `embedProviders`); só é aceito o que o comando do core aceitar, e a dica lista os provedores ativos. O `iframe` é sempre montado pelo core. No modo _editar_ só a legenda muda (o endereço aparece como texto); para trocar o endereço, remova e insira de novo.

**Menus flutuantes de mídia.** `RteFloatingMenuKind` ganhou `video` e `embed` (chaves separadas na configuração: `floatingMenus: { embed: false }`). Prioridade: imagem > vídeo > _embed_ > link > texto > tabela. Imagem: "Detalhes da imagem..." antes dos alinhamentos; vídeo e _embed_: "Detalhes..." e "Remover". Os "Detalhes..." abrem o diálogo no modo _editar_ com origem no editável.

**Seleção por clique.** No editor **editável**, o `editor.css` põe `pointer-events: none` no `video` e no `iframe` do conteúdo: um clique seleciona o nó (e não toca nem interage). Em `readonly` e `disabled` a regra não vale e o vídeo toca. A regra é só do editor; a página publicada (`content.css`) não a recebe.

**`mediaChange` e `mediaSession`.** A saída `mediaChange` (`RteMediaChange`: `added` e `removed`) cobre os endereços de `img[src]`, de cada URL do `srcset`, de `video[src]`, `poster` e `track[src]` (_embeds_ ficam de fora) e é emitida **uma vez** por transação que muda o conjunto, depois do `value`, dentro da zona. `mediaSession` (um `Signal<RteMediaSession>`) dá o **líquido** desde a base (a criação ou a última carga externa, que não emite): `current`, `added` e `removed`, listas ordenadas por unidade de código e congeladas. Orientação: **use o líquido ao salvar** e limpe os arquivos órfãos no servidor **com carência**: desfazer pode trazer de volta um endereço que o delta já deu como removido. O cálculo é incremental (só os intervalos alterados) e não entra na zona sem delta.

```ts
readonly editor = viewChild.required(RteEditor);
onSave() {
  const { removed } = this.editor().mediaSession();
  // enviar `removed` ao servidor, que apaga depois de uma carência
}
```

**CSP e privacidade do consumidor.** Um endereço externo é requisitado pelo navegador do redator assim que entra no documento. Para a CSP, libere `img-src` e `media-src` para os hosts de `mediaHosts` (e `'self'` para caminhos relativos) e `frame-src` para os hosts dos provedores ativos (`https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com` nos padrões, mais os seus). Recomenda-se `mediaHosts` para limitar a quem o navegador envia requisições. O pacote não usa o atributo `style` em tempo de execução; o `iframe` do _embed_ sai com `style="aspect-ratio"` pelo core, que o Chromium pode relatar (`style-src-attr`) só ao carregar conteúdo (desvio já citado em CSP).

**Classes (API pública, BEM).** Além das dos outros diálogos: `.rte-dialog__fieldset`, `.rte-dialog__legend` (faixas), `.rte-dialog__readonly` (endereço do _embed_ ao editar), `.rte-dialog__tracks`, `.rte-dialog__subtitle`, `.rte-dialog__track-add`, `.rte-dialog__track-remove` e `.rte-floating--video|--embed`.

## Envio de arquivos

Sem configuração, nada de arquivo: os diálogos não mostram "Arquivo", colar segue o caminho do core (que descarta `<img src="data:…">`) e soltar um arquivo é **ignorado** (o navegador não navega para ele). Com um adaptador, o editor ganha envio por diálogo, colar e soltar, marcadores no texto, uma bandeja de envios e o estado reativo `uploads`/`pendingUploads`/`imagesMissingAlt`.

```ts
provideRichText({
  upload: { adapter: httpUploadAdapter({ endpoint: '/api/media' }) },
});
// ou, por instância: <rte-editor [upload]="cfg" />  (a entrada vence o provider; `null` desliga)
```

**Configuração (`RteUploadConfig`).** `adapter` (obrigatório); `imageTypes`/`videoTypes` (só **subconjunto** da lista fechada: `image/png`, `jpeg`, `gif`, `webp`, `avif` e `video/mp4`, `video/webm`; `image/svg+xml` nunca é aceito, mesmo se configurado; tipo fora da lista é descartado com aviso em desenvolvimento); `maxImageBytes` (padrão 10 MiB), `maxVideoBytes` (200 MiB), `maxFilesPerAction` (20; os excedentes dão `'count'`); `preview` (miniatura local no marcador; padrão `false`). Com o MIME vazio vale a extensão (`.png`, `.jpg`/`.jpeg`, `.gif`, `.webp`, `.avif`, `.mp4`, `.webm`). Vídeo sem `uploadVideo` no adaptador dá `'type'`. Trocar a configuração (por referência) com envios em curso **aborta** todos. A maquinaria do envio (marcadores, fila, bandeja, colar e soltar) é um _chunk_ carregado sob demanda (`rte-upload`), só quando há configuração; gestos feitos antes da chegada do _chunk_ esperam em ordem.

**Adaptador (`RteUploadAdapter`).** `uploadImage(file, { signal, onProgress })` e, opcional, `uploadVideo(...)`; resolva com `{ url, width?, height?, srcset?, sizes? }` (vídeo: `poster?`). O editor chama uma vez por arquivo, **fora da zona**, nunca repete sozinho. Respeite o `signal`: cancelar chama `abort()` de verdade, e uma resolução ou rejeição depois disso é ignorada (nada é inserido). Para dar o motivo da falha, rejeite com `new RteUploadError('network' | 'server' | 'response')`; qualquer outra rejeição vale `'server'`. A resposta é **revalidada** pelas regras do esquema (`mediaHosts`, `allowRelativeMedia`): `url`, `srcset`, `sizes` ou `poster` recusados dão `'response'` e nada entra (um CDN fora de `mediaHosts` aparece no primeiro teste); `width`/`height` que não sejam inteiros de 1 a 10000 são ignorados.

**`httpUploadAdapter` (`@cds/rte-angular/upload`).** `XMLHttpRequest` com `multipart/form-data`: o arquivo em `fieldName` (padrão `'file'`) e o campo `kind` (`'image'` ou `'video'`). Opções: `endpoint` (texto ou `{ image, video? }`), `fieldName`, `headers` (objeto ou função chamada a cada envio, pode devolver `Promise`), `withCredentials`, `timeoutMs` e `mapResponse(body, { file, kind })`. Sem `mapResponse`, o corpo JSON deve ser `{ "url": "…", "width"?, "height"?, "srcset"?, "sizes"?, "poster"? }`. Progresso determinado (ou indeterminado quando o tamanho é desconhecido); cancelar aborta o `XMLHttpRequest`. Sem dependência além dos tipos.

**Colar e soltar.** Colar com arquivo toma a colagem **só se `text/plain` está vazio**: Word, Excel e páginas põem texto **e** uma imagem renderizada, e o texto vence (colar um parágrafo não vira uma imagem). A seleção não é apagada; o marcador entra em `selection.to`. Soltar usa a posição do ponteiro (`Dropcursor` do core); arrastar uma imagem já no documento continua movendo o nó. Limites conhecidos: soltar sobre as alças de redimensionar, a barra ou a bandeja ainda deixa o navegador abrir o arquivo, e arrastar uma imagem de **outro** editor sem adaptador é ignorado no Chromium.

**Marcadores, bandeja e anúncios.** O envio mostra um marcador (`.rte-upload-marker`, nome e `<progress>`) onde a mídia vai cair; ele não entra no HTML, no histórico, na sessão de mídia nem no `value`. A bandeja (`section.rte-uploads`, `role="group"`) fica depois do editável e lista cada envio com `<progress>` e "Cancelar envio de nome" (alcançável por `Tab`; ao cancelar, o foco vai ao item seguinte, ao anterior ou ao editável). A região `aria-live="polite"` (`.rte-uploads__status`, vazia no SSR) anuncia início (um por gesto), conclusão, cancelamento e erro, nunca o progresso. No máximo 2 envios simultâneos por instância (fila FIFO); a **ordem no documento é a do gesto**, qualquer que seja a ordem de chegada. A mídia entra numa transação própria (um passo de desfazer, uma emissão de `value`, o `mediaChange` com a URL); com diálogo aberto ou composição de IME, espera; com o editor `disabled`/`readonly`/`hidden` na chegada, vira `'unavailable'`. Imagem colada ou solta entra com `alt: null` (não é "decorativa"): corrija pelo "Detalhes da imagem…".

**Diálogos.** Com adaptador, o modo _inserir_ de imagem (e de vídeo, se houver `uploadVideo`) ganha "Origem": "Arquivo" (padrão) ou "Endereço". Os erros de arquivo (`rteFileRequired`, `rteFileType`, `rteFileSize`) aparecem no campo e não emitem `uploadError`; "Aplicar" fecha o diálogo e o envio segue pelo marcador. O modo _editar_ continua só por endereço.

**Estado e métodos.** `uploads` (`Signal<readonly RteUploadStatus[]>`: `id`, `fileName`, `type`, `state` `'queued' | 'uploading' | 'inserting'`, `progress`), `pendingUploads` (inclui gestos ainda em espera pelo carregamento do _chunk_ de envio), `imagesMissingAlt` (imagens com `alt: null` na sessão), `uploadFiles(files): number` (envia na seleção; devolve quantos foram aceitos, 0 sem adaptador ou não editável), `cancelUpload(id): boolean` e `cancelAllUploads()`. A saída `uploadError` (`{ fileName, type, reason, cause? }`, `reason` ∈ `'type' | 'size' | 'count' | 'network' | 'server' | 'response' | 'unavailable'`) sai **dentro da zona**, uma vez por arquivo; cancelar pela pessoa ou abortar por ciclo de vida não é erro; `cause` é só para o seu registro e nunca é exibido.

**Validadores (`/validators`).** `rteUploadsFinished` e `rteImagesHaveAlt` leem o **estado do editor**, não o valor. Signal Forms: `rteUploadsFinished(path, () => editor())` e `rteImagesHaveAlt(path, () => editor())` (com `editor` um `viewChild`, que pode ser `null`). Reactive e Template Forms: as diretivas `rteUploadsFinished` e `rteImagesHaveAlt` no `rte-editor` (`RteUploadsFinishedValidator`, `RteImagesHaveAltValidator`). Erros `{ kind: 'rteUploadsPending', count }` e `{ kind: 'rteImagesMissingAlt', count }` (Reactive: `{ rteUploadsPending: { count } }`), formatados por `formatRteError`. Nas diretivas, o validador é **acrescentado ao `NgControl`** (o caminho de controle customizado do Angular não lê `NG_VALIDATORS`): `setValidators()`/`clearValidators()` do seu código o remove. `rteImagesHaveAlt` só enxerga `alt: null` **da sessão**; o HTML salvo não distingue decorativa de `alt` esquecido (ver "Diálogos de mídia").

**CSP e responsabilidades do consumidor.** Libere `connect-src` para o endpoint do `httpUploadAdapter`; `img-src` e `media-src` para o host que o servidor devolve (que também precisa estar em `mediaHosts`, ou ser relativo com `allowRelativeMedia`); `img-src blob:` **só** com `preview: true`. O editor não envia nada sem gesto da pessoa (colar, soltar, diálogo) ou chamada de `uploadFiles`. O **servidor** deve: autenticar e proteger contra CSRF; conferir o tipo real (_magic bytes_), nunca confiar no MIME ou na extensão; limitar tamanho e quantidade; nunca devolver `svg`; servir o arquivo com `Content-Type` correto e `X-Content-Type-Options: nosniff`; gerar o nome do arquivo guardado (o do cliente é só texto); e apagar órfãos com carência (ver `mediaSession`). Nomes de arquivo e mensagens são exibidos só como texto.

**Classes (API pública, BEM).** `.rte-uploads` (`__list`, `__item`, `__name`, `__progress`, `__cancel`, `__status`), `.rte-upload-marker` (`__name`, `__progress`, `__preview`, `--queued`, `--image`, `--video`) e `.rte-dialog__source`.

## Rascunho e salvamento

**Rascunho (`draftKey`).** Opt-in: `<rte-editor draftKey="doc-42" />` (1 a 200 caracteres; use usuário **e** documento na chave, ex.: `user-7:doc-42`). Grava no `localStorage` (`rte-draft:<chave>`) 1 s depois da última alteração e ao ocultar a página; nunca grava `readonly`/`disabled`. Ao carregar, se há rascunho diferente do valor, aparece um aviso acessível (`section.rte-draft`) com data e botões "Restaurar"/"Descartar"; **nunca restaura sozinho**. Sinais e métodos: `draftAvailable` (`{ savedAt }` ou `null`), `restoreDraft()`, `discardDraft()` e a saída `draftError` (`'write'` | `'unavailable'`). `provideRichText({ draft: { storage, maxAgeMs, prompt } })`: `storage` próprio (`DraftStorage` do core), validade (7 dias) e `prompt: false` para construir a sua interface. O código é um _chunk_ (`rte-draft`) carregado só com `draftKey`. **Privacidade:** o rascunho fica no navegador em texto claro; no logout chame `clearLocalDrafts()` (de `@cds/rte-angular`; aceita um prefixo e devolve quantos apagou).

**`isDirty` e `markSaved(savedHtml?)`.** `isDirty()` é `true` quando o valor difere da base salva (a de criação ou da última carga externa). Depois de salvar no servidor chame `editor.markSaved(htmlSalvo)`: a base passa a ser esse HTML (sem argumento, o valor atual) e o rascunho é apagado.

**`onMediaRemoved`.** Adaptador opcional: `onMediaRemoved?(urls)` recebe os endereços de mídia removidos desde a base, **só depois** de `markSaved` e de não haver envios pendentes, já refiltrados contra o documento salvo. Desfazer pode trazer a mídia de volta, e outro documento pode usá-la: **apague com carência**, nunca na hora.

**`warnOnUnsaved`.** Entrada (ou `provideRichText({ warnOnUnsaved: true })`): pede confirmação do navegador ao sair enquanto `isDirty()` ou há envio pendente. Desligado por padrão. Para rotas do Angular use `isDirty()` num guarda de 5 linhas:

```ts
export const leaveGuard: CanDeactivateFn<{
  editor: Signal<RteEditor | undefined>;
}> = (c) => !c.editor()?.isDirty() || confirm('Descartar alterações?');
```

**`pasteEmbeds`.** Opt-in: colar uma única URL suportada (ex.: YouTube) num parágrafo vazio vira _embed_ (um passo de desfazer); em qualquer outro caso, a colagem segue como antes. Emite `value`, não `mediaChange`.

**Re-hospedagem.** Com `upload: { adapter, rehostExternal: true, ownHosts: [...] }` e `adapter.registerExternal?(url, ctx)`, imagens `https:` externas **coladas** são enviadas ao seu servidor e o `src` é trocado (fila e bandeja dos envios; desfazer remove a imagem, não volta ao externo). Falhas mantêm a URL externa, sem `uploadError`. Endereços com credenciais (`https://usuário:senha@…`) não são re-hospedados. **O servidor busca uma URL vinda da colagem:** valide-a no `registerExternal` do seu backend (só `https:`, recuse `localhost`/IPs privados e redirecionamentos para eles, limite tamanho e tipo) para não virar SSRF. Não re-hospeda colagens feitas antes do _chunk_ de envio carregar, e não faz nada se `mediaHosts` for restrito (o esquema já remove a imagem externa).

## Menus flutuantes

Seis menus contextuais (os de vídeo e _embed_ estão em "Diálogos de mídia") aparecem junto ao conteúdo, sem tirar o foco do editável: **texto** (seleção de texto não vazia: `bold italic underline strike code` e `link`, os mesmos itens, estados e atalhos da barra; `link` abre o diálogo), **link** (cursor num link: o endereço, que abre em nova aba com `rel="noopener noreferrer"`, "Editar link" e "Remover link"), **tabela** (cursor ou células selecionadas: inserir linha abaixo, inserir coluna depois, excluir linha, excluir coluna e um menu "Mais operações de tabela" com as demais) e **imagem** (imagem selecionada: "Detalhes da imagem…", que abre o diálogo de imagem, alinhar à esquerda, centro, direita ou largura total, e "Remover imagem"). Prioridade quando mais de um se aplica: imagem > vídeo > _embed_ > link > texto > tabela. `Ctrl+A` não mostra o menu de texto.

**Configuração.** `floatingMenus` na entrada e em `provideRichText({ floatingMenus })`: `boolean` (vale para todos) ou `Partial<Record<'text' | 'link' | 'table' | 'image' | 'video' | 'embed', boolean>>`; objetos mesclam por chave (entrada > _provider_), ausente = ligado. Imagem e vídeo exigem o recurso `media`, _embed_ o `embeds` e tabela o `tables`. Mudar ao vivo vale sem recriar o editor e sem emitir valor.

```html
<rte-editor [floatingMenus]="{ table: false }" />
<rte-editor [floatingMenus]="false" />
```

**Quando aparecem.** Só com o foco no editável ou no próprio menu (foco na barra, num menu da barra ou fora do host oculta); ficam ocultos em `disabled`, `readonly` e `hidden`, durante o arrasto do ponteiro (aparecem no `pointerup`), durante a composição de IME, com um diálogo aberto ou pedido por qualquer editor do documento e quando a âncora sai da área visível do editor (contêiner com rolagem); voltam sozinhos quando a condição some. Aparecer, trocar de tipo, reposicionar e ocultar nunca mudam o foco, e os itens não são parada de `Tab`. Posição: acima da âncora, centrado, a 8 px; vira para baixo se não couber (e prefere baixo em texto e link com `pointer: coarse`); `overlay` no topo da parte visível quando a âncora é mais alta que a área. Os menus são carregados sob demanda (`@defer`, _chunk_ `fesm2022/cds-rte-angular-rte-floating-menus-<hash>.mjs`) logo depois da criação do editor; se o _chunk_ falhar, o editor segue sem eles (aviso em desenvolvimento).

**Teclado.** `Escape` no editável oculta o menu visível; ele só volta quando a seleção muda de contexto. `Alt+F10` no editável foca o item ativo do menu visível e, sem menu, a barra; dentro do menu, `Alt+F10` leva à barra. O método `focusFloatingMenu(): boolean` faz o mesmo que o `Alt+F10` (devolve `false` sem mover o foco quando não há menu visível), para plataformas em que `F10` é capturado. Dentro do menu: `←`/`→` (invertidas em `rtl`), `Home`/`End`; `Escape`, `Tab` e `Shift+Tab` devolvem o foco ao editável com a seleção intacta.

**Tabela.** `addRowAfter` e `addColumnAfter` (e as do submenu) seguem a guarda de `colspan`/`rowspan` > 100 da barra: ficam `aria-disabled` com o motivo no `title` e não alteram o documento.

**Rótulos e classes.** Seção `floating` de `RteLabels` (pt-BR, en e es), `labels.toolbar` para os itens que já existem na barra. Classes públicas (BEM): `.rte-floating` (`popover="manual"`, `role="toolbar"`), `.rte-floating--text|--link|--table|--image|--video|--embed`, `.rte-floating--measuring` (transitória), `.rte-floating__link` e `.rte-floating__address` (o endereço do link); os itens reaproveitam `.rte-toolbar__button` e `.rte-toolbar__separator`. O CSS usa só `--rte-*` e nenhum atributo `style` (a posição vai por CSSOM). Limitações: sem menus em `readonly`; WebKit: em testes, a seleção de células por arrasto sintético é feita por `setCellSelection`.

## Tema por instância

```ts
provideRichText({ theme: { primary: '#0b5fff' } });
```

```html
<rte-editor [theme]="{ primary: '#c2185b', mode: 'dark' }" />
```

O tema é mesclado por chave (instância > `provideRichText`) e aplicado ao host por `applyRteTheme` do `@cds/rte-theme` (CSSOM, compatível com CSP estrita; nenhum atributo `style` no HTML do SSR). `data-rte-mode` sai no host. Trocar `[theme]` reaplica, `undefined` limpa e o destroy limpa; duas instâncias com temas diferentes não interferem, e os menus herdam o tema da instância. Em desenvolvimento, `warnIfPoorTheme` avisa **só para valores inválidos** (por exemplo `'banana'`); sementes válidas têm contraste garantido pela derivação. Sem tema em lugar nenhum, vale o CSS em cascata.

## Rótulos e idioma

`RteLabels` = `content` + `slash` + `editor` + `errors` + `toolbar` + `dialogs`. A fonte é um objeto parcial **ou uma função** (lida dentro de `computed`, então pode ler signals). Prioridade: entrada `[labels]` > `provideRichText({ labels })` (também aninhado em rotas/componentes) > inglês. Pacotes completos em `@cds/rte-angular/i18n`: `RTE_LABELS_PT_BR`, `RTE_LABELS_EN`, `RTE_LABELS_ES`.

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

05d: busca e comandos `/` com interface, `updateOn`/adiamento da emissão com os números de desempenho, API final. Spec 06: `rte-render` (exibição). Spec 08: matriz de versões do Angular/Tiptap, hidratação incremental e teclado virtual.

Repositório: cds-text-editor (monorepo). Licença MIT.
