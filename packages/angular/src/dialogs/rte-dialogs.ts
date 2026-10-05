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
import { applyQuote, applyTable } from './apply';
import type { RteDialogController, RteDialogRequest } from './controller';
import { dialogErrorText, integerInRange } from './forms';

/** Tamanho máximo de autor e cargo (G15; limite só da interface). */
const QUOTE_MAX = 200;
/** Limites da tabela nova (G16). */
const TABLE_ROWS_MAX = 100;
const TABLE_COLS_MAX = 20;

let nextInstance = 0;

interface QuoteModel {
  author: string;
  role: string;
}

interface TableModel {
  rows: number | null;
  cols: number | null;
  headerRow: boolean;
  headerColumn: boolean;
}

/** Valores de cada abertura do diálogo de tabela (G16). */
const TABLE_INITIAL: Readonly<TableModel> = Object.freeze({
  rows: 3,
  cols: 3,
  headerRow: true,
  headerColumn: false,
});

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
    tableRows: `${this.prefix}-table-rows`,
    tableCols: `${this.prefix}-table-cols`,
    tableHeaderRow: `${this.prefix}-table-header-row`,
    tableHeaderColumn: `${this.prefix}-table-header-column`,
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

  private readonly tableModel = signal<TableModel>({ ...TABLE_INITIAL });
  protected readonly tableForm: FieldTree<TableModel> = form(
    this.tableModel,
    (p) => {
      integerInRange(p.rows, 1, TABLE_ROWS_MAX);
      integerInRange(p.cols, 1, TABLE_COLS_MAX);
    },
    {
      submission: {
        action: async () => {
          this.applyTable();
          return undefined;
        },
        onInvalid: () =>
          this.focusFirstInvalid([this.tableForm.rows, this.tableForm.cols]),
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
    // Um `close` atrasado (no navegador vem numa tarefa) de um fechamento
    // anterior não cancela o diálogo reaberto nesse meio-tempo.
    if (this.destroyed || this.dialog().nativeElement.open) return;
    const req = untracked(this.controller().request);
    if (req && req.id === this.shownId) this.controller().cancel('cancelled');
  }

  protected cancel(): void {
    this.controller().cancel('cancelled');
  }

  /** Erro visível do campo: só depois de tocado (ou de um envio) (G8). */
  protected errorOf<T>(field: FieldTree<T>): string | null {
    const state = field();
    return state.touched() && state.invalid()
      ? dialogErrorText(state.errors(), this.labels())
      : null;
  }

  private prepare(req: RteDialogRequest): void {
    if (req.kind === 'quoteAuthor') {
      this.quoteForm().reset(quoteValues(req));
    } else if (req.kind === 'table') {
      this.tableForm().reset({ ...TABLE_INITIAL });
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

  /** Foca o primeiro campo inválido, na ordem fixa dos campos (G8). */
  private focusFirstInvalid(fields: readonly FieldTree<unknown>[]): void {
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

  private applyTable(): void {
    const req = untracked(this.controller().request);
    if (req?.kind !== 'table') return;
    const { rows, cols, headerRow, headerColumn } = untracked(this.tableModel);
    if (rows === null || cols === null) return;
    this.controller().apply((editor) =>
      applyTable(editor, req, { rows, cols, headerRow, headerColumn }),
    );
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
