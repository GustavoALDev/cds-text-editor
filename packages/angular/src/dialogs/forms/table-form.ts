import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  max,
  min,
  required,
  validate,
  type FieldTree,
  type SchemaPath,
} from '@angular/forms/signals';
import { applyTable } from '../apply';
import type { RteDialogRequest } from '../controller';
import {
  focusFirstInvalid,
  integerError,
  nonIntegerCheck,
} from '../form-helpers';
import { RteDialogFormBase } from './form-base';

/**
 * Inteiro obrigatório em `[lo, hi]` (pré-voo 9): vazio → `required`; fora do
 * intervalo ou não inteiro → `rteInteger` com os dois limites. `min`/`max`
 * gravam os atributos nativos pelo `[formField]` e trocam o erro padrão
 * (que só carrega um dos limites) pelo `rteInteger`.
 */
function integerInRange(
  path: SchemaPath<number | null>,
  lo: number,
  hi: number,
): void {
  const error = integerError(lo, hi);
  required(path);
  min(path, lo, { error });
  max(path, hi, { error });
  validate(path, nonIntegerCheck(error));
}

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
export class RteTableForm extends RteDialogFormBase {
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
    super();
    // Pedido novo: valores iniciais no formulário antes do render.
    effect(() => {
      this.request();
      untracked(() => this.form().reset({ ...TABLE_INITIAL }));
    });
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
