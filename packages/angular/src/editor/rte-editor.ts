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
  getSearchState,
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
import { RTE_DIALOG_KIT } from '../dialogs/form-kit';
import { readMediaRules, type RteMediaRules } from '../dialogs/media-rules';
import { RteDialogs } from '../dialogs/rte-dialogs';
// Só em `imports` e no bloco de pré-carga do template (05c2a E2): o
// `@defer (when false; prefetch on idle)` nunca renderiza; o *chunk*
// `rte-media-forms` chega em ocioso, sem cascata no primeiro diálogo de mídia.
import { RteMediaForms } from '../dialogs/rte-media-forms';
import { dialogTarget } from '../dialogs/target';
import { isMediaKind, type RteDialogKind } from '../dialogs/types';
import { createRteUiExtension } from '../dialogs/ui-extension';
import { RteDraft } from '../draft/facade';
// Só em `imports` e no `@defer` do aviso: o *chunk* `rte-draft` (S2).
import { RteDraftPrompt } from '../draft/rte-draft';
import type { RteDraftAvailable, RteDraftErrorEvent } from '../draft/types';
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
import {
  applySlashAria,
  sameAttributes,
  slashAriaAttributes,
} from '../slash/aria';
import { createSlashAnnouncement } from '../slash/announce';
import { buildFooter } from '../counters/footer';
import { createLimitAnnouncer } from '../counters/limit-announcer';
// Só em `imports` e no `@defer` (K3): o *chunk* `rte-search`.
import { RteSearch } from '../search/rte-search';
import { createSearchShortcutsExtension } from '../search/shortcuts-extension';
import { createSearchState, initialSearchQuery } from '../search/state';
import { detectPlatform } from '../toolbar/shortcuts';
// Só em `imports` e no `@defer` (K3): o *chunk* `rte-slash-menu`.
import { RteSlashMenu } from '../slash/rte-slash-menu';
import { createSlashState, nextSlashInstanceId } from '../slash/state';
import { RTE_SLASH_MENU } from '../slash/types';
import { composeOnUiItem } from '../slash/ui-items';
import { mergeLabels, readLabelsSource } from '../labels/merge';
import type { RteLabels, RteLabelsSource } from '../labels/types';
import { pickToolbarConfig, resolveToolbarGroups } from '../toolbar/config';
import type { RteToolbarConfig, RteToolbarItemId } from '../toolbar/items';
import { RteToolbar } from '../toolbar/rte-toolbar';
import { createToolbarState, type RteToolbarState } from '../toolbar/state';
import { mergeTheme, sameTheme, themeKey } from '../theme/instance-theme';
import { RteEditorUploads } from '../upload/editor-bindings';
// Só no `@defer` da bandeja: o mesmo módulo do carregador (*chunk* `rte-upload`).
import { RteUploadTray } from '../upload/rte-upload';
import type { RteUploadConfig, RteUploadErrorEvent } from '../upload/types';
import {
  editableAttributes,
  presentText,
  type RteEditableState,
} from './attributes';
import { bindRteBridge, createRteBridge } from './bridge';
import { RteBeforeUnload } from './before-unload';
import { RteDirtyState, readCanonical } from './dirty';
import { isEmptyValue, readValue } from './empty';
import { RTE_EDITOR_HOOK } from './hook';
import { buildEditorOptions, mergeEditorConfig } from './options';
import {
  EMPTY_MEDIA_SESSION,
  RteMediaTracker,
  countMedia,
  readMediaUrlRules,
  sameMediaSession,
  type RteMediaChange,
  type RteMediaSession,
} from './media-session';
import { readonlySelectionKeydown } from './readonly-selection';

const OPTIONS_IGNORED =
  '[rte-editor] options só é lido na criação; a mudança foi ignorada.';

const FLOATING_FAILED =
  '[rte-editor] não foi possível carregar os menus flutuantes; o editor segue sem eles.';

const SLASH_FAILED =
  '[rte-editor] não foi possível carregar a lista do menu /; o teclado do menu segue funcionando sem ela.';

const SEARCH_FAILED =
  '[rte-editor] não foi possível carregar a barra de busca; Mod-F segue com o navegador.';

const NO_LANGUAGES: readonly RteCodeLanguage[] = Object.freeze([]);
/** Itens de mídia da barra (desabilitados com `mediaFailed`, 05c2a E2). */
const MEDIA_ITEMS: readonly RteToolbarItemId[] = Object.freeze([
  'image',
  'video',
  'embed',
]);
/** O item `search` fica desabilitado depois de falhar a carga da barra (05d1). */
const SEARCH_ITEMS: readonly RteToolbarItemId[] = Object.freeze(['search']);
const MEDIA_AND_SEARCH_ITEMS: readonly RteToolbarItemId[] = Object.freeze([
  ...MEDIA_ITEMS,
  'search',
]);
const NO_ITEMS: readonly RteToolbarItemId[] = Object.freeze([]);

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
  // `RteDialogs`, `RteMediaForms` e `RteUploadTray` só aqui e nos `@defer`
  // do template (G7, 05c2a E2 e Ruling 28: senão o chunk some).
  imports: [
    RteToolbar,
    RteFloatingMenus,
    RteSlashMenu,
    RteSearch,
    RteDialogs,
    RteMediaForms,
    RteUploadTray,
    RteDraftPrompt,
    RteDeferFailed,
  ],
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
  /**
   * Âncora de *chunk* (05c2a E2, ruling 20 do ADR 0011): mantém no principal
   * os auxiliares de formulário usados pelos *chunks* `rte-dialogs` e
   * `rte-media-forms` (sem terceiro *chunk* compartilhado).
   */
  protected static readonly ɵdialogKit = RTE_DIALOG_KIT;

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
  /** Envio de arquivos: entrada > `provideRichText`; `null` desliga (E3). */
  readonly upload = input<RteUploadConfig | null | undefined>(undefined);
  /** Rascunho automático (S3): 1 a 200 caracteres; `null` desliga. */
  readonly draftKey = input<string | null | undefined>(undefined);
  /** Aviso do navegador ao sair com alterações não salvas: entrada > provider; padrão desligado (S10). */
  readonly warnOnUnsaved = input<boolean | undefined>(undefined);
  /** URL colada num parágrafo vazio vira *embed*: entrada > provider; padrão desligado (S11). */
  readonly pasteEmbeds = input<boolean | undefined>(undefined);
  /** Contador de caracteres no rodapé (K11); entrada > provider > `false`. */
  readonly showCharCount = input<boolean | undefined>(undefined);
  /** Contador de palavras e tempo de leitura no rodapé (K11). */
  readonly showWordCount = input<boolean | undefined>(undefined);

  // Saídas
  readonly editorReady = output<Editor>();
  readonly editorFocus = output<void>();
  readonly editorBlur = output<void>();
  /** Delta por transação que muda o conjunto de endereços de mídia (V13). */
  readonly mediaChange = output<RteMediaChange>();
  /** Falha de envio, uma por arquivo, dentro da zona (E15). */
  readonly uploadError = output<RteUploadErrorEvent>();
  /** Falha de escrita ou armazenamento indisponível do rascunho (S4). */
  readonly draftError = output<RteDraftErrorEvent>();

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

  /** O item `search` da barra vale também com `readonly` (K7). */
  protected readonly searchable = computed(
    () => !!this.instance() && !this.effectiveDisabled(),
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
  /** `features.search` (padrão do core: ligado); entrada > provider (D20). */
  protected readonly searchEnabled: Signal<boolean> = computed(
    () => this.editorConfig().features?.search !== false,
  );

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
          search: this.searchEnabled(),
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
    searchable: this.searchable,
    // Falha do *chunk* dos formulários de mídia (05c2a E2): os itens de
    // mídia ficam desabilitados em vez de não fazer nada.
    unavailable: computed(() => {
      const media = this.dialogs.mediaFailed();
      const search = this.searchFailed();
      if (media && search) return MEDIA_AND_SEARCH_ITEMS;
      if (media) return MEDIA_ITEMS;
      return search ? SEARCH_ITEMS : NO_ITEMS;
    }),
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

  /** Menu `/` (K3–K6): estado sobre a versão da ponte; a lista é o *chunk* `rte-slash-menu`. */
  private readonly slashId = nextSlashInstanceId();
  protected readonly slashState = createSlashState({
    editor: this.instance,
    version: this.bridge.version,
  });
  protected readonly slashOpen = computed(() => this.slashState().open);
  protected readonly slashMenuLabels = computed(
    () => this.resolvedLabels().slashMenu,
  );
  /** Lista do menu `/`, pelo token (a classe a puxaria para o principal). */
  protected readonly slashRef = viewChild(RTE_SLASH_MENU);
  protected readonly slashAria = computed(
    () =>
      slashAriaAttributes(
        this.slashState(),
        this.slashId,
        this.slashRef() !== undefined,
      ),
    { equal: sameAttributes },
  );
  protected readonly slashAnnouncement = createSlashAnnouncement({
    state: this.slashState,
    labels: this.slashMenuLabels,
    view: this.host.ownerDocument.defaultView,
    zone: this.ngZone,
  });
  protected readonly slashInstance = this.slashId;

  /** Rodapé de contadores (K11): só com o editor pronto, nunca no servidor. */
  protected readonly footer = computed(() =>
    buildFooter(
      this.bridge.textStats(),
      {
        chars: this.showCharCount() ?? this.config.counters?.chars ?? false,
        words: this.showWordCount() ?? this.config.counters?.words ?? false,
      },
      this.resolvedLabels().counters,
    ),
  );
  /** Anúncios do limite (K12), região viva própria, fora do rodapé. */
  private readonly limitAnnouncer = createLimitAnnouncer({
    stats: this.bridge.textStats,
    labels: computed(() => this.resolvedLabels().counters),
    view: this.host.ownerDocument.defaultView,
    zone: this.ngZone,
  });
  protected readonly limitAnnouncements = this.limitAnnouncer.announcements;

  /** Barra de busca (K7–K10): o estado é do core; a barra é o *chunk* `rte-search`. */
  private readonly searchOpenState = signal(false);
  readonly searchOpen: Signal<boolean> = this.searchOpenState.asReadonly();
  protected readonly searchState = createSearchState({
    editor: this.instance,
    version: this.bridge.version,
  });
  protected readonly searchFocus = signal(0);
  /** Sobe a cada `F3` do editável com resultados (a barra reanuncia a posição). */
  protected readonly searchStep = signal(0);
  private readonly searchFailed = signal(false);
  protected readonly searchLabels = computed(() => this.resolvedLabels().search);

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
  /** `@error` do chunk da barra de busca (K3): sem barra, `Mod-F` é do navegador. */
  protected readonly onSearchFailed = () => {
    this.searchFailed.set(true);
    this.endSearch(false);
    if (isDevMode()) console.warn(SEARCH_FAILED);
  };
  /** `@error` do chunk da lista do menu `/` (K3): o teclado do core segue valendo. */
  protected readonly onSlashFailed = () => {
    if (isDevMode()) console.warn(SLASH_FAILED);
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
      documentDialogBusy(this.host.ownerDocument)() ||
      // Com o menu `/` aberto, os menus flutuantes ficam ocultos (K5).
      this.slashOpen(),
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

  /** Envios (E3, E4, E8, E10, E17, E23; Ruling 28): `upload/editor-bindings`. */
  private readonly uploading = new RteEditorUploads({
    editor: this.instance,
    upload: this.upload,
    provided: this.config.upload,
    schema: this.schema,
    interactive: this.interactive,
    hidden: this.hidden,
    dialog: this.dialogs.request,
    zone: this.ngZone,
    pasteEmbeds: computed(
      () => this.pasteEmbeds() ?? this.config.pasteEmbeds ?? false,
    ),
    labels: () => this.resolvedLabels().upload,
    emitError: (e) => this.uploadError.emit(e),
  });
  /** Envios em curso, na ordem do gesto (E18). */
  readonly uploads = this.uploading.uploads;
  readonly pendingUploads = this.uploading.pendingUploads;
  protected readonly announcements = this.uploading.announcements;
  protected readonly dialogUploads = this.uploading.dialogUploads;
  /** Imagens com `alt: null` (E18), fora do portão do delta de URLs. */
  readonly imagesMissingAlt = this.uploading.imagesMissingAlt;

  /** Base salva, `isDirty` e a fila do `onMediaRemoved` (S8, S9). */
  private readonly dirtyState = new RteDirtyState({
    zone: this.ngZone,
    pendingUploads: this.pendingUploads,
    currentUrls: () => this.media?.session().current ?? [],
    deliver: () => {
      const adapter = this.uploading.adapter();
      return adapter && typeof adapter.onMediaRemoved === 'function'
        ? (urls) => adapter.onMediaRemoved?.(urls)
        : null;
    },
  });
  /** O valor difere da base salva (criação, carga externa ou `markSaved`). */
  readonly isDirty: Signal<boolean> = this.dirtyState.isDirty;

  /** `beforeunload` só enquanto sujo ou com envio em curso (S10, R8). */
  private readonly beforeUnload = new RteBeforeUnload({
    zone: this.ngZone,
    view: this.host.ownerDocument.defaultView,
    enabled: computed(
      () => this.warnOnUnsaved() ?? this.config.warnOnUnsaved ?? false,
    ),
    isDirty: this.isDirty,
    pendingUploads: this.pendingUploads,
  });

  /** Rascunho (S2–S7): a fachada fica aqui; o agendador, no *chunk* `rte-draft`. */
  private readonly drafting: RteDraft = new RteDraft(
    {
      zone: this.ngZone,
      view: this.host.ownerDocument.defaultView,
      config: this.config.draft,
      editable: () => untracked(this.interactive),
      pendingUploads: () => untracked(this.pendingUploads),
      isDirty: () => untracked(this.isDirty),
      current: () => this.lastValue,
      base: () => this.dirtyState.baseValue(),
      canonical: (html) => {
        const editor = untracked(this.instance);
        return editor && !editor.isDestroyed
          ? readCanonical(editor, html).html
          : html;
      },
      apply: (html) => this.applyRestored(html),
      setAvailable: (value) =>
        this.ngZone.run(() => this.drafting.publish(value)),
      available: () => untracked(this.drafting.available),
      emitError: (e) => this.ngZone.run(() => this.draftError.emit(e)),
    },
    this.instance,
    this.draftKey,
  );
  /** Rascunho à espera de decisão (S5); só a data, nunca o conteúdo. */
  readonly draftAvailable: Signal<RteDraftAvailable | null> =
    this.drafting.available;
  /** Data do aviso embutido, ou `null` quando ele não aparece (S6). */
  protected readonly draftPromptAt: Signal<number | null> = computed(() => {
    const available = this.drafting.available();
    return available &&
      this.config.draft?.prompt !== false &&
      this.interactive() &&
      this.pendingUploads() === 0
      ? available.savedAt
      : null;
  });
  /** Texto da região `aria-live` do aviso: vazio sem aviso (S6). */
  protected readonly draftStatus: Signal<string> = computed(() => {
    const at = this.draftPromptAt();
    return at === null ? '' : this.resolvedLabels().draft.available(at);
  });

  constructor() {
    bindRteBridge(this, this.bridge);

    // ARIA do menu `/` no editável (K4), direto no DOM: um `effect` sobre a
    // versão da ponte (que sobe fora da zona) faz o zone.js pedir outro
    // `tick` durante o atual (NG0101); o `afterRenderEffect` não. O ProseMirror
    // só remove os atributos que ele mesmo gravou, então estes sobrevivem.
    let ariaEditor: Editor | null = null;
    afterRenderEffect(() => {
      const aria = this.slashAria();
      const editor = this.instance();
      untracked(() => {
        if (ariaEditor && ariaEditor !== editor && !ariaEditor.isDestroyed) {
          applySlashAria(ariaEditor.view.dom, {});
        }
        ariaEditor = editor;
        if (editor && !editor.isDestroyed) applySlashAria(editor.view.dom, aria);
      });
    });
    this.dirtyState.onSaved = () => this.drafting.cleared();

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
      this.uploading.afterTransaction([transaction, ...appendedTransactions]);
      const media = this.media;
      const delta = media?.apply([transaction, ...appendedTransactions]);
      let emitted = false;
      if (editor.state.doc !== this.lastDoc) {
        this.lastDoc = editor.state.doc;
        const html = readValue(editor);
        if (html !== this.lastValue) {
          this.lastValue = html;
          emitted = true;
          zone.run(() => {
            this.dirtyState.setCurrent(html);
            this.value.set(html);
            this.drafting.onValue();
          });
        }
      }
      // E18: fora do portão abaixo (trocar `alt: null` não muda URL).
      this.uploading.setMissingAlt(media?.missingAlt() ?? 0, true);
      // Só junto de um `value` (V13; endereços canônicos: não há delta sem ele).
      if (!media || !delta || !emitted) return;
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
        this.loadDocument(editor, value);
        this.dirtyState.reset(this.lastValue);
        this.drafting.onLoaded();
        this.media?.reset(editor.state.doc);
        if (this.media) this.mediaState.set(this.media.session());
        this.uploading.setMissingAlt(this.media?.missingAlt() ?? 0);
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

    // `disabled`/`hidden` fecham a barra de busca, sem mover o foco (K9).
    afterRenderEffect({
      write: () => {
        if (!this.effectiveDisabled() && !this.hidden()) return;
        untracked(() => this.endSearch(false));
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
              onUiItem: composeOnUiItem({
                open: (kind) => this.openDialog(kind),
                user: merged.slash?.onUiItem,
              }),
            }),
          ),
          createRteUiExtension({ openLink: () => this.openDialog('link') }),
          // `Mod-F` e `F3` no editável (K7, K8); `false` devolve a tecla ao navegador.
          createSearchShortcutsExtension({
            open: () => this.openSearch(),
            step: (direction) => this.stepSearch(direction),
          }),
          this.uploading.inputExtension(),
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
      this.dirtyState.reset(this.lastValue);
      const rules = readMediaUrlRules(untracked(this.schema));
      this.media = new RteMediaTracker(editor.state.doc, rules);
      this.mediaState.set(this.media.session());
      this.uploading.setMissingAlt(this.media.missingAlt());
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
      this.uploading.dispose();
      this.dirtyState.dispose();
      this.beforeUnload.dispose();
      this.drafting.dispose();
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

  /**
   * Carrega `value` no editor como carga externa (D9): sem emitir, fora do
   * histórico e com o estado recriado; deixa `lastDoc` e `lastValue` em dia.
   */
  private loadDocument(editor: Editor, value: string): void {
    // E17: antes do `EditorState.create`, que reinicia os marcadores
    this.uploading.abortAll(true);
    // D9: a recriação do estado zera a busca; a consulta aberta é refeita.
    const search = untracked(this.searchOpenState)
      ? getSearchState(editor)
      : null;
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
      if (search && search.query !== '') {
        editor.commands.setSearchQuery(search.query, {
          caseSensitive: search.caseSensitive,
          wholeWord: search.wholeWord,
        });
      }
    } finally {
      this.loading = false;
    }
    this.bridge.refresh();
    this.limitAnnouncer.rebase();
    this.lastDoc = editor.state.doc;
    this.lastValue = readValue(editor);
  }

  /**
   * `restoreDraft` (S5): o mesmo caminho do `value` (leitura tolerante do
   * esquema, histórico reiniciado), mas emite `value` uma vez e não mexe nas
   * bases: continua sujo e as remoções feitas no rascunho ainda contam.
   */
  private applyRestored(html: string): boolean {
    const editor = untracked(this.instance);
    if (!editor || editor.isDestroyed || this.destroyed) return false;
    this.ngZone.run(() => {
      this.loadDocument(editor, html);
      this.dirtyState.setCurrent(this.lastValue);
      if (this.media) {
        this.media.adopt(editor.state.doc);
        this.mediaState.set(this.media.session());
      }
      this.uploading.setMissingAlt(this.media?.missingAlt() ?? 0);
      this.value.set(this.lastValue);
    });
    return true;
  }

  /**
   * Restaura o rascunho pendente (S5); `false`, sem efeito, sem rascunho, não
   * editável, com envio em curso ou antes de o *chunk* `rte-draft` chegar.
   * Emite `value` uma vez (exceção documentada ao D9).
   */
  restoreDraft(): boolean {
    return this.keepPromptFocus(() =>
      this.ngZone.run(() => this.drafting.restore()),
    );
  }

  /** Apaga o rascunho e zera `draftAvailable` (S5). */
  discardDraft(): void {
    this.keepPromptFocus(() => {
      this.ngZone.run(() => this.drafting.discard());
      return true;
    });
  }

  protected onPromptRestore(): void {
    this.restoreDraft();
    this.focus();
  }

  protected onPromptDiscard(): void {
    this.discardDraft();
    this.focus();
  }

  /** O foco que estava no aviso vai ao editável (S6, WCAG 2.4.3). */
  private keepPromptFocus(run: () => boolean): boolean {
    const active = this.host.ownerDocument.activeElement;
    const inPrompt =
      active !== null &&
      this.host.contains(active) &&
      active.closest('.rte-draft') !== null;
    const result = run();
    if (inPrompt) this.focus();
    return result;
  }

  /** `focusin` vindo de fora do host (ou sem origem): `editorFocus` (D11). */
  protected onHostFocusIn(event: FocusEvent): void {
    if (this.hostFocused() || this.isInsideHost(event.relatedTarget)) return;
    this.hostFocused.set(true);
    this.editorFocus.emit();
  }

  /** `focusout` para fora do host (ou sem destino): `editorBlur` e `touch` (D11). */
  protected onHostFocusOut(event: FocusEvent): void {
    this.closeSlashOnLeave(event);
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

  /** O foco sai do editável (inclusive para o aviso de restauração): fecha o menu `/` (K5). */
  private closeSlashOnLeave(event: FocusEvent): void {
    const mount = this.mount().nativeElement;
    const target = event.target as Node | null;
    const next = event.relatedTarget as Node | null;
    if (!target || !mount.contains(target)) return;
    if (next && mount.contains(next)) return;
    this.closeSlash();
  }

  /** Fecha o menu `/` aberto (K5); sem efeito se já está fechado. */
  private closeSlash(): void {
    const editor = untracked(this.instance);
    if (!editor || editor.isDestroyed || !untracked(this.slashOpen)) return;
    editor.commands.closeSlashMenu();
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
    // `Mod-F` fora do editável, em qualquer parte do host (K7); no editável é
    // da extensão, salvo com `readonly`: a vista não editável não chama
    // `handleKeyDown`, então o host trata `Mod-F` e `F3` também ali. Em
    // diálogo modal, é do navegador.
    const frozen = inEditable && untracked(this.instance)?.isEditable === false;
    if ((!inEditable || frozen) && this.isSearchKey(event)) {
      if (!target.closest('dialog') && this.openSearch()) event.preventDefault();
      return;
    }
    if (
      frozen &&
      event.key === 'F3' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      if (this.stepSearch(event.shiftKey ? -1 : 1)) event.preventDefault();
      return;
    }
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
   * Marca o conteúdo como salvo (S8): a base passa a ser `savedHtml` (o que o
   * servidor confirmou; omitido, o valor atual), e o `onMediaRemoved` do
   * adaptador recebe os endereços que saíram do documento e não estão em
   * `savedHtml` (S9). Devolve `false` antes de `editorReady`.
   */
  markSaved(savedHtml?: string): boolean {
    const editor = untracked(this.instance);
    const media = this.media;
    if (!editor || editor.isDestroyed || this.destroyed || !media) return false;
    let base = this.lastValue;
    let baseUrls = new Set(media.session().current);
    if (savedHtml !== undefined) {
      const saved = readCanonical(editor, savedHtml);
      base = saved.html;
      baseUrls = new Set(countMedia(saved.doc, media.rules).keys());
    }
    const removed = media.session().removed.filter((url) => !baseUrls.has(url));
    media.rebase(baseUrls);
    this.mediaState.set(media.session());
    this.dirtyState.save(base, removed);
    return true;
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

  /** Item `search` da barra (K7): `false` de `openSearch()` não faz nada. */
  protected onToolbarSearch(): void {
    this.openSearch();
  }

  /** `Mod` + F da plataforma, sem outros modificadores. */
  private isSearchKey(event: KeyboardEvent): boolean {
    // `code` cobre layouts em que a tecla física F não produz `f`.
    const isF = event.key.toLowerCase() === 'f' || event.code === 'KeyF';
    if (!isF || event.altKey || event.shiftKey) return false;
    const mac =
      detectPlatform(this.host.ownerDocument.defaultView?.navigator) === 'mac';
    return mac
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;
  }

  /**
   * Abre a barra de busca e substituição (K7), com `query` (ou a seleção de 1
   * a 200 caracteres) como consulta; com ela aberta, foca e seleciona o
   * campo. Vale com `readonly` (só busca). `false` sem editor, com `disabled`
   * ou oculto, com o recurso desligado (`features.search`), com um diálogo em
   * curso ou depois de falhar a carga da barra.
   */
  openSearch(query?: string): boolean {
    return this.ngZone.run(() => this.requestSearch(query));
  }

  /** Fecha a barra, limpa a busca e devolve o foco ao editável se estava nela (K9). */
  closeSearch(): void {
    this.ngZone.run(() => {
      const active = this.host.ownerDocument.activeElement;
      this.endSearch(!!active && !!active.closest('.rte-search'));
    });
  }

  protected onSearchClose(): void {
    this.endSearch(true);
  }

  private requestSearch(query: string | undefined): boolean {
    const editor = untracked(this.instance);
    if (!editor || editor.isDestroyed || this.destroyed) return false;
    if (
      untracked(this.effectiveDisabled) ||
      untracked(this.hidden) ||
      !untracked(this.searchEnabled) ||
      untracked(this.searchFailed) ||
      untracked(this.dialogs.request) ||
      getSearchState(editor) === null
    ) {
      return false;
    }
    const open = untracked(this.searchOpenState);
    const initial = query ?? (open ? '' : initialSearchQuery(editor));
    if (initial !== '') editor.commands.setSearchQuery(initial);
    untracked(this.toolbarRef)?.closeMenus();
    this.closeSlash();
    this.searchOpenState.set(true);
    this.searchFocus.update((n) => n + 1);
    return true;
  }

  /** `F3`/`Shift+F3` no editável: só com a barra aberta (então a tecla é nossa). */
  private stepSearch(direction: 1 | -1): boolean {
    const editor = untracked(this.instance);
    if (!editor || editor.isDestroyed || !untracked(this.searchOpenState)) {
      return false;
    }
    if ((getSearchState(editor)?.total ?? 0) > 0) {
      if (direction === 1) editor.commands.nextSearchMatch();
      else editor.commands.previousSearchMatch();
      this.searchStep.update((n) => n + 1);
    }
    return true;
  }

  /**
   * Fecha a barra: seleciona o resultado ativo (ao devolver o foco), limpa a
   * busca (e as decorações) e, com `restoreFocus`, foca o editável.
   */
  private endSearch(restoreFocus: boolean): void {
    if (!untracked(this.searchOpenState)) return;
    const editor = untracked(this.instance);
    if (editor && !editor.isDestroyed) {
      const state = getSearchState(editor);
      const active = state?.matches[state.activeIndex];
      if (restoreFocus && active) {
        editor.commands.setTextSelection({ from: active.from, to: active.to });
      }
      editor.commands.clearSearch();
    }
    this.searchOpenState.set(false);
    if (restoreFocus) this.focus();
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
      (isMediaKind(kind) && untracked(this.dialogs.mediaFailed)) ||
      untracked(this.dialogs.request) ||
      dialogBusy(this.host.ownerDocument) ||
      this.host.ownerDocument.querySelector('dialog.rte-dialog[open]')
    ) {
      return false;
    }
    const target = dialogTarget(editor, kind);
    if (!target) return false;
    untracked(this.toolbarRef)?.closeMenus();
    this.closeSlash();
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

  /**
   * Envia na posição da seleção, como colar (E18); devolve os aceitos (E5).
   * Antes de o *chunk* `rte-upload` chegar, as recusas da E5 saem na hora e
   * os aceitos esperam (marcadores e `uploads` na chegada); falha da carga →
   * `'unavailable'`.
   */
  uploadFiles(files: Iterable<File>): number {
    return this.uploading.uploadFiles(files);
  }

  /** Cancela um envio (E8); `false` se o id não está em curso. */
  cancelUpload(id: string): boolean {
    return this.uploading.cancel(id);
  }

  /** Cancela todos os envios em curso (E8). */
  cancelAllUploads(): void {
    this.uploading.cancelAll();
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
