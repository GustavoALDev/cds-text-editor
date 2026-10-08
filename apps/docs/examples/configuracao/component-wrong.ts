// #region errado
import { Component } from '@angular/core';
import { RteEditor, provideRichText } from '@cds/rte-angular';

@Component({
  selector: 'docs-wrong-editor',
  imports: [RteEditor],
  template: `<rte-editor ariaLabel="Texto" />`,
  providers: [
    // @ts-expect-error provideRichText devolve EnvironmentProviders: o compilador recusa em componente
    provideRichText({ toolbar: 'minimal' }),
  ],
})
export class WrongEditor {}
// #endregion
