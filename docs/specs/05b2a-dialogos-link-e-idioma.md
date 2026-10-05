# Spec 05b2a — Diálogos, link, idioma, autor da citação e tabela (`@cds/rte-angular`)

> Parte 3 de 6 da spec 05 (05a, 05b1, **05b2a**, 05b2b, 05c, 05d) (ver `05-editor-angular.md`; a 05b2 foi dividida em **05b2a**, esta, e **05b2b**, menus flutuantes). Depende da 05b1 (concluída: barra, `RteRovingFocus`, `RteMenu`/`RteMenuTrigger`, `positionMenu`, estado por transação, guarda de tabela, tema por instância, `content.css`) e da 05a (concluída: contrato de foco D11, emissão de valor D8/D9, estados D10, Signal Forms, rótulos, app de teste com CSP nos 3 motores). Consumida pela 05b2b (o "Editar" do menu flutuante de link abre o diálogo daqui), pela 05c (diálogos de mídia sobre a mesma base) e pela 05d (`onUiItem` → `openDialog`).
> Decisões tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro". Fatos conferidos em 2026-10-04 no repositório: `@angular/forms` 22.2.1 expõe em `@angular/forms/signals` `form`, `FormField` (`[formField]`), `FormRoot` (`form[formRoot]`, `@publicApi 22.0`), `required`, `validate`, `min`, `max`, `maxLength`, `submit`; o `jsdom` 27.4 tem `HTMLDialogElement` **sem** `show`/`showModal`/`close` (como o *popover*, precisa de calço nos unitários); o `ng-packagr` 22.1.1 gera o FESM com `inlineDynamicImports: false` e `chunkFileNames` `<entry>-[name]-[hash]`, e a compilação parcial carrega `deferBlockDependencies` (um `@defer` da biblioteca vira *chunk* separado no pacote); o `@tiptap/extension-link` 3.31.4 **não** registra `Mod-K`; `@tiptap/extension-bubble-menu` e `@floating-ui/dom` **não** estão instalados; o core exporta `normalizeHref`, `getLinkAttributes`, `DEFAULT_LINK_POLICY`, `normalizeAttribute` e `getHtmlSchema` (entry `.`) e tem `setLink`/`unsetLink` com a política, `setLang`/`unsetLang` (`rtLang`, recurso `newsBlocks`, regra `^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$`, máx. 30), `updatePullquote({ author, role })` (texto puro, B10) e descarta o `<caption>` das tabelas na leitura (ruling 16 do ADR 0004).

## 1. Objetivo

Dar ao `rte-editor` a **base de diálogos** — `<dialog>` nativo modal dentro do host, carregado sob demanda por `@defer`, com formulários em **Signal Forms** — e os quatro diálogos da spec 05: **link** (inserir, aplicar, editar e remover, validando pela política de links do core), **idioma** de um trecho (`rtLang`), **autor e cargo da citação em destaque** e **detalhes de uma tabela nova** (linhas, colunas, cabeçalhos). Entregar os itens `link`, `lang` e `quoteAuthor` na barra e nos *presets*, o atalho `Mod-K`, a seleção visível enquanto o diálogo está aberto, a seção `dialogs` dos rótulos e a API `openDialog()` para quem monta a própria barra. Tudo mantendo D11 (foco interno ao host não é saída), D8/D9 (um passo de desfazer, uma emissão por aplicação), a CSP estrita e o SSR da 05a.

## 2. Fora de escopo

Menus flutuantes de texto, link, tabela e imagem (**05b2b**; as diretrizes já decididas estão no Apêndice A); diálogos de imagem, vídeo e *embed*, detalhes da imagem e upload (05c, sobre a base daqui); menu `/`, busca e contadores (05d); **legenda de tabela** (`<caption>`: o core a descarta na leitura e nunca a produz, ruling 16 do ADR 0004 — mudar isso mexe no contrato do HTML, no sanitizador e na spec 06; fica como evolução registrada); editar linhas/colunas de uma tabela existente por diálogo (as operações da barra já fazem isso, com a guarda U14); pré-visualização do destino do link; seletor de idioma com busca (*combobox*); trava de rolagem da página com o diálogo aberto (CSS do consumidor; a lib não estiliza `body`); hidratação incremental (spec 08).

## 3. Decisões

Cada uma com o motivo. Divergências na execução viram o **ADR 0009** (diálogos; o 0008 é da 05b1). Numeração própria (G1…) para não colidir com D1–D26 (05a) e U1–U20 (05b1). O Apêndice A registra as diretrizes F1–F9 da 05b2b.

| # | Decisão | Motivo |
|---|---|---|
| G1 | A 05b2 é **dividida**: **05b2a** (esta) = base de diálogos, os quatro diálogos, itens `link`/`lang`/`quoteAuthor`, `Mod-K`, `openDialog()`; **05b2b** = menus flutuantes de texto, link, tabela e imagem. | As duas metades somam bem mais que ~10 tarefas; o "Editar" do menu flutuante de link depende do diálogo de link, então os diálogos vêm primeiro. |
| G2 | **`<dialog>` nativo aberto com `showModal()`** (modal), **dentro do host** (último filho do `rte-editor`, fora de `.rte-editor__frame`), com `aria-labelledby` no título; **sem** *focus trap* próprio: a inércia do resto da página e o ciclo de `Tab` vêm do navegador. | APG *Dialog (Modal)*; `showModal()` dá *top layer*, `inert` no resto e `aria-modal` implícito nos 3 motores, sem código nosso para errar; descendente do host mantém D11 e herda tokens do tema por instância e `color-scheme` (U15); decisão de 2026-10-02 (sem CDK). |
| G3 | **Fechamento:** `Escape` (evento `cancel`), botão "Cancelar" ou aplicação. **Sem** *light dismiss* (clique no `::backdrop` não fecha; sem `closedby`). Todo fechamento que não vem de "Aplicar"/"Remover" é **cancelamento**: nada muda no documento. O código trata o evento `close` (não depende de `preventDefault` no `cancel`). | Clique acidental fora não pode descartar o que se digitou; o *close watcher* do Chromium não deixa impedir o segundo `Escape`, então o estado final é lido do `close`; um caminho só para todos os motores. |
| G4 | **Foco:** ao abrir, o primeiro campo recebe foco por `focus()` explícito depois de `showModal()` (texto selecionado); ao **aplicar** ou **remover**, o foco volta ao editável por `editor.chain().focus()` (a seleção vem do estado); ao **cancelar**, volta ao **elemento de origem** (item da barra) se ainda estiver conectado e focável, senão ao editável. | APG (foco inicial no primeiro campo de um formulário; ao fechar, voltar à origem salvo quando outro destino for mais lógico); U4 (depois de um comando se continua digitando); `autofocus` tem diferenças entre motores. |
| G5 | **Integridade:** o diálogo guarda o `doc` do estado no momento da abertura; qualquer transação que mude o documento (só caminhos programáticos, pois o editor está inerte: carga externa D9, `setContent`, API do consumidor), `disabled`/`readonly`/`hidden`, troca de `toolbar` que remova o item de origem, destruição ou recriação do editor **fecham como cancelamento**; "Aplicar" confere `editor.state.doc === docNaAbertura` antes de rodar o comando. | Com o modal aberto o documento só muda por fora; aplicar sobre outro documento usaria posições erradas; cancelar é sempre seguro (nenhuma escrita parcial). |
| G6 | **Um diálogo por vez.** Pedir outro com um aberto é recusado (`openDialog` devolve `false`); abrir um diálogo fecha antes os menus da barra (`closeMenus()`). | Modal sobre modal confunde o leitor de tela e o retorno de foco; *popover* `auto` aberto por baixo de um modal fica inacessível. |
| G7 | **Carga sob demanda:** os quatro diálogos ficam num componente interno (`RteDialogs`) dentro de **um** bloco `@defer (when dialogRequested(); prefetch on idle)` no template do `RteEditor`, com `@placeholder` vazio e `@error` que descarta o pedido (foco volta à origem; aviso em `isDevMode()`). O pedido feito antes de o *chunk* chegar é guardado e atendido quando `RteDialogs` nasce. O `RteDialogs` só é referenciado dentro do bloco (senão o *import* fica estático). | Diálogos e o *runtime* do Signal Forms saem do *bundle* inicial (o `ng-packagr` 22.1 gera o *chunk*); no servidor o `@defer` renderiza só o *placeholder* (vazio): sem HTML de diálogo no SSR e sem diferença de hidratação; `when` é de mão única, então o componente fica vivo depois da primeira carga; `prefetch on idle` tira a latência do primeiro `Mod-K`. |
| G8 | **Formulários em Signal Forms**, só APIs `@publicApi` (`form`, `[formField]`, `form[formRoot]`, `required`, `validate`, `min`, `max`, `maxLength`): um `signal` de modelo por diálogo, recriado a cada abertura com os valores atuais; erro exibido só depois de `touched` ou de uma tentativa de envio; envio inválido foca o **primeiro** campo inválido; cada campo com `<label for>`, `aria-invalid="true"` só com erro visível e `aria-describedby` apontando dica e erro; `Enter` num campo envia. Nenhum `@angular/forms` reativo/de *template*. | Spec 05 ("formulários internos em Signal Forms"); WCAG 3.3.1/3.3.2/3.3.3; mesma regra de anúncio do D13 (não acusar inválido antes da interação); `FormRoot` já põe `novalidate` e trata o `submit`. |
| G9 | **Validação do link pelo core:** a URL passa por `normalizeHref(url, linkPolicy)` com a **mesma** política mesclada que criou o editor (instância > *provider* > `DEFAULT_LINK_POLICY`); `null` = erro `rteLinkUrl`; o que se aplica é o `href` canônico devolvido. "Abrir em nova aba" só aparece com `target: 'preserve'` (com `'blank'`/`'never'` a política decide e o campo some). | Uma fonte da verdade para o que é link permitido (protocolos, relativos, domínios bloqueados, 2048 caracteres); o `setLink` do core revalida (defesa em profundidade) e o diálogo nunca aceita o que o comando recusaria. |
| G10 | **Modos do diálogo de link:** *inserir* (seleção vazia fora de link: campos URL e Texto, ambos obrigatórios) → `insertContent` de um nó de texto com a marca `link`; *aplicar* (seleção com texto, fora de link) → `setLink`; *editar* (cursor ou seleção dentro de um link) → `extendMarkRange('link').setLink(…)`, com URL e "nova aba" preenchidos; *remover* (botão só no modo editar) → `extendMarkRange('link').unsetLink()`. Cada um é **uma** cadeia (um passo de desfazer, uma emissão de valor). | Cobre os quatro casos de uso sem estados ambíguos; uma cadeia só mantém D8 e o histórico limpo; `extendMarkRange` evita editar só metade de um link. |
| G11 | **Itens novos da barra:** `link` (sempre disponível: links não têm chave em `features`), `lang` (recurso `newsBlocks`, como a regra `span[lang]` do esquema) e `quoteAuthor` (recurso `newsBlocks`). São botões com `aria-haspopup="dialog"`, **sem** `aria-pressed` (não alternam); dentro de um link/idioma o nome acessível e a dica passam a "Editar link"/"Editar idioma" e o botão ganha a classe `--active` (indicação sem cor). | Um botão que abre diálogo não é alternância (APG); o nome que muda anuncia o estado ao leitor de tela; R6 da 05b1 continua valendo (só esses botões mudam quando o estado deles muda). |
| G12 | **`Mod-K`** abre o diálogo de link por uma extensão Tiptap **do pacote Angular** (`RteUiExtension`, `addKeyboardShortcuts`), acrescentada às extensões na criação: devolve `true` (e o navegador não age) só quando o link é aplicável; senão `false`. A entrada `link: 'Mod-k'` entra na tabela de atalhos da barra (dica e `aria-keyshortcuts`) e no teste contra o *keymap*. | Convenção de Google Docs/CKEditor/Word; o *keymap* do ProseMirror só age com foco no editável e respeita composição de IME e precedência; o Link do Tiptap 3.31.4 não tem atalho; o `Ctrl+K` do navegador (busca) fica livre fora do editor. |
| G13 | **Seleção visível com o diálogo aberto:** a mesma `RteUiExtension` decora o intervalo alvo com a classe `rte-pending-selection` (decoração de *plugin*, ligada e desligada por transação **só de *meta***), removida ao fechar. | Sem foco o navegador esconde a seleção e a pessoa não vê o que vai virar link/idioma (convenção do CKEditor 5); transação só de *meta* não emite valor (D8) nem muda o `doc` (G5). |
| G14 | **Diálogo de idioma:** `<select>` com 12 idiomas comuns (`RTE_DIALOG_LANGUAGES`: `en es fr de it pt la ja zh ru ar he`, nomes em `labels.dialogs.languageNames`) e "Outro…", que mostra um campo de código BCP 47 validado por `normalizeAttribute(regra span.lang de getHtmlSchema(...), valor)` (erro `rteLangCode`); `<select>` de direção ("Padrão" = sem `dir`, `ltr`, `rtl`), que passa a `rtl` ao escolher `ar`/`he` (a pessoa pode trocar); "Remover idioma" (`extendMarkRange('rtLang').unsetLang()`) quando o trecho já tem idioma. Aplicar = `setLang({ lang, dir })` sobre a seleção (ou o trecho estendido, no modo editar). | A regra do esquema é a fonte única (o `setLang` do core usa a mesma); lista curta evita erro de digitação no caso comum e "Outro…" cobre o resto; `dir` só quando muda a direção (WCAG 1.3.2/3.1.2). |
| G15 | **Diálogo de autor da citação:** item `quoteAuthor` (habilitado com o cursor dentro de `rtPullquote`) abre campos "Autor" e "Cargo" (texto puro, opcionais, `maxLength` 200 cada, limite só da UI), preenchidos com os atributos atuais; aplicar = `updatePullquote({ author, role })`; os dois vazios removem o `figcaption` (comportamento do core). | O *toggle* `pullquote` da 05b1 continua igual (testes e atalhos intactos); autor/cargo são atributos de texto puro (B10), então formulário é o meio certo; o limite evita colar um texto inteiro por engano. |
| G16 | **Diálogo de tabela (detalhes de uma tabela nova):** entrada nova `insertTableCustom` ("Inserir tabela…") no menu `table`, desabilitada dentro de tabela como `insertTable`; campos Linhas (1–100, padrão 3), Colunas (1–20, padrão 3), "Linha de cabeçalho" (marcado) e "Coluna de cabeçalho" (desmarcado); aplicar = `insertTable({ rows, cols, withHeaderRow })` seguido de `toggleHeaderColumn()` quando pedido, na mesma cadeia. A entrada 3 × 3 da 05b1 fica e passa a se chamar "Inserir tabela 3 × 3". **Sem** legenda (ver §2). | O que a spec 05 chama "detalhes de tabela" e o core suporta são dimensões e cabeçalhos (`th` com `scope`); a legenda exigiria mudar o contrato do HTML; manter a entrada rápida evita mexer no fluxo e nos testes da 05b1; tetos razoáveis impedem criar tabelas que travam a aba. |
| G17 | **Presets** (U9 evolui): `minimal` ganha `link` no grupo das marcas (`bold italic link`); `article` ganha `link` depois de `strike`; `full` ganha `link`, `lang` (depois de `subscript`) e `quoteAuthor` (depois de `pullquote`). | Link é o item mais usado depois de negrito/itálico (comentário, artigo); idioma e autor da citação são de redação completa; a lib está antes da 1.0 (U9). |
| G18 | **API pública mínima:** `RteEditor.openDialog(kind: RteDialogKind): boolean` (`'link' \| 'lang' \| 'quoteAuthor' \| 'table'`), com as mesmas regras de aplicabilidade dos itens; `true` = pedido aceito (o diálogo abre assim que o *chunk* chegar), `false` = sem editor, não editável, recurso desligado, inaplicável ou outro diálogo aberto. A origem é o `document.activeElement` se estiver no host, senão o editável. | Quem usa `toolbar: false` (U8) monta a barra sobre a API e precisa dos diálogos; a 05d liga `onUiItem` a ela; sem ela o consumidor reimplementaria formulário e validação. |
| G19 | **Rótulos:** seção nova `dialogs` (títulos, campos, dicas, botões, nomes dos idiomas, mensagens de erro por função) e chaves novas em `toolbar` (`link`, `editLink`, `lang`, `editLang`, `quoteAuthor`, `insertTableCustom`); `insertTable` muda de texto (G16). Trocar o idioma com um diálogo aberto atualiza os textos sem fechar e sem perder o que foi digitado. | D15 da 05a (uma fonte por string, troca ao vivo); o teste de completude cobre as chaves novas nos três idiomas. |
| G20 | **CSS:** blocos `.rte-dialog*` no `editor.css` (camada `rte.components`), só tokens `--rte-*`; `::backdrop` com cor de recuo literal antes do `color-mix` sobre `--rte-text`; largura `min(32rem, 100vw - 32px)`; alvos ≥ 24 px; sem animação (nada a desligar em `prefers-reduced-motion`); borda `CanvasText` em `forced-colors`; `.rte-pending-selection` com fundo de seleção do tema. Nenhum `[style…]` nem atributo `style`. | CSP `style-src 'self'` (D16); o `::backdrop` herda propriedades customizadas do `<dialog>` nos motores atuais, e o recuo cobre os que não herdam; WCAG 2.5.8 e 1.4.11. |
| G21 | **Testes:** unitários nos alvos `test` e `test-zone` com um calço de `<dialog>` para o jsdom (`installDialogShim`, como o do *popover*); navegador real no app `e2e/angular/app` (rota `dialogs`, CSP estrita, *prerender*, hidratação, *builds* zoneless e zone) nos 3 motores. | Regra principal do repositório; `showModal`, `inert`, *top layer*, `Escape`/`cancel` e o ciclo de `Tab` só existem no navegador. |

## 4. API

```ts
// @cds/rte-angular (entry `.`) — acréscimos à API da 05b1
type RteToolbarItemId =
  | /* ids da 05b1 */ 'undo' | 'redo' | 'blockType' | 'bold' | 'italic' | 'underline' | 'strike'
  | 'code' | 'superscript' | 'subscript' | 'textColor' | 'highlight' | 'bulletList' | 'orderedList'
  | 'taskList' | 'indent' | 'outdent' | 'align' | 'blockquote' | 'codeBlock' | 'codeLanguage'
  | 'horizontalRule' | 'table' | 'callout' | 'pullquote' | 'readAlso' | 'clearFormatting'
  | 'link' | 'lang' | 'quoteAuthor';            // novos (G11)

type RteDialogKind = 'link' | 'lang' | 'quoteAuthor' | 'table';

/** Códigos da lista curta do diálogo de idioma (G14), congelado. */
const RTE_DIALOG_LANGUAGES: readonly [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'la', 'ja', 'zh', 'ru', 'ar', 'he',
];

interface RteToolbarLabels {          // 05b1 + chaves novas
  link: string; editLink: string;
  lang: string; editLang: string;
  quoteAuthor: string;
  insertTableCustom: string;          // "Inserir tabela…"; `insertTable` passa a "Inserir tabela 3 × 3"
}

interface RteDialogLabels {
  apply: string; cancel: string; remove: string;
  // link
  linkInsertTitle: string; linkEditTitle: string;
  linkUrl: string; linkUrlHint: string;          // dica: exemplos aceitos (site.com, e-mail, https://…)
  linkText: string; linkNewTab: string; linkRemove: string;
  // idioma
  langTitle: string; langEditTitle: string;
  langLanguage: string; langOther: string; langCode: string; langCodeHint: string;
  langDirection: string; langDirectionDefault: string; langDirectionLtr: string; langDirectionRtl: string;
  langRemove: string;
  languageNames: Readonly<Record<string, string>>;  // chave = código de RTE_DIALOG_LANGUAGES
  // citação
  quoteTitle: string; quoteAuthor: string; quoteRole: string;
  // tabela
  tableTitle: string; tableRows: string; tableColumns: string;
  tableHeaderRow: string; tableHeaderColumn: string; tableInsert: string;
  // erros (G8)
  errorRequired: string;
  errorLinkUrl: string;                            // rejeitado pela política
  errorLangCode: string;                           // fora da regra do esquema
  errorRange(min: number, max: number): string;
  errorMaxLength(max: number): string;
}

interface RteLabels {                 // 05b1 + seção nova
  readonly dialogs: RteDialogLabels;
}
interface RteLabelsInput {            // 05b1 + seção nova
  dialogs?: Partial<Omit<RteDialogLabels, 'languageNames'>> & {
    languageNames?: Readonly<Record<string, string>>;  // mescla por chave
  };
}

class RteEditor {                     // 05b1 + membro novo
  /** Abre um diálogo (G18). `true` = pedido aceito; o diálogo abre quando o *chunk* chegar. */
  openDialog(kind: RteDialogKind): boolean;
}

// @cds/rte-angular/i18n — os três pacotes ganham `dialogs` completa e as chaves novas de `toolbar`.
// @cds/rte-angular/styles/editor.css — + `.rte-dialog*`, `.rte-pending-selection`.
```

**Interno (não exportado):** `RteDialogs` (componente dentro do `@defer`, G7), `RteDialogRequest = { kind, origin: HTMLElement | null, doc: ProseMirrorNode, range: { from: number; to: number } }`, `RteUiExtension` (atalho `Mod-K` e decoração `rte-pending-selection`, G12/G13), `installDialogShim()` em `src/testing-support/`.

**Aplicabilidade** (vale para o item da barra, o `Mod-K` e `openDialog`; todos exigem editor editável e nenhum diálogo aberto):

| Diálogo | Item / entrada | Habilitado quando | Comando ao aplicar | Recurso |
|---|---|---|---|---|
| `link` | `link` (+ `Mod-K`) | fora de bloco de código e de `code`; seleção de texto, cursor/seleção num link, ou seleção vazia onde `can().insertContent` (texto) | inserir: `insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href, target } }] })`; aplicar: `setLink({ href, target })`; editar: `extendMarkRange('link').setLink(…)`; remover: `extendMarkRange('link').unsetLink()` | — |
| `lang` | `lang` | fora de bloco de código; seleção não vazia ou cursor num trecho `rtLang` | `setLang({ lang, dir })` (no modo editar, depois de `extendMarkRange('rtLang')`); remover: `extendMarkRange('rtLang').unsetLang()` | `newsBlocks` |
| `quoteAuthor` | `quoteAuthor` | cursor dentro de `rtPullquote` | `updatePullquote({ author, role })` | `newsBlocks` |
| `table` | entrada `insertTableCustom` do menu `table` | fora de tabela (como `insertTable`, U14) | `insertTable({ rows, cols, withHeaderRow })` + `toggleHeaderColumn()` opcional, na mesma cadeia | `tables` |

- **DOM e classes** (API pública, BEM): `dialog.rte-dialog` (`aria-labelledby` → `.rte-dialog__title`, um `<h2>`), `form.rte-dialog__form` (`[formRoot]`), `.rte-dialog__field`, `.rte-dialog__label`, `.rte-dialog__hint`, `.rte-dialog__error` (com `id`, ligado por `aria-describedby`), `.rte-dialog__actions` com, nesta ordem no DOM, "Remover" (`.rte-dialog__remove`, só nos modos de edição), "Cancelar" (`type="button"`) e "Aplicar" (`type="submit"`, `.rte-dialog__apply`); `.rte-toolbar__button--active`; `.rte-pending-selection`.

## 5. Requisitos

- **R1. Pacote e *chunk*.** O `@defer` gera um *chunk* `fesm2022/cds-rte-angular-*.mjs` no pacote; `check-pack` aceita esses arquivos no `fesm2022/` (e só eles); `verify-package` (publint + attw) verde; nenhuma dependência nova (o `@angular/forms` já é peer). Se a compilação parcial ou o `ng-packagr` não separarem o *chunk*, os diálogos ficam estáticos, o desvio vai ao ADR 0009 e R12 passa a conferir só o SSR.
- **R2. Itens e presets (G11, G17).** `link`, `lang`, `quoteAuthor` nos tipos, no modelo de itens (`RTE_TOOLBAR_ITEMS`), nos *presets* exatamente como G17 e na configuração por grupos; `lang`/`quoteAuthor` somem com `newsBlocks: false` e `insertTableCustom` com `tables: false`; habilitação pela tabela da §4; nome, dica (`title` com atalho) e `--active` mudam só ao entrar/sair de link/idioma; R6 da 05b1 continua (0 mutações na barra digitando num parágrafo).
- **R3. Base do diálogo (G2–G6).** Abrir: `showModal()`, foco no primeiro campo, resto da página inerte (clique fora não age nem fecha); `Escape` e "Cancelar" fecham sem transação de documento; um só diálogo; menus da barra fechados ao abrir; o diálogo é descendente do host (`host.contains(dialog)`); G5 inteiro (mudança externa do documento, `disabled`/`readonly`/`hidden`, destruição e recriação fecham como cancelamento; "Aplicar" com documento diferente não roda).
- **R4. Foco e D11 (G4).** Abrir e fechar (aplicando ou cancelando) **não** emitem `editorBlur`/`editorFocus`/`touch`; o `touched` do formulário não muda; aplicar devolve o foco ao editável com o cursor depois do trecho alterado (texto digitado em seguida cai ali); cancelar devolve o foco ao item de origem (ou ao editável se a origem sumiu ou se a abertura foi por `Mod-K`/`openDialog` com foco no editável); sair do host com o diálogo fechado continua emitindo uma saída (N3 da 05a).
- **R5. Link (G9, G10).** Tabela de casos documento + seleção + entrada → `getRteHtml`, cobrindo os quatro modos, um passo de desfazer e **uma** emissão de `value` cada; modo editar preenche URL e "nova aba" e estende ao link inteiro; inserir exige URL e Texto; o texto inserido não herda a marca de link para o que se digita depois.
- **R6. Política de links (G9).** Com a política padrão: `site.com` → `https://site.com/`, `a@b.com` → `mailto:a@b.com`, `javascript:alert(1)`, `data:text/html,…`, `vbscript:`, URL de 2049 caracteres e espaço puro → erro `rteLinkUrl` e nada aplicado; com `blockedDomains: ['evil.example']` → erro para `https://evil.example/x` e `sub.evil.example`; com `allowRelative: false` → erro para `/caminho` e `#ancora`; com `protocols: ['https']` → erro para `mailto:`; "nova aba" visível só com `target: 'preserve'` e o `rel` final igual ao de `getLinkAttributes`. Em todos os casos o `href` aplicado é idêntico a `normalizeHref(entrada, política)`.
- **R7. `Mod-K` (G12).** No editável, `Ctrl+K`/`⌘K` abre o diálogo de link quando aplicável e impede o padrão do navegador; inaplicável (bloco de código, `readonly`, `disabled`) não abre e não consome a tecla; durante composição de IME não abre; a dica do item mostra o atalho na notação da plataforma (U11) e `aria-keyshortcuts="Control+K"`/`"Meta+K"`.
- **R8. Seleção pendente (G13).** Com o diálogo aberto, o intervalo alvo tem `.rte-pending-selection`; ao fechar some; nenhuma das duas transações emite `value` nem entra no histórico (`undo` depois do cancelamento não faz nada).
- **R9. Idioma (G14).** Aplicar um idioma da lista e um código "Outro…" válido (`pt-BR`, `zh-Hant-TW`) produz `<span lang="…">` (e `dir` quando escolhido); códigos inválidos (`e`, `português`, `en_US`, 31 caracteres, `<x>`) dão `rteLangCode`; escolher `ar`/`he` sugere `rtl`; modo editar preenche idioma/direção do trecho e "Remover idioma" tira a marca do trecho inteiro; cor + idioma continuam como `span` aninhados (ruling 12 do ADR 0004).
- **R10. Autor da citação (G15).** Preenchido com os atributos atuais; aplicar produz o `figcaption` com `<cite>` e cargo exatamente como o core serializa; os dois vazios removem o `figcaption`; 201 caracteres dão `errorMaxLength(200)`; texto com `<b>` sai como texto (escapado), nunca como marcação.
- **R11. Tabela (G16).** Valores padrão 3 × 3 com linha de cabeçalho; limites 1–100 e 1–20 com `errorRange`; não inteiro ou vazio = erro; o resultado tem `thead`/`th scope="col"` com a linha de cabeçalho e `th scope="row"` com a coluna de cabeçalho, como o core serializa; um passo de desfazer; `insertTableCustom` desabilitado dentro de tabela.
- **R12. `@defer` e SSR (G7).** O HTML do SSR não contém `<dialog>` nem texto de diálogo; a hidratação não acusa diferença (console sem `NG05xx`); no navegador, o *chunk* dos diálogos não está entre os *scripts* da carga inicial e chega por *prefetch* ociosa ou no primeiro pedido; um pedido feito antes da chegada abre o diálogo depois dela (inclusive `Mod-K` logo após a hidratação); falha de rede no *chunk* cai no `@error` sem quebrar o editor; tudo igual nos *builds* zoneless e zone.
- **R13. Formulários (G8).** Erros só depois de `touched` ou de envio; envio inválido foca o primeiro campo inválido e não fecha; `aria-invalid`/`aria-describedby` corretos; `Enter` num campo envia; os valores iniciais vêm do estado do editor a cada abertura (abrir duas vezes não mostra o rascunho anterior).
- **R14. Tema, CSS e CSP (G20).** O diálogo herda os tokens do tema da instância (duas instâncias com primárias diferentes: botões "Aplicar" com cores diferentes); claro, escuro e `forced-colors` legíveis; nenhum atributo `style` no host, na barra ou no diálogo; 0 violações de CSP ao carregar o *chunk*, abrir, validar, aplicar e cancelar todos os diálogos (o desvio do Chromium na carga, ruling 28 do ADR 0007, continua aceito só na fase de carga); nenhuma ligação de estilo em template (teste da 05b1).
- **R15. Acessibilidade.** axe sem violações `serious`/`critical` com cada diálogo aberto (com e sem erro visível), em claro, escuro e `forced-colors`; nome acessível do diálogo = título; foco visível (`outline` de `--rte-focus-width`) em campos e botões; alvos ≥ 24 px; contraste ≥ 4,5 de rótulos, dicas e erros; o erro é anunciado pelo `aria-describedby` do campo (sem `aria-live` próprio, para não anunciar duas vezes).
- **R16. Rótulos (G19).** `dialogs` completa e sem string vazia em `RTE_LABELS_EN`/`PT_BR`/`ES` (inclusive os 12 `languageNames` e as funções de erro); trocar o idioma com o diálogo aberto atualiza título, rótulos, dicas, erros e botões, sem fechar nem apagar o que foi digitado e sem transação de documento; nenhum texto fixo em template.
- **R17. API (G18).** `openDialog` devolve `false` em cada caso de recusa e `true` nos aceitos; o diálogo aberto por ela segue R3/R4; com `toolbar: false` todos os diálogos funcionam pela API e pelo `Mod-K`.
- **R18. Tamanho e documentação.** Cenários `editor` e `whole` remedidos com o *chunk* dos diálogos **externo** (custo inicial) e cenário novo `dialogs` (o *chunk*), orçados pela regra do D26; README do pacote (diálogos, `Mod-K`, `openDialog`, política de links aplicada no diálogo, seleção pendente, nota de que a lib não trava a rolagem da página); `CLAUDE.md` se mudar algum comando; changeset do `@cds/rte-angular`.

## 6. Testes

### 6.1 Unitários (alvos `test` e `test-zone` do `@cds/rte-angular`)
Com `installDialogShim()` (calço mínimo: `showModal`/`close`/`open`/`returnValue`, eventos `cancel` e `close`; não implementa inércia nem ciclo de `Tab`, que ficam no navegador).
- `dialog-base.spec.ts`: R3 — abrir/fechar, foco inicial, um diálogo por vez, menus da barra fechados, `host.contains(dialog)`, G5 caso a caso (carga externa, `disabled`, `readonly`, `hidden`, troca de `toolbar`, destroy), "Aplicar" com `doc` diferente não roda; R4 com espiões de `editorBlur`/`editorFocus`/`touch` e o `touched` de um `[formField]`.
- `dialog-link.spec.ts`: R5 e R6 por tabela de casos (modo × política × entrada → `getRteHtml` e erro), um passo de desfazer, uma emissão de `value`; **propriedade** (fast-check, strings arbitrárias e URLs geradas): o diálogo aceita a entrada **se e somente se** `normalizeHref` não devolve `null`, e o `href` aplicado é o devolvido.
- `dialog-lang.spec.ts`, `dialog-quote.spec.ts`, `dialog-table.spec.ts`: R9, R10, R11 por tabela de casos; propriedade do código de idioma (aceito pelo diálogo ⇔ `normalizeAttribute` da regra do esquema não devolve `null`).
- `dialog-forms.spec.ts`: R13 (erros após `touched`/envio, foco no primeiro inválido, `aria-*`, valores iniciais recriados).
- `dialog-defer.spec.ts`: R12 — com `DeferBlockBehavior.Manual` do `TestBed`: pedido antes da carga atendido depois, `@error` descarta o pedido e devolve o foco, `prefetch` não abre nada.
- `toolbar-config.spec.ts`, `toolbar-state.spec.ts`, `toolbar-commands.spec.ts` (ampliados): R2 (presets, *gating*, habilitação, nome/`--active`, 0 mutações).
- `shortcuts.spec.ts` (ampliado): `Mod-k` na tabela e no *keymap* (inclusive o da `RteUiExtension`); R7 com `KeyboardEvent` e `isComposing`.
- `pending-selection.spec.ts`: R8. `api.spec.ts` (ou `index.spec.ts` ampliado): R17 e os exports novos.
- `labels.spec.ts`, `templates.spec.ts`, `ssr.spec.ts` (ampliados): R16; nenhum texto fixo nem ligação de estilo nos templates dos diálogos; SSR sem `<dialog>`.
- `css.spec.ts` (ampliado, Node): regras `.rte-dialog*` só com `--rte-*`, recuo antes de `color-mix`, regra de `forced-colors`.

### 6.2 Navegador real (Playwright, Chromium, Firefox e WebKit; app `e2e/angular/app` com CSP estrita, *prerender*, hidratação, *builds* zoneless e zone)
Rota nova `dialogs`: editor com `toolbar="full"`, todos os recursos, `linkPolicy` com `blockedDomains: ['evil.example']` e `target: 'preserve'`; segunda instância com `linkPolicy: { protocols: ['https'], allowRelative: false, target: 'never' }`, `toolbar: false` e botões que chamam `openDialog`; `[formField]` para conferir `touched`; botões de carga externa, `disabled`, `readonly` e idioma; fixture com link, trecho com idioma, citação com autor e tabela. Em `e2e/angular/`:
- **N16 link** (`editor-dialogs-link.spec.ts`): R5–R7 pela interface (clique, `Mod-K` real, teclado), os casos de política nas duas instâncias, `getRteHtml` e `Mod+Z`.
- **N17 idioma, citação e tabela** (`editor-dialogs.spec.ts`): R9–R11 pela interface, `getRteHtml` e desfazer.
- **N18 foco e modal** (`editor-dialogs-focus.spec.ts`): R3/R4/R8 com o teclado real — foco inicial, `Tab`/`Shift+Tab` ciclando só dentro do diálogo, clique fora sem efeito, `Escape` (inclusive duas vezes seguidas no Chromium), retorno à origem/editável, digitação depois de aplicar, nenhum `touched` no formulário, seleção pendente visível, G5 com carga externa durante o diálogo.
- **N19 acessibilidade** (`editor-dialogs-a11y.spec.ts`): R15 — axe por diálogo, com e sem erro, em claro, escuro e `forced-colors` (emulado, com recarga, como no N14); `toHaveAccessibleName` do diálogo; foco visível; alvos; R16 (troca de idioma ao vivo com o diálogo aberto).
- **N20 carga, SSR e CSP** (`editor-dialogs-defer.spec.ts`): R12 (HTML do servidor sem `<dialog>`, *chunk* fora da carga inicial pela lista de requisições, pedido antes da chegada com a rota do *chunk* atrasada por `page.route`, falha do *chunk* por `page.route` abortado) e R14 (0 violações de CSP em todas as fases, tema da instância herdado).
- N1–N15 continuam verdes (o N11 passa a usar o rótulo "Inserir tabela 3 × 3"; o N14 inclui os itens novos).

## 7. Critérios de aceite

- [ ] `npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size` verde; `npm run check:rules`, `check:licenses`, `notices` sem *drift*, `test:tools` (com o caso novo do `check-pack`) e `typecheck:e2e` verdes.
- [ ] Unitários 6.1 verdes nos alvos `test` e `test-zone`, inclusive as propriedades do link e do código de idioma.
- [ ] N1–N20 verdes em Chromium, Firefox e WebKit (`npx playwright test -c e2e`) e no CI do PR.
- [ ] ADR 0009 registra G1–G21, F1–F9 (como diretrizes), os *rulings*, os desvios e os tamanhos (R18); README do `rte-angular`, `docs/specs/README.md` e changeset atualizados.

## 8. Consequências para as partes seguintes e outras specs

- **05b2b (menus flutuantes):** segue o Apêndice A; o "Editar" do menu de link chama `openDialog('link')` com a origem no item do menu flutuante; menus flutuantes ficam ocultos com diálogo aberto (G6); o `Alt+F10` passa a ter a prioridade da F5.
- **05c:** os diálogos de imagem, vídeo e *embed* e os detalhes da imagem entram em `RteDialogKind` e no mesmo `RteDialogs` (mesmo `@defer`, G2–G8, G5 e a seleção pendente quando houver intervalo); o `alt` obrigatório segue G8.
- **05d:** `onUiItem` (síncrono e engolido se lançar, ADR 0005) chama `openDialog(kind)` (assíncrono por construção); `api-extractor` cobre `RteDialogKind`, `RTE_DIALOG_LANGUAGES` e `openDialog`.
- **Spec 06 / core (evolução):** legenda de tabela (`caption`) exige o core preservá-la (hoje descartada, ruling 16 do ADR 0004), um atributo de texto puro na tabela, regra de leitura sem mutar o DOM e o `content.css`; quando vier, entra como campo do diálogo de tabela.
- **Spec 08:** matriz com motores mais antigos (herança de propriedades no `::backdrop`, `<dialog>`), teclado virtual com o diálogo aberto e leitores de tela (NVDA/VoiceOver) conferindo o anúncio do título e dos erros.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| O *chunk* do `@defer` não ser separado no pacote ou no *build* do consumidor | Fatos conferidos (`inlineDynamicImports: false` no `ng-packagr` 22.1.1, `deferBlockDependencies` na compilação parcial); R1 com recuo documentado; N20 confere a lista de requisições |
| Diferenças de `<dialog>` entre motores (`cancel` duplo no Chromium, foco inicial, `Tab` para fora da página) | Estado final lido do evento `close` (G3); foco inicial explícito (G4); N18 nos 3 motores |
| jsdom sem `<dialog>` esconder defeitos | Calço mínimo só para a lógica; inércia, `Escape` e `Tab` têm caso no N18 |
| Signal Forms mudar API num *minor* do 22 | Só `@publicApi`; piso dos peers = versão testada; a matriz da spec 08 |
| Documento mudar por fora com o diálogo aberto e o comando cair em posição errada | G5 (fecha como cancelamento e confere o `doc` antes de aplicar), testado no unitário e no N18 |
| Política de links do diálogo divergir da do editor | Mesma política mesclada da criação; propriedade "aceita ⇔ `normalizeHref` ≠ `null`"; o `setLink` do core revalida |
| `Mod-K` conflitar com atalho do app do consumidor | Só age com foco no editável e quando aplicável; documentado; `openDialog` permite outro gatilho |
| Primeiro `Mod-K` lento em rede ruim (o *chunk* ainda não chegou) | `prefetch on idle`; o pedido é guardado e atendido na chegada (R12) |
| Seleção pendente (decoração) acumular transações no histórico | Transações só de *meta* fora do histórico (R8 confere `undo`) |
| Página rolar por trás do modal | Fora de escopo declarado; README orienta o CSS do consumidor (`:has(dialog[open])`) |

## Apêndice A — Diretrizes já decididas para a 05b2b (menus flutuantes)

Registradas aqui para não se perderem; a 05b2b as transforma em decisões numeradas, com API, requisitos e testes.

| # | Diretriz | Motivo |
|---|---|---|
| F1 | **Implementação própria**, sem `@tiptap/extension-bubble-menu` (não instalada; traria `@floating-ui/dom`); cada menu é um `popover="manual"` dentro do host, oculto até o primeiro `showPopover()` (lição 13 por construção). | Mesma base da U7 (sem biblioteca de posicionamento, D11, tema herdado); `manual` não fecha nem é fechado pelos menus `auto` da barra e não faz *light dismiss* no clique do editável. |
| F2 | **Regras de exibição** derivadas por transação (ponte D4) e pelo foco: *texto* = seleção de texto não vazia fora de bloco de código; *link* = cursor (seleção vazia) dentro de link; *imagem* = `NodeSelection` de imagem; *tabela* = cursor em tabela sem nenhum dos anteriores. Um por vez, prioridade imagem > link > texto > tabela. Ocultos sem foco no host, em `readonly`/`disabled`, durante arrasto do ponteiro (aparece no `pointerup`), durante composição de IME, com diálogo aberto e depois de `Escape` até a próxima mudança de seleção. | Menu contextual previsível; não piscar durante o arrasto; não competir com IME nem com o modal. |
| F3 | **Posição** pela generalização de `positionMenu` (função pura) com âncora "virtual": união de `view.coordsAtPos(from/to)` (texto/link), retângulo do nó (imagem) ou da tabela; prefere **acima**, vira para baixo, centrado na âncora e limitado à viewport com 8 px; CSSOM; reposiciona por quadro em `scroll`/`resize` só enquanto visível; oculto quando a âncora sai da interseção viewport ∩ área visível do editável. | Reaproveita U7 e o teste de propriedade; acima não cobre a linha que se edita; não flutuar sobre conteúdo alheio quando o editor rola dentro de um contêiner. |
| F4 | **Foco:** aparecer **nunca** move o foco (WCAG 3.2.1/3.2.2); o menu não é parada de `Tab`; `mousedown` com `preventDefault()` (U4). | O editável continua com o foco e a seleção; a ordem de `Tab` da 05b1 não muda. |
| F5 | **Teclado:** `Alt+F10` foca o menu flutuante visível e, sem ele, a barra (convenção do CKEditor 5); dentro, `role="toolbar"` com `RteRovingFocus`; `Escape`, `Tab` e `Shift+Tab` voltam ao editável com a seleção intacta. | Acesso por teclado sem nova tecla; reaproveita U3. |
| F6 | **Conteúdo:** *texto* = `bold italic underline strike code link` (itens existentes, mesmo estado U5); *link* = endereço canônico como `<a target="_blank" rel="noopener noreferrer">` ("Abrir"), "Editar" (`openDialog('link')`) e "Remover"; *imagem* = alinhamento `left/center/right/full` por `setImageAlign` (`aria-pressed`) e "Remover imagem" (recurso `media`); *tabela* = `addRowAfter addColumnAfter deleteRow deleteColumn` mais o menu `table` completo, com a **mesma guarda U14** (ensaios enquanto o menu está visível). | Os comandos mais usados ao alcance; nenhuma regra nova de comando; a guarda > 100 vale em todo caminho da UI. |
| F7 | **Configuração:** `floatingMenus?: boolean \| Partial<Record<'text' \| 'link' \| 'image' \| 'table', boolean>>` na entrada e em `provideRichText` (entrada > *provider* > todos ligados), ao vivo como a `toolbar`. | Quem não quer menus contextuais os desliga sem `toolbar: false`. |
| F8 | **Estado sem re-render:** os itens do menu flutuante leem os mesmos *signals* por item da barra; digitar sem mudar marca/bloco = 0 mutações no menu visível (`MutationObserver`). | R6 da 05b1 vale para todo componente da UI. |
| F9 | **Desempenho:** custo por tecla com um menu flutuante visível (e com o de tabela e seus ensaios) medido como no N15 e registrado para os orçamentos da 05d. | O reposicionamento e os ensaios rodam a cada transação. |
