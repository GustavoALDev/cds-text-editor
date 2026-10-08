// #region errado
import { Component, type Provider } from '@angular/core';
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

// O mesmo erro, isolado: EnvironmentProviders não é um Provider.
// @ts-expect-error EnvironmentProviders não é atribuível a Provider
export const provider: Provider = provideRichText();
// #endregion
