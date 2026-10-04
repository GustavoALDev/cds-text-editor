import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
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
  createEditorExtensions,
  RTE_LABELS_META,
  type RteCharLimitState,
} from '@cds/rte-core/extensions';
import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { RTE_CONFIG, RTE_LABELS, type RteEditorConfig } from '../config';
import { mergeLabels, readLabelsSource } from '../labels/merge';
import type { RteLabels, RteLabelsSource } from '../labels/types';
import {
  editableAttributes,
  presentText,
  type RteEditableState,
} from './attributes';
import { bindRteBridge, createRteBridge } from './bridge';
import { isEmptyValue, readValue } from './empty';
import { RTE_EDITOR_HOOK } from './hook';
import { buildEditorOptions, mergeEditorConfig } from './options';

const OPTIONS_IGNORED =
  '[rte-editor] options só é lido na criação; a mudança foi ignorada.';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rte-root rte-editor',
    '[attr.hidden]': 'hidden() ? "" : null',
    '[class.rte-editor--disabled]': 'effectiveDisabled()',
    '[class.rte-editor--readonly]': 'readonly()',
    '[class.rte-editor--focused]': 'hostFocused()',
    '[class.rte-editor--invalid]': 'invalid() && touched()',
    '(focusin)': 'onHostFocusIn($event)',
    '(focusout)': 'onHostFocusOut($event)',
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

  // Saídas
  readonly editorReady = output<Editor>();
  readonly editorFocus = output<void>();
  readonly editorBlur = output<void>();

  private readonly instance = signal<Editor | null>(null);
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

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
  private pendingFocus: FocusOptions | null = null;
  private destroyed = false;

  // Estado (somente leitura)
  readonly editor: Signal<Editor | null> = this.instance.asReadonly();
  readonly isEmpty: Signal<boolean> = this.bridge.isEmpty;
  readonly isFocused: Signal<boolean> = this.bridge.isFocused;
  readonly textStats: Signal<RteCharLimitState | null> = this.bridge.textStats;

  private readonly providerLabels = inject(RTE_LABELS);

  /** Rótulos efetivos: entrada `labels` > `provideRichText` > `en` (D15). */
  protected readonly resolvedLabels: Signal<RteLabels> = computed(() =>
    mergeLabels(this.providerLabels(), readLabelsSource(this.labels())),
  );

  /** Desabilitado efetivo (a Tarefa 7 soma o `setDisabledState` do CVA). */
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

  constructor() {
    bindRteBridge(this, this.bridge);

    const host = this.host;
    const zone = inject(NgZone);
    const config = inject(RTE_CONFIG);

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
    const onTransaction = ({ editor }: { editor: Editor }) => {
      if (this.loading || editor.state.doc === this.lastDoc) return;
      this.lastDoc = editor.state.doc;
      const html = readValue(editor);
      if (html === this.lastValue) return;
      this.lastValue = html;
      zone.run(() => this.value.set(html));
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
      zone.runOutsideAngular(() => editor.setEditable(editable, false));
    });

    // `disabled`/`hidden` com o foco dentro do host: o foco sai (sem
    // `relatedTarget`) e o `focusout` emite `editorBlur`/`touch` uma vez
    // (Review Focus 4). Navegadores que já tiraram o foco não duplicam:
    // `hostFocused` guarda o estado.
    effect(() => {
      if (!this.effectiveDisabled() && !this.hidden()) return;
      untracked(() => {
        const active = host.ownerDocument?.activeElement as
          (Element & { blur?: () => void }) | null | undefined;
        if (active && active !== host && host.contains(active)) active.blur?.();
      });
    });

    // Rótulos e placeholder ao vivo (D15): uma transação só de meta relê as
    // decorações, o `aria-placeholder` e o nome das tarefas. Não despacha na
    // primeira leitura de cada editor (ele nasceu com os rótulos atuais).
    let labelsEditor: Editor | null = null;
    effect(() => {
      this.placeholder();
      this.resolvedLabels();
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
        const extensions = createEditorExtensions(
          buildEditorOptions(
            mergeEditorConfig(config.editor, optionsAtCreation),
            {
              placeholder: () => this.placeholder(),
              charLimit: () => toCharLimit(this.maxLength()),
              content: () => this.resolvedLabels().content,
              slash: () => this.resolvedLabels().slash,
            },
          ),
        );
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
              editorProps: { attributes },
            }),
        );
      });
      Object.defineProperty(host, RTE_EDITOR_HOOK, {
        value: editor,
        configurable: true,
      });
      this.lastDoc = editor.state.doc;
      this.lastValue = readValue(editor);
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
    this.hostFocused.set(false);
    this.editorBlur.emit();
    this.touch.emit();
  }

  private isInsideHost(target: EventTarget | null): boolean {
    return (
      target !== null &&
      typeof (target as Node).nodeType === 'number' &&
      this.host.contains(target as Node)
    );
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
