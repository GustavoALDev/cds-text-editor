import { Directive, effect, inject, input, untracked } from '@angular/core';
import { NgModel } from '@angular/forms';
import { RteValidators } from '@cds/rte-angular/validators';

/**
 * Limite de texto para Template Forms. A biblioteca só traz o validador funcional
 * (`RteValidators.maxChars`) e o caminho de controle customizado do Angular 22.2 não lê
 * `NG_VALIDATORS` (README do angular, "Envio de arquivos"): o validador é acrescentado ao
 * controle do `NgModel`.
 */
@Directive({ selector: '[demoMaxChars]' })
export class MaxCharsDirective {
  readonly demoMaxChars = input.required<number>();
  private readonly ngModel = inject(NgModel);

  constructor() {
    effect(() => {
      const max = this.demoMaxChars();
      untracked(() => {
        const control = this.ngModel.control;
        control.setValidators(RteValidators.maxChars(max));
        control.updateValueAndValidity({ emitEvent: false });
      });
    });
  }
}
