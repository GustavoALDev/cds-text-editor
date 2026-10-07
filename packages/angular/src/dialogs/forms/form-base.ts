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

  /**
   * `mousedown` nos botões do rodapé não move o foco: o `blur` do campo o
   * marcaria como tocado, o erro em linha deslocaria o botão e o clique se
   * perderia (Firefox). O envio já marca todos e foca o primeiro inválido.
   */
  protected keepFocus(event: MouseEvent): void {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('.rte-dialog__actions button')
    ) {
      event.preventDefault();
    }
  }

  protected cancel(): void {
    this.controller().cancel('cancelled');
  }
}
