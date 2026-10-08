// #region component
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RteEditor } from '@cds/rte-angular';

@Component({
  selector: 'docs-value-form',
  imports: [RteEditor],
  template: `
    <rte-editor [(value)]="html" ariaLabel="Texto (value)" />
    <p>
      Valor: <output data-testid="valor">{{ html() }}</output>
    </p>
    <button type="button" (click)="html.set('<p>Valor definido</p>')">
      Definir valor
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValueForm {
  protected readonly html = signal('<p>Sem formulário</p>');
}
// #endregion
