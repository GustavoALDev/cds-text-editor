import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  maxLength,
  type FieldTree,
} from '@angular/forms/signals';
import type { RteAttrRule, RteLinkPolicy } from '@cds/rte-core';
import type { RteDialogLabels } from '../labels/types';
import { applyQuote } from './apply';
import type { RteDialogController, RteDialogRequest } from './controller';
import { dialogErrorText } from './forms';

/** Tamanho máximo de autor e cargo (G15; limite só da interface). */
const QUOTE_MAX = 200;

let nextInstance = 0;

interface QuoteModel {
  author: string;
  role: string;
}

/**
 * Diálogos do editor (G2–G8), carregados por `@defer` no `RteEditor`: um
 * `<dialog>` nativo aberto com `showModal()` para o pedido do controlador,
 * com um formulário em Signal Forms por tipo. Interno: nunca referenciado
 * fora do `imports` do `RteEditor` e do bloco `@defer` (senão o *chunk* some).
 */
@Component({
  selector: 'rte-dialogs',
  templateUrl: './rte-dialogs.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteDialogs {
  readonly controller = input.required<RteDialogController>();
  readonly labels = input.required<RteDialogLabels>();
  readonly linkPolicy = input<Partial<RteLinkPolicy> | undefined>(undefined);
  readonly langRule = input<RteAttrRule | null>(null);

  private readonly prefix = `rte-dialog-${++nextInstance}`;
  protected readonly ids = {
    title: `${this.prefix}-title`,
    quoteAuthor: `${this.prefix}-quote-author`,
    quoteRole: `${this.prefix}-quote-role`,
  };

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Último pedido preparado (o conteúdo fica até o próximo). */
  protected readonly active = signal<RteDialogRequest | null>(null);
  /** Id do pedido mostrado por último com `showModal()`. */
  private shownId = 0;
  private destroyed = false;

  protected readonly title = computed(() => {
    const req = this.active();
    const l = this.labels();
    switch (req?.kind) {
      case 'link':
        return req.mode === 'edit' ? l.linkEditTitle : l.linkInsertTitle;
      case 'lang':
        return req.mode === 'edit' ? l.langEditTitle : l.langTitle;
      case 'quoteAuthor':
        return l.quoteTitle;
      case 'table':
        return l.tableTitle;
      default:
        return '';
    }
  });

  private readonly quoteModel = signal<QuoteModel>({ author: '', role: '' });
  protected readonly quoteForm: FieldTree<QuoteModel> = form(
    this.quoteModel,
    (p) => {
      maxLength(p.author, QUOTE_MAX);
      maxLength(p.role, QUOTE_MAX);
    },
    {
      submission: {
        action: async () => {
          this.applyQuote();
          return undefined;
        },
        onInvalid: () =>
          this.focusFirstInvalid([this.quoteForm.author, this.quoteForm.role]),
      },
    },
  );

  constructor() {
    // Destruído (com o editor): fecha sem tratar o `close` como cancelamento
    // (o controlador descarta o pedido sem mover o foco, G5).
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.hide();
    });

    effect((onCleanup) => {
      const controller = this.controller();
      onCleanup(controller.register({ hide: () => this.hide() }));
    });

    // Pedido novo: valores atuais no formulário antes do render do conteúdo.
    effect(() => {
      const req = this.controller().request();
      if (!req || req === untracked(this.active)) return;
      untracked(() => {
        this.prepare(req);
        this.active.set(req);
      });
    });

    // Depois do render: abre como modal e foca o primeiro campo (G4).
    afterRenderEffect({
      write: () => {
        const req = this.controller().request();
        if (!req || req.id === this.shownId || req !== this.active()) return;
        untracked(() => this.show(req));
      },
    });
  }

  /** `close` do `<dialog>` (Escape ou fechamento externo): cancelamento (G3). */
  protected onClose(): void {
    if (this.destroyed) return;
    const req = untracked(this.controller().request);
    if (req && req.id === this.shownId) this.controller().cancel('cancelled');
  }

  protected cancel(): void {
    this.controller().cancel('cancelled');
  }

  /** Erro visível do campo: só depois de tocado (ou de um envio) (G8). */
  protected errorOf(field: FieldTree<string>): string | null {
    const state = field();
    return state.touched() && state.invalid()
      ? dialogErrorText(state.errors(), this.labels())
      : null;
  }

  private prepare(req: RteDialogRequest): void {
    if (req.kind === 'quoteAuthor') {
      this.quoteForm().reset(quoteValues(req));
    }
  }

  private show(req: RteDialogRequest): void {
    this.shownId = req.id;
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector<HTMLInputElement>(
      '.rte-dialog__field input, .rte-dialog__field select',
    );
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
  }

  private hide(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
  }

  private focusFirstInvalid(fields: readonly FieldTree<string>[]): void {
    fields
      .find((f) => f().invalid())?.()
      .focusBoundControl();
  }

  private applyQuote(): void {
    const req = untracked(this.controller().request);
    if (req?.kind !== 'quoteAuthor') return;
    const value = untracked(this.quoteModel);
    this.controller().apply((editor) => applyQuote(editor, req, value));
  }
}

/** Autor e cargo atuais da citação do pedido (atributos de texto puro). */
function quoteValues(req: RteDialogRequest): QuoteModel {
  const $pos = req.doc.resolve(req.range.from);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'rtPullquote') {
      return {
        author: String(node.attrs['author'] ?? ''),
        role: String(node.attrs['role'] ?? ''),
      };
    }
  }
  return { author: '', role: '' };
}
