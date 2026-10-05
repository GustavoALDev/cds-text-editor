import {
  afterNextRender,
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  isDevMode,
  model,
  NgZone,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
  type Signal,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import {
  getHtmlSchema,
  type RteHtmlSchema,
  type RtePaletteColor,
} from '@cds/rte-core';
import type { RteCodeLanguage } from '@cds/rte-core/code-languages';
import { DEFAULT_EMBED_PROVIDERS } from '@cds/rte-core/embeds';
import {
  createEditorExtensions,
  RTE_LABELS_META,
  type RteCharLimitState,
  type RteImageAlign,
} from '@cds/rte-core/extensions';
import { applyRteTheme, warnIfPoorTheme, type RteTheme } from '@cds/rte-theme';
import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState, type Transaction } from '@tiptap/pm/state';
import { RTE_CONFIG, RTE_LABELS, type RteEditorConfig } from '../config';
import {
  dialogBusy,
  documentDialogBusy,
  RteDialogController,
} from '../dialogs/controller';
import { RteDeferFailed } from '../dialogs/defer-failed';
import { readMediaRules, type RteMediaRules } from '../dialogs/media-rules';
import { RteDialogs } from '../dialogs/rte-dialogs';
import { dialogTarget } from '../dialogs/target';
import type { RteDialogKind } from '../dialogs/types';
import { createRteUiExtension } from '../dialogs/ui-extension';
import { createFloatingEscapeExtension } from '../floating/escape-extension';
import {
  floatingItemIds,
  resolveFloatingKinds,
  sameKinds,
} from '../floating/config';
// Só em `imports`: o `@defer` do template põe a classe num chunk à parte (M2).
import { RteFloatingMenus } from '../floating/rte-floating-menus';
import {
  RTE_FLOATING_MENUS,
  type RteFloatingMenuKind,
  type RteFloatingMenusConfig,
} from '../floating/types';
import { mergeLabels, readLabelsSource } from '../labels/merge';
import type { RteLabels, RteLabelsSource } from '../labels/types';
import { pickToolbarConfig, resolveToolbarGroups } from '../toolbar/config';
import type { RteToolbarConfig, RteToolbarItemId } from '../toolbar/items';
import { RteToolbar } from '../toolbar/rte-toolbar';
import { createToolbarState, type RteToolbarState } from '../toolbar/state';
import { mergeTheme, sameTheme, themeKey } from '../theme/instance-theme';
import {
  editableAttributes,
  presentText,
  type RteEditableState,
} from './attributes';
import { bindRteBridge, createRteBridge } from './bridge';
import { isEmptyValue, readValue } from './empty';
import { RTE_EDITOR_HOOK } from './hook';
import { buildEditorOptions, mergeEditorConfig } from './options';
import {
  EMPTY_MEDIA_SESSION,
  RteMediaTracker,
  sameMediaSession,
  type RteMediaChange,
  type RteMediaSession,
} from './media-session';
import { readonlySelectionKeydown } from './readonly-selection';

const OPTIONS_IGNORED =
  '[rte-editor] options só é lido na criação; a mudança foi ignorada.';

const FLOATING_FAILED =
  '[rte-editor] não foi possível carregar os menus flutuantes; o editor segue sem eles.';

const NO_LANGUAGES: readonly RteCodeLanguage[] = Object.freeze([]);

function sameGroups(
  a: readonly (readonly string[])[],
  b: readonly (readonly string[])[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (group, i) =>
        group.length === b[i]?.length &&
        group.every((id, j) => id === b[i]?.[j]),
    )
  );
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function samePalette(
  a: RteHtmlSchema['palette'],
  b: RteHtmlSchema['palette'],
): boolean {
  const same = (x: readonly RtePaletteColor[], y: readonly RtePaletteColor[]) =>
    x.length === y.length &&
    x.every(
      (c, i) =>
        c.name === y[i]?.name &&
        c.light === y[i]?.light &&
        c.dark === y[i]?.dark,
    );
  return same(a.text, b.text) && same(a.highlight, b.highlight);
}

/** `maxLength` inteiro `>= 0` vira o limite; o resto, sem limite (D12). */
function toCharLimit(value: number | undefined): number | null {
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

/**
 * Editor de texto rico (spec 05a). O `Editor` do Tiptap é criado só no
 * navegador, depois do primeiro render e fora da zona (D2); no servidor fica a
 * casca (D19). O estado sai por signals sobre uma ponte de versão (D4).
 */
@Component({
  selector: 'rte-editor',
  exportAs: 'rteEditor',
  templateUrl: './rte-editor.html',
  // `RteDialogs` só aqui e no `@defer` do template (G7: senão o chunk some).
  imports: [RteToolbar, RteFloatingMenus, RteDialogs, RteDeferFailed],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rte-root rte-editor',
    '[attr.hidden]': 'hidden() ? "" : null',
    '[class.rte-editor--disabled]': 'effectiveDisabled()',
    '[class.rte-editor--readonly]': 'readonly()',
    '[class.rte-editor--focused]': 'hostFocused()',
    '[class.rte-editor--invalid]': 'invalid() && touched()',
    // Atributo (sai no SSR), não estilo; o `applyRteTheme` grava o mesmo valor.
    '[attr.data-rte-mode]': 'effectiveTheme()?.mode ?? null',
    '(focusin)': 'onHostFocusIn($event)',
    '(focusout)': 'onHostFocusOut($event)',
    '(keydown)': 'onHostKeydown($event)',
  },
})
export class RteEditor implements FormValueControl<string> {
  // Contrato de controle (preenchido pelo [formField]; utilizável sem formulário)
  readonly value = model('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly hidden = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly touched = input(false, { transform: booleanAttribute });
  readonly maxLength = input<number | undefined>(undefined);
  readonly touch = output<void>();

  // Configuração
  readonly placeholder = input('');
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly ariaLabelledBy = input<string | undefined>(undefined);
  readonly ariaDescribedBy = input<string | undefined>(undefined);
  readonly labels = input<RteLabelsSource | undefined>(undefined);
  readonly options = input<RteEditorConfig | undefined>(undefined);
  /** Barra: entrada > `provideRichText` > `'article'`; vale ao vivo (U8). */
  readonly toolbar = input<RteToolbarConfig | undefined>(undefined);
  /** Tema: mesclado por chave sobre o de `provideRichText`; ao vivo (U15). */
  readonly theme = input<RteTheme | undefined>(undefined);
  /** Menus flutuantes: entrada > `provideRichText` por chave; ao vivo (M17). */
  readonly floatingMenus = input<RteFloatingMenusConfig | undefined>(undefined);

  // Saídas
  readonly editorReady = output<Editor>();
  readonly editorFocus = output<void>();
  readonly editorBlur = output<void>();
  /** Delta por transação que muda o conjunto de endereços de mídia (V13). */
  readonly mediaChange = output<RteMediaChange>();

  private readonly instance = signal<Editor | null>(null);
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly ngZone = inject(NgZone);

  /** O foco está em algum ponto do host (D11). */
  protected readonly hostFocused = signal(false);
  private readonly bridge = createRteBridge(this.instance, () =>
    isEmptyValue(this.value()),
  );

  // Valor (D8, D9): último HTML emitido ou aplicado (canônico), o documento
  // em que foi lido e se uma carga externa está em curso.
  private lastValue = '';
  private lastDoc: ProseMirrorNode | null = null;
  private loading = false;
  /** Sessão de mídia (V13): criada com o editor, rebaseada na carga externa. */
  private media: RteMediaTracker | null = null;
  private readonly mediaState = signal<RteMediaSession>(EMPTY_MEDIA_SESSION, {
    equal: sameMediaSession,
  });
  private pendingFocus: FocusOptions | null = null;
  private destroyed = false;

  // Estado (somente leitura)
  readonly editor: Signal<Editor | null> = this.instance.asReadonly();
  readonly isEmpty: Signal<boolean> = this.bridge.isEmpty;
  readonly isFocused: Signal<boolean> = this.bridge.isFocused;
  readonly textStats: Signal<RteCharLimitState | null> = this.bridge.textStats;
  /** Líquido da sessão de mídia (V13). */
  readonly mediaSession: Signal<RteMediaSession> = this.mediaState.asReadonly();

  private readonly providerLabels = inject(RTE_LABELS);

  /** Rótulos efetivos: entrada `labels` > `provideRichText` > `en` (D15). */
  protected readonly resolvedLabels: Signal<RteLabels> = computed(() =>
    mergeLabels(this.providerLabels(), readLabelsSource(this.labels())),
  );

  /**
   * Desabilitado efetivo: a entrada `disabled`, que os formulários (Signal,
   * Reactive e Template) também ligam pelo caminho nativo de controle
   * customizado (sem CVA).
   */
  protected readonly effectiveDisabled: Signal<boolean> = computed(() =>
    this.disabled(),
  );

  /** `aria-labelledby` da casca; texto vazio ou só espaços vale como ausente. */
  protected readonly shellLabelledBy = computed(() =>
    presentText(this.ariaLabelledBy()),
  );

  /** Nome acessível da casca: `ariaLabelledBy` vence `ariaLabel`. */
  protected readonly shellLabel = computed(() =>
    this.shellLabelledBy()
      ? null
      : (presentText(this.ariaLabel()) ??
        this.resolvedLabels().editor.ariaLabel),
  );

  protected readonly showShellPlaceholder = computed(
    () => isEmptyValue(this.value()) && this.placeholder() !== '',
  );

  private readonly mount = viewChild.required<ElementRef<HTMLElement>>('mount');
  private readonly toolbarRef = viewChild(RteToolbar);
  /**
   * Menus flutuantes (M2), pelo token: a classe no `viewChild` a puxaria
   * para o chunk principal. `undefined` antes da criação, sem tipos ou antes
   * de o chunk do `@defer` chegar.
   */
  protected readonly floatingRef = viewChild(RTE_FLOATING_MENUS);

  private readonly config = inject(RTE_CONFIG);
  /** Configuração fixada na criação (`null` antes dela). */
  private readonly creationConfig = signal<RteEditorConfig | null>(null);

  /** Comandos da barra só com editor editável (U10). */
  protected readonly interactive = computed(
    () => !!this.instance() && !this.effectiveDisabled() && !this.readonly(),
  );

  /** Configuração de criação: a fixada ou, antes dela, a mesclada ao vivo. */
  private readonly editorConfig = computed(
    () =>
      this.creationConfig() ??
      mergeEditorConfig(this.config.editor, this.options()),
  );

  /**
   * Esquema da configuração (pré-voo 7): recursos da barra e paleta iguais
   * no SSR, na casca e depois da criação; opção inválida cai no padrão.
   */
  protected readonly schema: Signal<RteHtmlSchema> = computed(() => {
    try {
      return getHtmlSchema(this.editorConfig());
    } catch {
      return getHtmlSchema({});
    }
  });

  /**
   * Nomes dos provedores de *embed* ativos (pré-voo 4): a dica do diálogo e
   * a condição do item `embed`. `DEFAULT_EMBED_PROVIDERS` fica no *chunk*
   * principal; o `rte-dialogs` só recebe os nomes.
   */
  protected readonly embedProviderNames: Signal<readonly string[]> = computed(
    () =>
      (this.editorConfig().embedProviders ?? DEFAULT_EMBED_PROVIDERS).map(
        (p) => p.name,
      ),
    { equal: sameIds },
  );

  protected readonly codeLanguages = computed(
    () => this.editorConfig().codeLanguages ?? NO_LANGUAGES,
  );

  private readonly toolbarWarned = new Set<string>();
  protected readonly toolbarGroups: Signal<
    readonly (readonly RteToolbarItemId[])[]
  > = computed(
    () =>
      resolveToolbarGroups(
        pickToolbarConfig(this.toolbar(), this.config.toolbar),
        {
          features: this.schema().features,
          hasCodeLanguages: this.codeLanguages().length > 0,
          hasEmbedProviders: this.embedProviderNames().length > 0,
          warned: this.toolbarWarned,
        },
      ),
    { equal: sameGroups },
  );

  private readonly floatingWarned = new Set<string>();
  /** Tipos de menu flutuante ligados (M17), na ordem de prioridade. */
  protected readonly floatingKinds: Signal<readonly RteFloatingMenuKind[]> =
    computed(
      () =>
        resolveFloatingKinds(
          this.floatingMenus(),
          this.config.floatingMenus,
          this.schema().features,
          this.floatingWarned,
        ),
      { equal: sameKinds },
    );

  /**
   * Estado único da barra e dos menus flutuantes (M15, pré-voo 1): união sem
   * repetição dos itens da barra e dos do menu de texto, calculada uma vez
   * por transação mesmo com `toolbar: false`.
   */
  protected readonly toolbarState: RteToolbarState = createToolbarState({
    editor: this.instance,
    version: this.bridge.version,
    items: computed(
      () => [
        ...new Set([
          ...this.toolbarGroups().flat(),
          ...floatingItemIds(this.floatingKinds()),
        ]),
      ],
      { equal: sameIds },
    ),
    interactive: this.interactive,
  });

  /** Paleta do esquema; igual por valor (a criação não re-renderiza os menus). */
  protected readonly palette = computed(() => this.schema().palette, {
    equal: samePalette,
  });

  /** Tema efetivo (U15): instância > provider por chave; igual por valor. */
  protected readonly effectiveTheme = computed(
    () => mergeTheme(this.config.theme, this.theme()),
    { equal: sameTheme },
  );

  /** Versão da ponte, para a barra (U5). */
  protected readonly version = this.bridge.version;
  protected readonly contentLabels = computed(
    () => this.resolvedLabels().content,
  );
  private readonly slashLabels = computed(() => this.resolvedLabels().slash);

  /** Diálogos (G2–G7): o pedido e o G5 ficam aqui; a interface, no chunk. */
  protected readonly dialogs = new RteDialogController({
    editor: this.instance,
  });
  protected readonly dialogRequested = this.dialogs.requested;
  protected readonly onDialogsFailed = () => this.dialogs.fail();
  /** `@error` do chunk dos menus (M2): o editor segue sem eles. */
  protected readonly onFloatingFailed = () => {
    if (isDevMode()) console.warn(FLOATING_FAILED);
  };
  /** Dispara o `@defer` dos menus: editor criado e algum tipo ligado (M2). */
  protected readonly floatingWanted = computed(
    () => this.editor() !== null && this.floatingKinds().length > 0,
  );
  /** Menus flutuantes só com editor interativo e visível (M5). */
  protected readonly floatingEnabled = computed(
    () => this.interactive() && !this.hidden(),
  );
  /** Pedido de diálogo deste editor ou de outro do documento (M5, G6). */
  protected readonly floatingBlocked = computed(
    () =>
      this.dialogs.request() !== null ||
      documentDialogBusy(this.host.ownerDocument)(),
  );
  /** Política de links da criação (G9): a mesma que o editor usa. */
  protected readonly linkPolicy = computed(
    () => this.editorConfig().linkPolicy,
  );
  /** Regras de URL/idioma das mídias do esquema (V4); `null` sem `media`. */
  protected readonly mediaRules: Signal<RteMediaRules | null> = computed(() =>
    readMediaRules(this.schema()),
  );
  /** Nomes dos alinhamentos de imagem no diálogo, de `floating` (V14). */
  protected readonly alignNames: Signal<
    Readonly<Record<RteImageAlign, string>>
  > = computed(
    () => {
      const f = this.resolvedLabels().floating;
      return {
        left: f.imageAlignLeft,
        center: f.imageAlignCenter,
        right: f.imageAlignRight,
        full: f.imageAlignFull,
      };
    },
    {
      equal: (a, b) =>
        a.left === b.left &&
        a.center === b.center &&
        a.right === b.right &&
        a.full === b.full,
    },
  );
  /** Regra do `span[lang]` do esquema (G14). */
  protected readonly langRule = computed(
    () => this.schema().elements['span']?.attributes['lang']?.rule ?? null,
  );

  constructor() {
    bindRteBridge(this, this.bridge);

    const host = this.host;
    const zone = inject(NgZone);
    const config = this.config;

    let optionsAtCreation: RteEditorConfig | undefined;
    let warned = false;
    effect(() => {
      const options = this.options();
      if (
        !warned &&
        untracked(this.instance) !== null &&
        options !== optionsAtCreation &&
        isDevMode()
      ) {
        warned = true;
        console.warn(OPTIONS_IGNORED);
      }
    });

    // Emissão síncrona (D8): só transações que mudam o documento fora de uma
    // carga externa; as anexadas por `appendTransaction` vêm no mesmo evento.
    // A mídia (V13, V17) é contada fora da zona; só o delta não vazio entra
    // nela, depois do `value`.
    const onTransaction = ({
      editor,
      transaction,
      appendedTransactions,
    }: {
      editor: Editor;
      transaction: Transaction;
      appendedTransactions: Transaction[];
    }) => {
      // G5: documento diferente do da abertura (carga externa, `setContent`,
      // API do consumidor) fecha o diálogo como cancelamento. Na própria
      // transação, não num `effect` sobre a versão: no zone.js o efeito
      // notificado fora da zona disparava `tick` recursivo (NG0101).
      const req = untracked(this.dialogs.request);
      if (req && editor.state.doc !== req.doc) {
        zone.run(() => this.dialogs.cancel('cancelled'));
      }
      if (this.loading) return;
      const media = this.media;
      const delta = media?.apply([transaction, ...appendedTransactions]);
      if (editor.state.doc !== this.lastDoc) {
        this.lastDoc = editor.state.doc;
        const html = readValue(editor);
        if (html !== this.lastValue) {
          this.lastValue = html;
          zone.run(() => this.value.set(html));
        }
      }
      if (!media || !delta) return;
      zone.run(() => {
        this.mediaState.set(media.session());
        this.mediaChange.emit(delta);
      });
    };

    // Valor externo (D9): fora do histórico, sem emitir, sem focar e sem
    // escrever o canônico de volta no modelo. `addToHistory: false` não basta:
    // o prosemirror-history mapeia os passos antigos pela carga e os das
    // bordas sobrevivem (undo traria trechos do documento anterior). Por isso
    // o estado é recriado sobre o documento carregado, com os mesmos plugins,
    // o que reinicia o estado de todos eles (histórico vazio; o contador
    // `rejected` do limite volta a 0, coerente com um documento novo).
    effect(() => {
      const value = this.value() ?? '';
      untracked(() => {
        const editor = this.instance();
        if (!editor || editor.isDestroyed || value === this.lastValue) return;
        this.loading = true;
        try {
          editor
            .chain()
            .command(({ tr }) => {
              tr.setMeta('addToHistory', false);
              return true;
            })
            .setContent(value, { emitUpdate: false })
            .run();
          const { state, view } = editor;
          view.updateState(
            EditorState.create({
              doc: state.doc,
              plugins: state.plugins,
              selection: state.selection,
            }),
          );
        } finally {
          this.loading = false;
        }
        this.bridge.refresh();
        this.lastDoc = editor.state.doc;
        this.lastValue = readValue(editor);
        this.media?.reset(editor.state.doc);
        if (this.media) this.mediaState.set(this.media.session());
      });
    });

    // Atributos (D10, D13) e editável: props da vista, sem transação. Leem só
    // entradas, então valem também depois de uma carga externa (que troca o
    // estado, não as props).
    effect(() => {
      const attributes = editableAttributes(this.editableState());
      const editor = this.instance();
      if (!editor || editor.isDestroyed) return;
      zone.runOutsideAngular(() =>
        editor.setOptions({
          editorProps: { ...editor.options.editorProps, attributes },
        }),
      );
    });
    effect(() => {
      const editable = !this.effectiveDisabled() && !this.readonly();
      const editor = this.instance();
      if (!editor || editor.isDestroyed) return;
      if (editor.options.editable === editable) return;
      // Sem evento `update` (D10); a vista de tarefa só ressincroniza o
      // checkbox ao re-renderizar, então segue uma transação só de meta.
      zone.runOutsideAngular(() => {
        editor.setEditable(editable, false);
        editor.view.dispatch(
          editor.state.tr
            .setMeta(RTE_LABELS_META, true)
            .setMeta('addToHistory', false),
        );
      });
    });

    // `disabled`/`hidden` com o foco dentro do host (ou `readonly` com o foco
    // na barra, cujos botões ficam `disabled`): o foco sai (sem
    // `relatedTarget`) e o `focusout` emite `editorBlur`/`touch` uma vez
    // (Review Focus 4). Na fase de escrita do render, depois da detecção de
    // mudanças (U18): emitir durante ela daria `NG0100`. Navegadores que já
    // tiraram o foco não duplicam: `hostFocused` guarda o estado.
    afterRenderEffect({
      write: () => {
        const off = this.effectiveDisabled() || this.hidden();
        if (!off && !this.readonly()) return;
        untracked(() => {
          // G5: `disabled`/`hidden` não movem o foco; `readonly` segue G4.
          this.dialogs.cancel(off ? 'state' : 'cancelled');
          this.toolbarRef()?.closeMenus();
          const active = host.ownerDocument?.activeElement as
            (HTMLElement & { blur?: () => void }) | null | undefined;
          if (!active || active === host || !host.contains(active)) return;
          const scope = off ? host : host.querySelector('.rte-toolbar');
          if (scope?.contains(active)) active.blur?.();
        });
      },
    });

    // Todos os menus flutuantes saindo (`floatingMenus: false`) com o foco
    // dentro: o `@if` destrói o componente antes do efeito dele sobre
    // `kinds()`, então o foco vai ao editável daqui, antes do refresh (M11).
    effect(() => {
      const kinds = this.floatingKinds();
      const editor = this.instance();
      untracked(() => {
        if (!kinds.length || !editor) this.floatingRef()?.releaseFocus([]);
      });
    });

    // G5: a troca de `toolbar` que tira a origem do DOM cancela (foco ao
    // editável, G4).
    afterRenderEffect({
      write: () => {
        this.toolbarGroups();
        untracked(() => {
          const origin = this.dialogs.request()?.origin;
          if (origin && !origin.isConnected) this.dialogs.cancel('cancelled');
        });
      },
    });

    // Tema (U15): só no navegador; a limpeza anterior roda a cada mudança e
    // no destroy. `warnIfPoorTheme` uma vez por tema diferente, só em
    // desenvolvimento (`ngDevMode` some no build de produção).
    const warnedThemes = new Set<string>();
    afterRenderEffect((onCleanup) => {
      const theme = this.effectiveTheme();
      if (!theme) return;
      onCleanup(applyRteTheme(host, theme));
      if (typeof ngDevMode !== 'undefined' && ngDevMode) {
        const key = themeKey(theme);
        if (!warnedThemes.has(key)) {
          warnedThemes.add(key);
          warnIfPoorTheme(theme);
        }
      }
    });

    // Rótulos e placeholder ao vivo (D15): uma transação só de meta relê as
    // decorações, o `aria-placeholder` e o nome das tarefas. Não despacha na
    // primeira leitura de cada editor (ele nasceu com os rótulos atuais).
    let labelsEditor: Editor | null = null;
    effect(() => {
      this.placeholder();
      this.contentLabels();
      this.slashLabels();
      const editor = this.instance();
      if (!editor || editor.isDestroyed) return;
      if (editor !== labelsEditor) {
        labelsEditor = editor;
        return;
      }
      zone.runOutsideAngular(() =>
        editor.view.dispatch(
          editor.state.tr
            .setMeta(RTE_LABELS_META, true)
            .setMeta('addToHistory', false),
        ),
      );
    });

    afterNextRender(() => {
      const editor = untracked(() => {
        optionsAtCreation = this.options();
        const merged = mergeEditorConfig(config.editor, optionsAtCreation);
        this.creationConfig.set(merged);
        const extensions = [
          ...createEditorExtensions(
            buildEditorOptions(merged, {
              placeholder: () => this.placeholder(),
              charLimit: () => toCharLimit(this.maxLength()),
              content: () => this.resolvedLabels().content,
              slash: () => this.resolvedLabels().slash,
            }),
          ),
          createRteUiExtension({ openLink: () => this.openDialog('link') }),
          // `Escape` no editável (M6): o último `handleKeyDown` do ProseMirror.
          createFloatingEscapeExtension(() =>
            this.ngZone.run(
              () => untracked(this.floatingRef)?.dismiss() ?? false,
            ),
          ),
        ];
        const element = this.mount().nativeElement;
        const content = this.value() || '';
        const editable = !this.effectiveDisabled() && !this.readonly();
        const attributes = editableAttributes(this.editableState());
        return zone.runOutsideAngular(
          () =>
            new Editor({
              element,
              extensions,
              content,
              editable,
              injectCSS: false,
              editorProps: {
                attributes,
                handleDOMEvents: { keydown: readonlySelectionKeydown },
              },
            }),
        );
      });
      Object.defineProperty(host, RTE_EDITOR_HOOK, {
        value: editor,
        configurable: true,
      });
      this.lastDoc = editor.state.doc;
      this.lastValue = readValue(editor);
      this.media = new RteMediaTracker(editor.state.doc);
      this.mediaState.set(this.media.session());
      editor.on('transaction', onTransaction);
      this.instance.set(editor);
      this.bridge.connect(editor);
      zone.run(() => this.editorReady.emit(editor));
      const focus = this.pendingFocus;
      this.pendingFocus = null;
      if (focus) this.focus(focus);
    });

    inject(DestroyRef).onDestroy(() => {
      const editor = untracked(this.instance);
      this.dialogs.dispose();
      this.destroyed = true;
      this.pendingFocus = null;
      if (!editor) return;
      this.bridge.disconnect();
      editor.off('transaction', onTransaction);
      delete (host as unknown as Record<symbol, unknown>)[RTE_EDITOR_HOOK];
      editor.destroy();
      this.instance.set(null);
    });
  }

  /** `focusin` vindo de fora do host (ou sem origem): `editorFocus` (D11). */
  protected onHostFocusIn(event: FocusEvent): void {
    if (this.hostFocused() || this.isInsideHost(event.relatedTarget)) return;
    this.hostFocused.set(true);
    this.editorFocus.emit();
  }

  /** `focusout` para fora do host (ou sem destino): `editorBlur` e `touch` (D11). */
  protected onHostFocusOut(event: FocusEvent): void {
    if (!this.hostFocused() || this.isInsideHost(event.relatedTarget)) return;
    if (event.relatedTarget === null) {
      // Sem destino: o Chromium também dispara `focusout` ao remover do DOM o
      // elemento focado (um item da barra que saiu, ainda conectado durante o
      // evento), e a barra devolve o foco ao item ativo depois do render; o
      // foco também pode sair e voltar no mesmo turno (`blur()` + `focus()`).
      // A decisão fica para a fase `read` do próximo render (depois desse
      // `afterRenderEffect`; microtarefa não serve: no zone.js o ouvinte
      // disparado durante a detecção as esvazia com o item ainda no DOM): se
      // a janela tem o foco e ele está no host, não houve saída (D11). Com a
      // janela sem foco (troca de janela), o `activeElement` continua no
      // host, mas é saída.
      afterNextRender(
        {
          read: () => {
            if (this.destroyed || !this.hostFocused()) return;
            if (this.focusIsInsideHost()) return;
            // os ganchos de render rodam fora da zona: as saídas, dentro
            this.ngZone.run(() => this.leaveHost());
          },
        },
        { injector: this.injector },
      );
      return;
    }
    this.leaveHost();
  }

  private leaveHost(): void {
    this.hostFocused.set(false);
    this.editorBlur.emit();
    this.touch.emit();
  }

  private focusIsInsideHost(): boolean {
    const doc = this.host.ownerDocument;
    const active = doc.activeElement;
    return (
      doc.hasFocus() &&
      active !== null &&
      active !== doc.body &&
      this.host.contains(active)
    );
  }

  private isInsideHost(target: EventTarget | null): boolean {
    return (
      target !== null &&
      typeof (target as Node).nodeType === 'number' &&
      this.host.contains(target as Node)
    );
  }

  /**
   * Teclado do host (U3, M12; pré-voo 10). `Alt+F10` no editável foca o menu
   * flutuante visível ou, sem ele, a barra; dentro de um `.rte-floating`, a
   * barra. O `Escape` do editável (M6) é tratado dentro do ProseMirror
   * (`createFloatingEscapeExtension`), depois dos atalhos do editor.
   */
  protected onHostKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const inEditable = this.mount().nativeElement.contains(target);
    if (
      event.key !== 'F10' ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (inEditable) {
      event.preventDefault();
      if (!this.focusFloatingMenu()) this.focusToolbar();
      return;
    }
    const floating = target.closest('.rte-floating');
    if (floating && this.host.contains(floating)) {
      event.preventDefault();
      this.focusToolbar();
    }
  }

  /**
   * Foca o item ativo do menu flutuante visível (M12); `false` (sem mover o
   * foco) sem editor, não editável ou sem menu visível.
   */
  focusFloatingMenu(): boolean {
    if (!untracked(this.interactive)) return false;
    return untracked(this.floatingRef)?.focusActive() ?? false;
  }

  /** Leva o foco ao item ativo da barra (U3); sem barra ou sem editor, nada. */
  focusToolbar(): void {
    if (!untracked(this.interactive)) return;
    untracked(this.toolbarRef)?.focusActive();
  }

  /**
   * Abre um diálogo (G18). `true` = pedido aceito (o diálogo abre quando o
   * chunk chegar); `false` = sem editor, não editável, oculto, recurso desligado,
   * inaplicável ou outro pedido em curso (em qualquer editor do documento).
   */
  openDialog(kind: RteDialogKind): boolean {
    return this.ngZone.run(() => this.requestDialog(kind, null));
  }

  /** Pedido da barra ou da API; sem origem dada, o foco no host ou o editável. */
  protected requestDialog(
    kind: RteDialogKind,
    origin: HTMLElement | null,
  ): boolean {
    const editor = untracked(this.instance);
    if (!editor || editor.isDestroyed || this.destroyed) return false;
    if (
      !untracked(this.interactive) ||
      untracked(this.hidden) ||
      untracked(this.dialogs.failed) ||
      untracked(this.dialogs.request) ||
      dialogBusy(this.host.ownerDocument) ||
      this.host.ownerDocument.querySelector('dialog.rte-dialog[open]')
    ) {
      return false;
    }
    const target = dialogTarget(editor, kind);
    if (!target) return false;
    untracked(this.toolbarRef)?.closeMenus();
    this.dialogs.open(kind, target, origin ?? this.focusOrigin(editor));
    return true;
  }

  /** Origem de um pedido sem origem: o elemento focado no host ou o editável. */
  private focusOrigin(editor: Editor): HTMLElement {
    const active = this.host.ownerDocument.activeElement as HTMLElement | null;
    return active && active !== this.host && this.host.contains(active)
      ? active
      : editor.view.dom;
  }

  /** Foca o editável; antes da criação, o pedido vale logo depois dela. */
  focus(options?: FocusOptions): void {
    const editor = untracked(this.instance);
    if (!editor) {
      if (!this.destroyed) this.pendingFocus = options ?? {};
      return;
    }
    editor.commands.focus(null, {
      scrollIntoView: options?.preventScroll !== true,
    });
  }

  private editableState(): RteEditableState {
    return {
      ariaLabel: this.ariaLabel(),
      ariaLabelledBy: this.ariaLabelledBy(),
      ariaDescribedBy: this.ariaDescribedBy(),
      fallbackLabel: this.resolvedLabels().editor.ariaLabel,
      required: this.required(),
      invalid: this.invalid(),
      touched: this.touched(),
      disabled: this.effectiveDisabled(),
      readonly: this.readonly(),
    };
  }
}
