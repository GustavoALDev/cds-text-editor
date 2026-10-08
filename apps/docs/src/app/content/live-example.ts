import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  Type,
  ViewEncapsulation,
} from '@angular/core';

/**
 * Exemplo vivo (spec 07c, X6): renderiza o componente do `registry.ts` entre os segmentos de
 * HTML da página. O resolver da rota já carregou o componente, então o prerender e a
 * hidratação enxergam o mesmo DOM.
 */
@Component({
  selector: 'docs-live',
  imports: [NgComponentOutlet],
  templateUrl: './live-example.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class LiveExample {
  readonly component = input.required<Type<unknown>>();
}
