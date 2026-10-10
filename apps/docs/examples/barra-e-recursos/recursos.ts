// #region recursos
import { Component, viewChild } from '@angular/core';
import { RteEditor, type RteEditorConfig } from '@comodeviaser/rte-angular';

// `options` é lido uma vez, na criação: passe uma constante. `features` liga e desliga recursos
// (todos ligados por padrão); o item correspondente some da barra.
const OPTIONS: RteEditorConfig = {
  features: { tables: false, newsBlocks: false, search: false },
};

@Component({
  selector: 'docs-features-editor',
  imports: [RteEditor],
  template: `
    <rte-editor
      toolbar="full"
      ariaLabel="Texto"
      [options]="options"
      [floatingMenus]="{ table: false }"
      [showCharCount]="true"
      [showWordCount]="true"
    />
    <button type="button" (click)="openLink()">Inserir link</button>
  `,
})
export class FeaturesEditor {
  protected readonly options = OPTIONS;
  private readonly editor = viewChild.required(RteEditor);

  // Abre o diálogo de link por código; devolve false se não for aplicável agora.
  protected openLink(): void {
    this.editor().openDialog('link');
  }
}
// #endregion
