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
  type RteCharLimitState,
} from '@cds/rte-core/extensions';
import { Editor } from '@tiptap/core';
import { RTE_CONFIG, RTE_LABELS, type RteEditorConfig } from '../config';
import { mergeLabels, readLabelsSource } from '../labels/merge';
import type { RteLabels, RteLabelsSource } from '../labels/types';
import { editableAttributes, type RteEditableState } from './attributes';
import { bindRteBridge, createRteBridge } from './bridge';
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
    '[class.rte-editor--invalid]': 'invalid() && touched()',
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
  private readonly bridge = createRteBridge(
    this.instance,
    () => (this.value() ?? '') === '',
  );

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

  /** Nome acessível da casca: `ariaLabelledBy` vence `ariaLabel`. */
  protected readonly shellLabel = computed(() =>
    this.ariaLabelledBy()
      ? null
      : (this.ariaLabel() ?? this.resolvedLabels().editor.ariaLabel),
  );

  protected readonly showShellPlaceholder = computed(
    () => (this.value() ?? '') === '' && this.placeholder() !== '',
  );

  private readonly mount = viewChild.required<ElementRef<HTMLElement>>('mount');

  constructor() {
    bindRteBridge(this, this.bridge);

    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
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
      this.instance.set(editor);
      this.bridge.connect(editor);
      zone.run(() => this.editorReady.emit(editor));
    });

    inject(DestroyRef).onDestroy(() => {
      const editor = untracked(this.instance);
      if (!editor) return;
      this.bridge.disconnect();
      delete (host as unknown as Record<symbol, unknown>)[RTE_EDITOR_HOOK];
      editor.destroy();
      this.instance.set(null);
    });
  }

  /** Foca o editável (o pedido antes da criação chega com a Tarefa 4). */
  focus(options?: FocusOptions): void {
    untracked(this.instance)?.commands.focus(null, {
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
