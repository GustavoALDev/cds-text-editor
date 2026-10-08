// #region entradas
import { Component } from '@angular/core';
import { RteEditor, type RteEditorConfig } from '@cds/rte-angular';

// `options` é lido uma vez, na criação do editor: passe uma constante.
const OPTIONS: RteEditorConfig = {
  linkPolicy: { forceRel: ['noopener', 'noreferrer'] },
};

@Component({
  selector: 'docs-inputs-editor',
  imports: [RteEditor],
  template: `
    <rte-editor
      ariaLabel="Resumo"
      placeholder="Escreva o resumo"
      toolbar="full"
      [options]="options"
      [showCharCount]="true"
    />
  `,
})
export class InputsEditor {
  protected readonly options = OPTIONS;
}
// #endregion
