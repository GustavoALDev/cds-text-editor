import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  type FieldTree,
} from '@angular/forms/signals';
import type { RteDialogLabels } from '../../labels/types';
import { applyTable } from '../apply';
import type { RteDialogController, RteDialogRequest } from '../controller';
import { fieldError, focusFirstInvalid, integerInRange } from '../forms';

/** Limites da tabela nova (G16). */
const TABLE_ROWS_MAX = 100;
const TABLE_COLS_MAX = 20;

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

/** Formulário do diálogo de tabela (G16), filho do `RteDialogs`. */
@Component({
  selector: 'rte-table-form',
  templateUrl: './table-form.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteTableForm {
  readonly request = input.required<RteDialogRequest>();
  readonly controller = input.required<RteDialogController>();
  readonly labels = input.required<RteDialogLabels>();
  readonly idPrefix = input.required<string>();

  protected readonly ids = computed(() => ({
    rows: `${this.idPrefix()}-table-rows`,
    cols: `${this.idPrefix()}-table-cols`,
    headerRow: `${this.idPrefix()}-table-header-row`,
    headerColumn: `${this.idPrefix()}-table-header-column`,
  }));

  private readonly model = signal<TableModel>({ ...TABLE_INITIAL });
  protected readonly form: FieldTree<TableModel> = form(
    this.model,
    (p) => {
      integerInRange(p.rows, 1, TABLE_ROWS_MAX);
      integerInRange(p.cols, 1, TABLE_COLS_MAX);
    },
    {
      submission: {
        action: async () => {
          this.apply();
          return undefined;
        },
        onInvalid: () => focusFirstInvalid([this.form.rows, this.form.cols]),
      },
    },
  );

  constructor() {
    // Pedido novo: valores iniciais no formulário antes do render.
    effect(() => {
      this.request();
      untracked(() => this.form().reset({ ...TABLE_INITIAL }));
    });
  }

  protected error(field: FieldTree<unknown>): string | null {
    return fieldError(field, this.labels());
  }

  protected cancel(): void {
    this.controller().cancel('cancelled');
  }

  private apply(): void {
    const req = untracked(this.request);
    if (req.kind !== 'table') return;
    const { rows, cols, headerRow, headerColumn } = untracked(this.model);
    if (rows === null || cols === null) return;
    this.controller().apply((editor) =>
      applyTable(editor, req, { rows, cols, headerRow, headerColumn }),
    );
  }
}
