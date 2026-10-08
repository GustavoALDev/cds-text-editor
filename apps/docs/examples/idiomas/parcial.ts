// #region parcial
import { Component } from '@angular/core';
import { RteEditor, type RteLabelsInput } from '@cds/rte-angular';

// Um objeto parcial também vale: o que faltar cai no inglês.
const MEUS_ROTULOS: RteLabelsInput = {
  toolbar: { bold: 'Destaque forte' },
};

@Component({
  selector: 'docs-partial-labels',
  imports: [RteEditor],
  template: `<rte-editor [labels]="labels" ariaLabel="Texto" />`,
})
export class PartialLabels {
  protected readonly labels = MEUS_ROTULOS;
}
// #endregion
