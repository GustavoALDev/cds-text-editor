// #region salvar
import { Component, signal, viewChild } from '@angular/core';
import { RteEditor } from '@comodeviaser/rte-angular';

// Troque pela chamada ao seu servidor: devolva o HTML que ele gravou (já sanitizado).
async function enviar(html: string): Promise<string> {
  return html;
}

@Component({
  selector: 'docs-save-editor',
  imports: [RteEditor],
  template: `
    <rte-editor
      [(value)]="html"
      draftKey="user-7:doc-42"
      ariaLabel="Texto do documento"
    />
    <button type="button" [disabled]="!editor().isDirty()" (click)="save()">
      Salvar
    </button>
  `,
})
export class SaveEditor {
  protected readonly html = signal('');
  protected readonly editor = viewChild.required(RteEditor);

  protected async save(): Promise<void> {
    const saved = await enviar(this.html());
    // A base passa a ser o HTML gravado e o rascunho local é apagado.
    this.editor().markSaved(saved);
  }
}
// #endregion
