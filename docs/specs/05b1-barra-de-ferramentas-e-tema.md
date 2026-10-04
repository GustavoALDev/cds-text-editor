# Spec 05b1 — Barra de ferramentas, tema por instância e CSS de conteúdo (`@cds/rte-angular`, `@cds/rte-core`)

> Parte 2a de 5 da spec 05 (ver `05-editor-angular.md`; a 05b foi dividida em **05b1**, esta, e **05b2**, menus flutuantes e diálogos). Depende da 05a (concluída: componente, ponte de signals, rótulos, `editor.css`, app de teste com CSP nos 3 motores) e da 02 (concluída: `theme.css`, `applyRteTheme`, `warnIfPoorTheme`). Consumida pela 05b2 (reaproveita o modelo de itens, o *popover* e o foco itinerante), pela 05c/05d e pela spec 06 (CSS de conteúdo).
> Decisões tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro". Fatos conferidos em 2026-10-04: `@angular/core` 22.2.1 instalado, com `afterRenderEffect` `@publicApi` (estável); `@angular/aria` **não** está instalado; no npm, `@angular/aria@22.2.1` existe (há também `22.3.0-next.0`), com `peerDependencies` `@angular/cdk: 22.2.1` (versão **exata**) e `@angular/core: ^22.0.0 || ^23.0.0`, importa `@angular/cdk/{a11y,bidi,platform}` e o entry interno `@angular/core/primitives/signals`, expõe `toolbar`, `menu`, `listbox`, `combobox`, `grid`, `tabs`, `tree` e `accordion` e **não** tem diálogo nem posicionamento; o `prosemirror-model` instalado aplica o atributo `style` por `dom.style.cssText` (CSSOM, aceito pela CSP); `@tiptap/extension-table` 3.31.4 tem `insertTable`, `addRowAfter`, `mergeCells`, `splitCell`, `toggleHeaderRow`, `toggleHeaderColumn` e `deleteTable` (e os demais comandos de linha/coluna).

## 1. Objetivo

Dar ao `rte-editor` a **barra de ferramentas**: configurável por *preset* ou por grupos, acessível pelo padrão WAI-ARIA *toolbar* (uma parada de `Tab`, foco itinerante) e *menu button* (menus em *popover* nativo), com ícones SVG internos, estado ativo/habilitado derivado da ponte de signals sem re-renderizar o que não mudou, e todos os comandos de formatação que **não** precisam de diálogo (marcas, títulos, listas, alinhamento, cores da paleta, blocos, código, tabela com a guarda de `colspan`/`rowspan` > 100, blocos de notícia, desfazer/refazer). Entregar também o **tema por instância** (`[theme]`, `provideRichText({ theme })`, `data-rte-mode`) compatível com a CSP da 05a, e o **CSS de conteúdo** `rt-*` num arquivo único do `@cds/rte-core`, usado pelo editor e pela página publicada (spec 06). Fecha duas pendências da 05a: o `blur()` disparado dentro de `effect` e os *overlays* contando como saída de foco.

## 2. Fora de escopo

Menus flutuantes (texto selecionado, link, tabela, imagem), diálogos em `<dialog>` com formulários (link com a política do core, idioma, autor da citação, detalhes de tabela), os itens `link` e `lang` da barra e o `@defer` dos diálogos (**05b2**); itens de mídia (`image`, `video`, `embed`), upload e diálogos de mídia (05c); menu `/`, busca e contadores na tela (05d; `search`/`slashCommands` seguem desligados, D1 da 05a); itens próprios do consumidor na barra (evolução; quem precisa usa `toolbar: false` e monta a sua barra sobre `editor()`); barra fixa ao rolar (`position: sticky` fica com o CSS do consumidor); regressão visual por captura de tela editor × página (spec 08; aqui a equivalência é por estilo computado); o modo `sanitize` e o leiaute da página (spec 06).

## 3. Decisões

Cada uma com o motivo. Divergências na execução viram o **ADR 0008** (barra de ferramentas e tema; o 0006 é do sanitizador, o 0007 da 05a). Numeração própria (U1…) para não colidir com o D1–D26 da 05a.

| # | Decisão | Motivo |
|---|---|---|
| U1 | **Implementação própria** do foco itinerante (*roving tabindex*) e do *menu button*, atrás de duas diretivas internas (`RteRovingFocus`, `RteMenu`), **sem** `@angular/aria`. | O `@angular/aria@22.2.1` exige `@angular/cdk` **exatamente** 22.2.1 como peer (contraria a decisão "sem CDK" e amarra cada *patch* do consumidor), importa o entry interno `@angular/core/primitives/signals` e não cobre diálogo nem posicionamento (teríamos o nosso de qualquer forma); os dois padrões que a barra usa (APG *toolbar* e *menu button*) são pequenos, e a abstração interna permite trocar depois sem mudar a API. Responde o S2 da spec 05 antiga. |
| U2 | Barra **dentro do host**, primeiro filho de `.rte-editor__frame`, `role="toolbar"`, `aria-orientation="horizontal"`, nome acessível `labels.toolbar.toolbar`; ordem de `Tab`: página → barra (item ativo) → editável → página. Grupos separados por `role="separator"` (`aria-orientation="vertical"`), sem foco. Em telas estreitas a barra **quebra linha** (`flex-wrap`), sem menu "mais". | D11 da 05a (foco entre partes internas não emite `touch`); APG *toolbar*; quebra de linha não esconde itens e não exige medir a largura. |
| U3 | **Foco itinerante:** um só item com `tabindex="0"` (o último focado; no início, o primeiro habilitado); `←`/`→` andam com volta circular (invertidos em `dir="rtl"`), `Home`/`End` vão às pontas; itens inaplicáveis ficam **focáveis** com `aria-disabled="true"` (não executam). `Alt+F10` no editável leva o foco à barra; `Escape` na barra devolve o foco ao editável com a seleção intacta. `focusToolbar()` público faz o mesmo que `Alt+F10`. | APG *toolbar* (itens desabilitados focáveis ajudam a descoberta por leitor de tela); `Alt+F10` é a convenção de CKEditor/TinyMCE; a API cobre plataformas em que `F10` é difícil. |
| U4 | **Execução de comando:** sempre `editor.chain().focus().<comando>().run()`; o foco volta ao editável depois de um item comum ou de um item de menu. Botões da barra chamam `preventDefault()` no `mousedown` (o clique não tira o foco do editável nem pisca a seleção). | Convenção de editores (CKEditor 5, Google Docs): continuar digitando sem voltar com o mouse; a seleção nativa não se perde no clique. |
| U5 | **Estado da barra (ponte, D4):** um `computed` sobre a versão da ponte calcula o estado de **todos** os itens visíveis numa transação (ativo, habilitado, valor do menu, motivo de bloqueio), uma vez por transação; cada item lê um `computed` **próprio**, com igualdade por campos, passado como `Signal` estável (nunca um objeto novo por ciclo). `rteEditorVersion` continua interno (ruling 10 da 05a). | "0 botões re-renderizados quando o estado não muda" (spec 05 §5) por construção: a vista de um item só é marcada quando o *seu* signal muda; uma leitura de estado por transação, sem `effect`. |
| U6 | **Menus da barra** (`blockType`, `textColor`, `highlight`, `align`, `codeLanguage`, `table`, `callout`) seguem o APG *menu button*: botão com `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; `Enter`/`Espaço`/`↓` abrem no primeiro item, `↑` no último; no menu, `↑`/`↓` circulares, `Home`/`End`, busca pela primeira letra, `Enter`/`Espaço` executam e fecham, `Escape` fecha e devolve o foco ao botão, `Tab` fecha e leva o foco ao editável (`Shift+Tab`, ao botão). Itens `menuitemradio` (`aria-checked`) nos menus de escolha única, `menuitem` no de tabela. | APG; o `Tab` com destino explícito evita depender de como cada motor move o foco quando o elemento focado some no `keydown`. |
| U7 | **Overlay = `popover="auto"` nativo** dentro do host (descendente no DOM, no *top layer* na tela), aberto com `showPopover()`; *light dismiss* e `Escape` vêm do navegador, e o evento `toggle` devolve o foco ao botão quando o fechamento acontece com o foco dentro do menu. **Posição calculada em TypeScript** a partir do `getBoundingClientRect()` do botão e aplicada por CSSOM (`style.setProperty('left'|'top'|'max-height', …)`), abaixo do botão, alinhada ao início (respeita `dir`), virando para cima quando falta espaço e limitada à viewport com 8 px de margem; reposiciona em `scroll` (captura) e `resize` só enquanto aberto. **Sem** posicionamento por âncora do CSS e **sem** biblioteca. | Decisão de 2026-10-02 (sem CDK); *top layer* escapa de `overflow`/`z-index` do host; descendente do host mantém D11 (fecha a pendência "overlays fora do host contam como blur") e herda tokens/`color-scheme`; CSSOM é aceito pela CSP; `anchor()` do CSS não tem suporte uniforme nos 3 motores. |
| U8 | **Configuração:** `toolbar: RteToolbarPreset \| RteToolbarGroups \| false`, na entrada e em `provideRichText({ toolbar })` (entrada > *provider* > `'article'`). Grupos são listas de ids na ordem de exibição; id desconhecido ou repetido é ignorado com aviso em modo de desenvolvimento; item cujo recurso está desligado em `features` some (junto com a extensão), e grupo vazio some. Mudar `toolbar` depois da criação **vale** (só a interface muda; o editor não é recriado). | Spec 05 §5 (presets, grupos/itens/ordem, `features` desligando o item); a barra não depende das opções de criação (D20), então pode mudar ao vivo. |
| U9 | **Presets** (`RTE_TOOLBAR_PRESETS`, congelados): `minimal` = `undo redo · bold italic · bulletList orderedList`; `article` (padrão) = `undo redo · blockType · bold italic underline strike · textColor highlight · bulletList orderedList taskList · align · blockquote codeBlock horizontalRule · table · clearFormatting`; `full` = `article` + `code superscript subscript` (no grupo das marcas), `indent outdent` (listas), `codeLanguage` (blocos), `callout pullquote readAlso` (grupo novo antes de `clearFormatting`). A 05b2 acrescenta `link`/`lang` e a 05c os itens de mídia aos presets. | Cobrem os casos comuns (comentário, artigo, redação completa); a lib está antes da 1.0 (presets evoluem por parte). |
| U10 | **Estados do editor na barra:** sem `Editor` (SSR, casca, antes da criação), `disabled` ou `readonly`: a barra é renderizada com **todos** os botões `disabled` nativos (fora da ordem de foco, nenhum menu abre), mesmo leiaute. `hidden` esconde tudo. | Sem salto de leiaute na hidratação (R12 da 05a); D10 da 05a (desabilitado fora da ordem de foco; somente leitura não edita). |
| U11 | **Nome e dica:** `aria-label` = rótulo do item; `title` = rótulo + atalho na notação da plataforma (por exemplo "Negrito (Ctrl+B)" / "Negrito (⌘B)"); `aria-keyshortcuts` com o atalho real; ícone SVG `aria-hidden="true"` `focusable="false"`. A plataforma é lida no navegador depois do primeiro render (o SSR usa a notação `Ctrl`). O menu `blockType` mostra o **texto** do bloco atual (por exemplo "Título 2") em vez de ícone. | Dica nativa é controlada pelo navegador (exceção do WCAG 1.4.13, sem lógica de dispensar); o atalho visível e programático vem de uma tabela só, conferida por teste contra o *keymap* do Tiptap; ler a plataforma depois do render evita diferença de hidratação. |
| U12 | **Ícones SVG internos** copiados do Lucide (licença ISC, compatível com MIT) como dados de *path* (`d`) em `src/toolbar/icons.ts`, com o aviso ISC no cabeçalho do arquivo e no `THIRD-PARTY-NOTICES.md` (seção de código incorporado); desenho por `@for` de `<path [attr.d]>` com `stroke="currentColor"`, sem componente por ícone. | Decisão de 2026-10-02 (sem `lucide-angular`); conjunto coeso e revisado em vez de desenho próprio; nenhuma dependência de execução; atributo SVG não é estilo (CSP). |
| U13 | **Cores da paleta:** os menus `textColor`/`highlight` listam a paleta do esquema ativo (`getHtmlSchema(...).palette`) com **amostra e nome** (`labels.toolbar.colorNames`, nome cru se faltar rótulo) e um item "Cor padrão" (`unsetTextColor`/`unsetHighlight`); a amostra é pintada por classe (`rte-swatch[data-rte-color]`) com os valores claro/escuro da paleta, nunca por `style`. | WCAG 1.4.1 (não só cor); a paleta é fechada no core; sem atributo `style` no HTML do SSR (CSP). |
| U14 | **Guarda de tabela > 100** por **ensaio**: cada operação de tabela que pode crescer (`addRowBefore/After`, `addColumnBefore/After`, `mergeCells`) roda contra o estado atual com um `dispatch` que só captura a transação; se o documento resultante tem célula com `colspan` ou `rowspan` > 100, o item fica `aria-disabled` com o motivo `labels.toolbar.spanLimit` no `title`, e o clique não faz nada. Ensaios só com o menu de tabela **aberto** (recalculados a cada transação enquanto aberto). `insertTable` (3 × 3, linha de cabeçalho) fica desabilitado dentro de tabela. A guarda vale para a barra (e para o menu de tabela da 05b2); chamadas diretas à API do Tiptap continuam como no ADR 0004 (saem com 1 no HTML), documentado. | Consequência do ADR 0004 (pendência das tabelas); o ensaio mede o resultado real de cada comando do `prosemirror-tables`, sem reimplementar a geometria de `TableMap`; abrir o menu limita o custo; tabela dentro de tabela segue o ruling 5 do ADR 0005. |
| U15 | **Tema por instância:** entrada `theme: RteTheme` e `provideRichText({ theme })`, mesclados **por chave** (instância > *provider*); aplicado com `applyRteTheme(host, tema)` do `@cds/rte-theme` num `afterRenderEffect` (só no navegador), com a limpeza anterior chamada a cada mudança e no destroy; sem tema em lugar nenhum, nada é aplicado (vale o CSS em cascata). `data-rte-mode` vem também de uma ligação de *host* (sai no HTML do SSR; atributo, não estilo). Em modo de desenvolvimento (`ngDevMode`), `warnIfPoorTheme` uma vez por tema diferente. **Nenhum** `[style.*]` no *host* nem nos templates. O grafo do lint passa a permitir `scope:angular` → `scope:theme`. | `applyRteTheme` usa `style.setProperty` (CSSOM, aceito por `style-src 'self'`) e traz o plano B sem duplicar fórmula (regra do `CLAUDE.md`: `theme.css` e plano B andam juntos); ligação de estilo do Angular viraria atributo `style` no HTML do SSR (violação de CSP); a spec 02 (R9) prevê o Angular chamando `warnIfPoorTheme`; `ngDevMode` some no *build* de produção. |
| U16 | **CSS de conteúdo** em `@cds/rte-core/styles/content.css` (arquivo exportado, sem JS), camada `rte.content`, seletores sempre sob `.rte-content`, tokens herdados de um ancestral `.rte-root`: tipografia (parágrafos, `h2`–`h4`, listas, `blockquote`, `hr`, `code`, `pre`, `a`, `sup`/`sub`), tabelas (bordas, cabeçalho), tarefas (aparência), figuras (`rt-figure--left/center/right/full/video`, `figcaption`, `rt-credit`), vídeo e *embeds* responsivos, citação em destaque, caixas ×4 e "Leia também", cores da paleta. A aparência que hoje está no `editor.css` (bordas de célula, fundo do `pre`) **sai** de lá; o `editor.css` fica só com o funcional da edição. Ordem de inclusão: `theme.css` → `content.css` → `editor.css`. | O core é dono do contrato `rt-*` (esquema) e é dependência comum do `rte-angular` e do `rte-render` (o render não pode depender do Angular, consequência da 05a §8); um teste ao lado do esquema garante que toda classe do esquema tem regra; fecha a pendência "aparência no `editor.css`". |
| U17 | **Cores da paleta no escuro:** `content.css` pinta `span[data-rt-color]`/`mark[data-rt-color]` com `light-dark(claro, escuro)` da paleta, através de propriedades customizadas (`--rte-content-color`, `--rte-content-highlight`) que o consumidor pode sobrescrever, e com `!important` **só** em `color`/`background-color` desses dois seletores (única exceção do D18 da 05a). | O HTML canônico traz `style="color:<claro>"` (para leitores sem CSS: feed, e-mail), e um atributo `style` vence qualquer regra sem `!important`; sem a exceção, o texto colorido fica com a cor clara no modo escuro (contraste quebrado); a variável mantém a personalização sem competir com `!important`. |
| U18 | **Correção do `blur` (pendência da 05a):** o `blur()` do elemento focado quando o editor fica `disabled`/`hidden` passa de `effect` para `afterRenderEffect` (fase `write`), então `editorBlur`/`touch` saem **depois** da detecção de mudanças. | Emitir saídas e mudar estado do formulário durante a detecção pode dar `ExpressionChangedAfterItHasBeenChecked` e ciclos extras; `afterRenderEffect` é a API estável do 22 para efeitos sobre o DOM. |
| U19 | **Tamanho:** a barra faz parte do `RteEditor` (sem componente separado a importar); o orçamento do cenário `editor` é remedido pela regra do D26 e o ADR 0008 registra o acréscimo (barra, ícones, `applyRteTheme`). | Uma API só (`toolbar: false` para quem não quer a barra); o custo é pequeno perto do *chunk* do Tiptap (155 kB transferidos, ADR 0007 (d)) e fica medido. |
| U20 | **Testes:** unitários pelos alvos `test` e `test-zone` (Vitest + jsdom; o *popover* é simulado em jsdom, que não o implementa); navegador real no app de teste `e2e/angular/app` (prerender, hidratação, CSP estrita, *builds* zoneless e zone) nos 3 motores; "0 re-render" verificado por `MutationObserver` na barra, nos dois níveis. | Regra principal do repositório; o *popover*, o *top layer*, o posicionamento e o teclado real só existem no navegador; mutação de DOM é o efeito observável de um re-render. |

## 4. API

```ts
// @cds/rte-angular (entry `.`) — acréscimos à API da 05a
import type { InputSignal } from '@angular/core';
import type { RteTheme } from '@cds/rte-theme';

type RteToolbarItemId =
  | 'undo' | 'redo'
  | 'blockType'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'superscript' | 'subscript'
  | 'textColor' | 'highlight'
  | 'bulletList' | 'orderedList' | 'taskList' | 'indent' | 'outdent'
  | 'align'
  | 'blockquote' | 'codeBlock' | 'codeLanguage' | 'horizontalRule'
  | 'table'
  | 'callout' | 'pullquote' | 'readAlso'
  | 'clearFormatting';              // a 05b2 acrescenta 'link' | 'lang'; a 05c, os de mídia
type RteToolbarPreset = 'minimal' | 'article' | 'full';
type RteToolbarGroups = readonly (readonly RteToolbarItemId[])[];
type RteToolbarConfig = RteToolbarPreset | RteToolbarGroups | false;
const RTE_TOOLBAR_PRESETS: Readonly<Record<RteToolbarPreset, RteToolbarGroups>>;   // congelado (U9)

interface RteToolbarLabels {
  toolbar: string;                                  // nome acessível da barra
  undo: string; redo: string;
  blockType: string; paragraph: string; heading(level: 2 | 3 | 4): string;
  bold: string; italic: string; underline: string; strike: string; code: string;
  superscript: string; subscript: string;
  textColor: string; highlight: string; defaultColor: string;
  colorNames: Readonly<Record<string, string>>;     // nomes da paleta (texto e marca-texto)
  bulletList: string; orderedList: string; taskList: string; indent: string; outdent: string;
  align: string; alignLeft: string; alignCenter: string; alignRight: string; alignJustify: string;
  blockquote: string; codeBlock: string; codeLanguage: string; plainText: string;
  horizontalRule: string;
  table: string; insertTable: string;
  addRowBefore: string; addRowAfter: string; addColumnBefore: string; addColumnAfter: string;
  deleteRow: string; deleteColumn: string; mergeCells: string; splitCell: string;
  toggleHeaderRow: string; toggleHeaderColumn: string; deleteTable: string;
  spanLimit: string;                                // motivo da guarda (U14)
  callout: string; removeCallout: string;           // variantes: content.calloutTitles
  pullquote: string; readAlso: string; clearFormatting: string;
}
interface RteLabels {            // 05a + seção nova
  readonly toolbar: RteToolbarLabels;
}
interface RteLabelsInput {       // 05a + seção nova
  toolbar?: Partial<Omit<RteToolbarLabels, 'colorNames'>> & {
    colorNames?: Readonly<Record<string, string>>;  // mescla por chave
  };
}

interface RteConfig {            // 05a + chaves novas
  toolbar?: RteToolbarConfig;    // padrão 'article'
  theme?: RteTheme;              // padrão: nenhum (CSS em cascata)
}

class RteEditor {                // 05a + membros novos
  readonly toolbar: InputSignal<RteToolbarConfig | undefined>;   // ao vivo (U8)
  readonly theme: InputSignal<RteTheme | undefined>;             // ao vivo (U15)
  /** Leva o foco ao item ativo da barra (U3); sem barra ou sem editor, não faz nada. */
  focusToolbar(): void;
}
// host: + [attr.data-rte-mode] (modo do tema mesclado; ausente sem modo)

// @cds/rte-angular/i18n — os três pacotes ganham a seção `toolbar` completa.

// @cds/rte-core/styles/content.css   (arquivo CSS exportado; sem JS) (U16, U17)
// @cds/rte-angular/styles/editor.css (só o funcional da edição + barra e menus)
```

**Itens** (todos executam `editor.chain().focus().<comando>().run()`, U4). "Recurso" é a chave de `features` que, desligada, remove o item (U8). Atalhos: os registrados pelas extensões do Tiptap 3.31.4/core, lidos de uma tabela única e conferidos por teste contra o *keymap* (U11).

| Id | Tipo | Comando | Ativo | Habilitado (além do editor editável) | Recurso |
|---|---|---|---|---|---|
| `undo`/`redo` | botão | `undo()`/`redo()` | — | `can().undo()`/`can().redo()` | — |
| `blockType` | menu radio | Parágrafo `setParagraph()`; Título *n* `setHeading({ level: n })`, *n* ∈ 2–4 | bloco do cursor | algum dos comandos `can()` | — |
| `bold` `italic` `underline` `strike` `code` `superscript` `subscript` | alternância (`aria-pressed`) | `toggle<Marca>()` | `isActive(marca)` | `can().toggle<Marca>()` | — |
| `textColor`/`highlight` | menu radio | `setTextColor(nome)`/`setHighlight(nome)`; "Cor padrão" `unsetTextColor()`/`unsetHighlight()` | `getAttributes(marca).color` | `can()` do comando | `colors` |
| `bulletList`/`orderedList` | alternância | `toggleBulletList()`/`toggleOrderedList()` | `isActive` | `can()` | — |
| `taskList` | alternância | `toggleTaskList()` | `isActive('rtTaskList')` | `can()` | `tasks` |
| `indent`/`outdent` | botão | `sinkListItem(t)`/`liftListItem(t)`, `t` = tipo do item do cursor (item de lista ou de tarefa) | — | `can()` | — |
| `align` | menu radio | `setTextAlign('left'\|'center'\|'right'\|'justify')` | `getAttributes(bloco).textAlign` | `can()` | — |
| `blockquote` | alternância | `toggleBlockquote()` | `isActive` | `can()` | — |
| `codeBlock` | alternância | `toggleCodeBlock()` | `isActive('codeBlock')` | `can()` | `code` |
| `codeLanguage` | menu radio | `setCodeBlockLanguage(id \| null)` ("Texto simples" = `null`), itens = `codeLanguages` da criação (`name`) | linguagem do bloco | cursor num bloco de código | `code`; some sem `codeLanguages` |
| `horizontalRule` | botão | `setHorizontalRule()` | — | `can()` | — |
| `table` | menu | `insertTable({ rows: 3, cols: 3, withHeaderRow: true })`; `addRowBefore/After`, `addColumnBefore/After`, `deleteRow`, `deleteColumn`, `mergeCells`, `splitCell`, `toggleHeaderRow`, `toggleHeaderColumn`, `deleteTable` | — | inserir: fora de tabela; operações: dentro de tabela, `can()` e a guarda (U14) | `tables` |
| `callout` | menu radio | 4 variantes: `setCalloutVariant(v)` dentro de caixa, senão `setCallout(v)`; "Remover caixa" `unsetCallout()` | variante do cursor | `can()` | `newsBlocks` |
| `pullquote` | alternância | `setPullquote()`/`unsetPullquote()` | `isActive('rtPullquote')` | `can()` | `newsBlocks` |
| `readAlso` | botão | `insertReadAlso()` | — | `can()` | `newsBlocks` |
| `clearFormatting` | botão | `unsetAllMarks()` | — | seleção com alguma marca | — |

- **DOM e classes** (API pública, BEM): `.rte-toolbar` (`role="toolbar"`), `.rte-toolbar__button` (+ `--pressed`, `--menu`), `.rte-toolbar__separator`, `.rte-menu` (`popover="auto"`, `role="menu"`), `.rte-menu__item` (+ `--checked`), `.rte-swatch[data-rte-color]`, `.rte-icon`.
- **Tokens do componente:** só `--rte-*` do tema; alvo de toque ≥ 24 × 24 px CSS em qualquer `--rte-density` (WCAG 2.5.8); estado pressionado e item marcado distinguíveis sem cor (borda/ícone de marca) e visíveis em `forced-colors`.

## 5. Requisitos

- **R1. Pacotes.** `@cds/rte-angular`: entry `.` com os acréscimos da §4; `@cds/rte-theme` passa a peer **com import** (sai de `ignoredDependencies`), e a regra de tags permite `scope:angular` → `scope:theme`. `@cds/rte-core`: `exports["./styles/content.css"]`, `sideEffects: ["**/*.css"]`, `files` com `styles`; o `check-pack` aceita o arquivo. `verify-package` (publint + attw) verde nos dois.
- **R2. Configuração (U8, U9).** Presets exatamente como U9; grupos na ordem dada; id desconhecido/repetido ignorado com um aviso por id em modo de desenvolvimento; item de recurso desligado e grupo vazio somem; `false` não renderiza barra; prioridade entrada > *provider* > `'article'`; mudar `toolbar` ao vivo troca a barra sem recriar o editor nem emitir valor.
- **R3. Teclado da barra (U2, U3).** Uma parada de `Tab`; `←`/`→`/`Home`/`End` com volta circular e `rtl`; o item ativo é lembrado entre visitas; separadores e itens ausentes nunca recebem foco; itens inaplicáveis focáveis com `aria-disabled` e sem efeito; `Alt+F10` (editável) e `focusToolbar()` focam o item ativo; `Escape` volta ao editável com a mesma seleção; nenhum foco preso (WCAG 2.1.2).
- **R4. Menus (U6, U7).** Padrão APG completo da U6; `aria-expanded`/`aria-controls` corretos; um menu aberto por vez; *light dismiss* fecha sem executar; fechar com o foco dentro devolve o foco ao botão; o menu fica inteiro na viewport (vira para cima, limita à borda, rola por dentro se não couber) e acompanha `scroll`/`resize` enquanto aberto; o menu é descendente do host (`host.contains(menu)`), e focar nele **não** emite `editorBlur`/`touch`.
- **R5. Comandos (§4).** Cada item produz o HTML esperado em `getRteHtml` a partir de um documento conhecido (tabela de casos), num só passo de desfazer; o foco volta ao editável (U4); o clique não tira a seleção (U4); estados `aria-pressed`/`aria-checked` e o texto do `blockType` seguem a seleção.
- **R6. Estado sem re-render (U5).** Uma transação calcula o estado da barra no máximo uma vez; digitar texto num parágrafo sem mudar marca/bloco gera **0** mutações de DOM na barra (`MutationObserver` em `subtree`, `attributes`, `childList`, `characterData`); mover o cursor para dentro de um negrito muda **só** o botão `bold`; o estado não serializa o documento.
- **R7. Estados do editor (U10).** Antes da criação, no SSR, `disabled` e `readonly`: todos os botões `disabled` nativos e nenhum na ordem de `Tab`; voltar a editável reabilita no mesmo ciclo; a moldura não muda de tamanho na troca casca → editor com a barra.
- **R8. Tabela (U14).** Com uma célula de `colspan`/`rowspan` 100, as operações que passariam de 100 ficam `aria-disabled` com o motivo e não alteram o documento; as demais funcionam; `addRowAfter` na última linha cria a linha (o `Tab` não cria, decisão 34 do ADR 0004); `insertTable` desabilitado dentro de tabela; o ensaio não despacha transação nem muda o histórico.
- **R9. Cores (U13, U17).** Os menus listam exatamente a paleta do esquema, com amostra e nome; "Cor padrão" remove a marca; no modo escuro, o texto e o marca-texto do conteúdo usam o valor `dark` da paleta mesmo com o `style` claro no HTML; a variável `--rte-content-color`/`--rte-content-highlight` do consumidor vence.
- **R10. Tema (U15).** `[theme]` e `provideRichText({ theme })` aplicam sementes, `neutral` e `mode` ao host pelo `applyRteTheme`; duas instâncias na mesma página com temas diferentes não interferem; trocar o tema ao vivo reaplica e mudar para `undefined` limpa; o destroy limpa; no SSR, `data-rte-mode` sai no HTML e **nenhum** atributo `style` sai no host nem na barra; nenhuma violação de CSP ao aplicar, trocar e limpar; `warnIfPoorTheme` uma vez por tema diferente só em desenvolvimento; menus e (na 05b2) diálogos herdam o tema da instância.
- **R11. CSS de conteúdo (U16, U17).** `content.css` em `@layer rte.content`, todo seletor começa por `.rte-content`, cores só por `--rte-*` ou pela paleta, `!important` só nas duas regras da U17; **toda** classe `rt-*` do esquema com todos os recursos ligados e todo `data-rt-color` da paleta têm regra; os literais da paleta no CSS são iguais a `RTE_TEXT_COLORS`/`RTE_HIGHLIGHT_COLORS`; `color-mix` sempre precedido de um valor de recuo; nenhum seletor repetido entre `content.css` e `editor.css`, e o `editor.css` não estiliza a aparência de `rt-*` nem de `table`/`pre` (só o funcional da edição). Contraste ≥ 4,5 do texto das caixas, da citação, dos links e das cores da paleta sobre a superfície, no tema padrão, claro e escuro.
- **R12. Equivalência editor × página.** O fixture `all-features` no editor e o mesmo HTML numa página estática com `content.css` (`.rte-root > .rte-content`) têm os mesmos estilos computados numa lista fixa de elementos e propriedades (fonte, tamanho, altura de linha, margens, cores, bordas, alinhamento de figuras), exceto o que só existe na edição (alças, `tableWrapper`, *placeholder*) e o que vem do atributo `style` bloqueado pela CSP na página estática (`text-align`, larguras de coluna) — registrado como consequência para a spec 06.
- **R13. Blur (U18).** `disabled`/`hidden` com o foco dentro emitem `editorBlur`/`touch` uma vez, **depois** da detecção de mudanças, sem erro `NG0100` em modo de desenvolvimento, nos dois modos (zoneless e zone).
- **R14. Acessibilidade.** axe sem violações `serious`/`critical` com a barra `full`, com um menu aberto, em claro, escuro e `forced-colors`; foco visível (`outline` de `--rte-focus-width`) em botões e itens de menu; alvos ≥ 24 px; nomes acessíveis de todos os itens nos 3 idiomas.
- **R15. Rótulos.** Seção `toolbar` completa e sem string vazia em `RTE_LABELS_EN`/`PT_BR`/`ES` (o teste de completude da 05a cobre as chaves novas, inclusive todos os nomes da paleta e `heading(2|3|4)`); trocar o idioma ao vivo atualiza nomes, dicas e o texto do `blockType` sem transação de documento; nenhum texto fixo em template (teste da 05a).
- **R16. CSP e guardas.** Com a CSP da 05a, nenhuma violação ao abrir/fechar menus, posicionar, aplicar tema e executar todos os itens (o desvio do Chromium na carga, ruling 28 do ADR 0007, continua aceito só na fase de carga); nenhum `[style…]`/`[ngStyle]` em template do pacote (teste); as guardas de lint da 05a valem para o código novo.
- **R17. Tamanho e documentação.** Cenários `editor` e `whole` remedidos e orçados pela regra do D26; README do pacote (barra, presets, grupos, atalhos, `Alt+F10`, tema por instância, ordem dos três CSS, exceção `!important` da paleta) e README do core (`content.css`); `CLAUDE.md` atualizado (grafo `angular` → `theme`, `content.css` no core); `THIRD-PARTY-NOTICES.md` com o Lucide.

## 6. Testes

### 6.1 Unitários (alvos `test` e `test-zone` do `@cds/rte-angular`; Node no core)
- `toolbar-config.spec.ts`: R2 — presets literais, grupos, ids desconhecidos/repetidos com aviso único, gating por cada recurso, grupo vazio, `false`, prioridade, troca ao vivo sem recriar (espião no construtor do `Editor`) e sem emitir `value`.
- `toolbar-state.spec.ts`: estado de cada item da §4 para seleções conhecidas; contador de notificações por item (R6); `MutationObserver` do jsdom: 0 mutações digitando, só `bold` ao entrar num negrito; texto do `blockType`.
- `toolbar-commands.spec.ts`: R5 — tabela de casos item → `getRteHtml`, um passo de desfazer cada, `focus` chamado.
- `roving-focus.spec.ts` e `menu.spec.ts`: R3/R4 com eventos de teclado (inclusive `rtl`, busca pela primeira letra, `Tab`/`Shift+Tab` do menu); *popover* simulado (`showPopover`/`hidePopover`/`toggle`) porque o jsdom não o implementa; `host.contains(menu)` e ausência de `editorBlur`/`touch`.
- `table-guard.spec.ts`: R8 com casos fixos (colspan/rowspan 100 nas bordas e no meio, `mergeCells` que daria 101) e **propriedade** (fast-check, tabelas geradas com spans 1–100): o item está bloqueado se e somente se o comando, aplicado de verdade num estado copiado, produz span > 100; o ensaio não muda `editor.state`.
- `theme.spec.ts`: R10 com espião de `applyRteTheme` (mescla por chave, reaplicação, limpeza na troca para `undefined` e no destroy, `data-rte-mode`), `warnIfPoorTheme` só com `ngDevMode`, nenhum atributo `style` no host.
- `blur.spec.ts`: R13 — ordem dos eventos em relação à detecção (sem `NG0100`) nos dois modos.
- `labels.spec.ts` (ampliado): R15. `icons.spec.ts`: todo item tem ícone; SVG `aria-hidden`/`focusable="false"`; cabeçalho ISC presente. `templates.spec.ts` (ampliado): nenhuma ligação de estilo (R16). `ssr.spec.ts` (ampliado): barra com botões `disabled`, `data-rte-mode`, nenhum `style`.
- `css.spec.ts` (ampliado, Node): `editor.css` sem regras de aparência `rt-*`/`table`/`pre` e sem seletor em comum com o `content.css`; regras para `.rte-toolbar*`, `.rte-menu*`, `.rte-swatch` com a paleta literal igual à do core.
- **Core** `packages/core/src/content-css.spec.ts` (Node): R11 — camadas, prefixo `.rte-content`, `!important` só nas regras da U17, cobertura de toda classe de `getHtmlSchema` com todos os recursos e da paleta, literais iguais às constantes, recuo antes de `color-mix`.

### 6.2 Navegador real (Playwright, Chromium, Firefox e WebKit; app `e2e/angular/app` com CSP estrita, *prerender*, hidratação, *builds* zoneless e zone)
Rotas novas: `toolbar` (editor com `toolbar="full"`, todos os recursos, `codeLanguages`, alternância de preset, idioma, `disabled`/`readonly` e tema) e `content-static` (o `all-features.html` dentro de `.rte-root > .rte-content`, com `theme.css` e `content.css`, sem editor). Em `e2e/angular/`:
- **N9 teclado da barra** (`editor-toolbar-keyboard.spec.ts`): R3 com o teclado real, incluindo `Tab`/`Shift+Tab` página ↔ barra ↔ editável, `Alt+F10`, `Escape` com a seleção preservada (texto digitado depois cai no lugar certo) e aplicação de marca pelo teclado.
- **N10 menus** (`editor-toolbar-menus.spec.ts`): R4 — abrir por `Enter`/`Espaço`/`↓`/`↑` e clique, navegar, busca por letra, `Escape`, `Tab`, *light dismiss*; posição dentro da viewport com o editor no pé da página e dentro de um contêiner com rolagem (vira para cima, acompanha a rolagem); foco no menu sem `touched` no formulário (pendência da 05a).
- **N11 comandos** (`editor-toolbar-commands.spec.ts`): R5 pela interface (clique e teclado) com o HTML do modelo; R8 com o fixture de tabela de span 100 (motivo no `title`, documento inalterado) e `addRowAfter` na última linha; R9 aplicar e remover cores; recursos desligados escondem itens.
- **N12 tema** (`editor-theme.spec.ts`): R10 — duas instâncias com primárias diferentes (tokens computados diferentes), `mode: 'dark'` numa só, troca ao vivo, limpeza; HTML do SSR com `data-rte-mode` e sem `style`; 0 violações de CSP; menu aberto herda as cores da instância.
- **N13 CSS de conteúdo** (`editor-content-css.spec.ts`): R12 (editor × `content-static`, claro e escuro) e R9/R11 (cor `dark` da paleta vencendo o `style`, variável do consumidor vencendo, contrastes medidos no estilo computado).
- **N14 acessibilidade** (`editor-toolbar-a11y.spec.ts`): R14 — axe com barra `full` e menu aberto em claro, escuro e `forced-colors` (emulado, com recarga, como no tema); foco visível; tamanho dos alvos; R7 (estados) e R15 (troca de idioma ao vivo).
- **N15 desempenho** (`editor-toolbar-perf.spec.ts`): R6 obrigatório (0 mutações na barra em 50 teclas num parágrafo); custo por tecla no documento de 20 mil palavras com a barra `full` (mediana e p95) comparado ao N8 da 05a, informativo, registrado no ADR 0008 para os orçamentos da 05d.
- N1–N8 da 05a continuam verdes (o N4 passa a conferir a barra na casca; o N5 passa a carregar o `content.css`).

## 7. Critérios de aceite

- [x] `npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size` verde (inclusive `core`); `npm run check:rules`, `check:licenses`, `notices` sem drift (com o Lucide), `test:tools` e `typecheck:e2e` verdes. _Evidência: `angular:size`, `core:size` e `theme:size` verdes; `check:rules`, `check:licenses`, `typecheck:e2e` verdes; `test:tools` 72/72; `notices` sem diff. No `run-many` em paralelo houve estouros de tempo por carga em `core:test` e no `angular:test-zone` (ciclo de vida 100×), que passam isolados; **pendente para a onda final de correções** (estabilizar sob carga)._
- [x] Unitários 6.1 verdes nos alvos `test` e `test-zone`, inclusive a propriedade da guarda de tabela (R8) e o teste de CSS do core (R11). _Evidência: verdes isolados; ver a ressalva de carga acima (propriedade da guarda leva 45–55 s em 100 execuções)._
- [ ] N1–N15 verdes em Chromium, Firefox e WebKit (`npx playwright test -c e2e`) e no CI do PR. _Evidência local: `npx playwright test -c e2e --workers=4`, 733 passaram, 25 ignorados (embeds externos), 1 falha em WebKit (`E4: Tab alcança o checkbox e Space o alterna`, da 04, intermitente sob carga: 30/30 verdes em `--repeat-each=5` isolado); Firefox não travou. **CI do PR pendente.**_
- [x] ADR 0008 registra U1–U20, os rulings, os desvios, os números do N15 e os tamanhos (R17); README do `rte-angular` e do core, `CLAUDE.md` e `docs/specs/README.md` atualizados; changesets do `@cds/rte-angular` e do `@cds/rte-core` registrados.

## 8. Consequências para as partes seguintes e outras specs

- **05b2:** reaproveita `RteRovingFocus`, `RteMenu`, o posicionamento da U7 e o modelo de itens/estado (U5) nos menus flutuantes de texto, link, tabela (mesma guarda U14) e imagem; acrescenta `link`/`lang` à barra e aos presets; diálogos em `<dialog>` nativo dentro do host (herdam tema e D11), formulários em Signal Forms e `@defer`; seção `dialogs` dos rótulos.
- **05c:** itens `image`/`video`/`embed` entram no modelo de itens e nos presets; diálogos de mídia sobre a base de diálogo da 05b2.
- **05d:** os orçamentos de desempenho consideram o custo da barra medido no N15.
- **Spec 06:** o `rte-render` **não** tem CSS de conteúdo próprio: usa `@cds/rte-core/styles/content.css` (o R4 da spec 06, "`rte-content.css` (entry `/styles`)", passa a ser só o CSS de leitura específico do render, como o sumário e a rolagem de tabelas); o contêiner precisa de `.rte-root` (tokens) e `.rte-content`; com CSP sem `'unsafe-inline'` em `style-src-attr`, o `text-align` e as larguras de coluna do HTML publicado (atributo `style`) não se aplicam — a spec 06 decide (aplicar por CSSOM, aceitar ou documentar); as cores da paleta não dependem disso (U17).
- **Spec 08:** regressão visual editor × página por captura de tela e a matriz de navegadores mais antigos (plano B do tema, `popover`).

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Diferenças de `popover`/*top layer* entre motores (foco ao fechar, *light dismiss*, `toggle`) | Foco devolvido explicitamente pelo nosso código no `toggle`; N10 nos 3 motores; destino do `Tab` explícito (U6) |
| jsdom sem `popover` esconder defeitos nos unitários | Simulação mínima só para a lógica; todo comportamento de *popover* tem caso no N10 |
| Implementação própria do APG errar detalhes que o `@angular/aria` já trata | Casos de teclado tirados do APG em N9/N10 e axe no N14; diretivas internas permitem trocar pelo `@angular/aria` depois (U1) |
| `Alt+F10` capturado pelo sistema ou pelo navegador em alguma plataforma | `focusToolbar()` público e `Shift+Tab` do editável chegam à barra; documentado |
| Ensaio da guarda de tabela custar caro em tabelas grandes | Só com o menu de tabela aberto; medido no N15 se necessário |
| `!important` da paleta conflitar com CSS do consumidor | Personalização pela variável (`--rte-content-color`); exceção única, conferida por teste |
| Licença dos ícones (ISC) esquecida na distribuição | Cabeçalho no arquivo, `THIRD-PARTY-NOTICES.md` e teste em `icons.spec.ts`; `check:licenses` |
| `applyRteTheme` e a barra aumentarem o bundle de quem não usa tema | Medido e orçado (U19); opção futura registrada no ADR 0008: carregar o plano B sob demanda (ADR 0002 já a descreve) |
| Estado de muitos itens por transação pesar em documento grande | Um cálculo por transação (U5), só para itens visíveis; N15 compara com o N8 da 05a |
| Diferença de hidratação na dica de atalho por plataforma | Plataforma lida depois do primeiro render (U11); N4 confere o console |
| `content.css` divergir do que a spec 06 precisar | Arquivo único no core; a spec 06 só acrescenta CSS de leitura próprio; R12 compara editor × página estática |
