import { afterNextRender, Directive, input } from '@angular/core';

/**
 * Diretiva interna do `@error` do bloco dos diálogos (pré-voo 5): chama a
 * função dada depois do render (o `@error` é terminal; o pedido é descartado).
 */
@Directive({ selector: 'ng-template[rteDeferFailed]' })
export class RteDeferFailed {
  readonly failed = input.required<() => void>({ alias: 'rteDeferFailed' });

  constructor() {
    afterNextRender(() => this.failed()());
  }
}
