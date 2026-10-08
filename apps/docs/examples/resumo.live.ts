import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
} from '@angular/core';
import { resumo } from './exemplo-minimo';

/** Exemplo vivo mínimo: usa o pacote publicado, sem estado nem navegador. */
@Component({
  selector: 'docs-resumo-live',
  template: `<p class="doc-live__result">{{ text }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class ResumoLive {
  protected readonly text = resumo('<p>Olá, <b>mundo</b>!</p>');
}
