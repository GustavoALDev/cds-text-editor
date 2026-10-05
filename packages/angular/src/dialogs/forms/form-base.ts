import { Directive, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';
import type { RteDialogLabels } from '../../labels/types';
import type { RteDialogController, RteDialogRequest } from '../controller';
import { fieldError } from '../form-helpers';

/**
 * Base dos componentes de formulário dos diálogos: as entradas comuns, o erro
 * visível de um campo e o cancelamento. `@Directive()` para que as entradas
 * por signal funcionem nas subclasses.
 */
@Directive()
export abstract class RteDialogFormBase {
  readonly request = input.required<RteDialogRequest>();
  readonly controller = input.required<RteDialogController>();
  readonly labels = input.required<RteDialogLabels>();
  readonly idPrefix = input.required<string>();

  protected error(field: FieldTree<unknown>): string | null {
    return fieldError(field, this.labels());
  }

  protected cancel(): void {
    this.controller().cancel('cancelled');
  }
}
