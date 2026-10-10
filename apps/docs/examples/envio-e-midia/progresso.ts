// #region progresso
import { Component, signal } from '@angular/core';
import { RteEditor, type RteUploadErrorEvent } from '@comodeviaser/rte-angular';
import { meuAdaptador } from './adapter-proprio';

@Component({
  selector: 'docs-upload-progress',
  imports: [RteEditor],
  template: `
    <rte-editor
      #editor
      ariaLabel="Texto"
      [upload]="config"
      (uploadError)="onError($event)"
    />
    <button
      type="button"
      [disabled]="editor.pendingUploads() === 0"
      (click)="editor.cancelAllUploads()"
    >
      Cancelar envios ({{ editor.pendingUploads() }})
    </button>
    <p aria-live="polite">{{ message() }}</p>
  `,
})
export class UploadProgress {
  // Uma referência estável: trocar a configuração com envios em curso aborta todos.
  protected readonly config = { adapter: meuAdaptador };
  protected readonly message = signal('');

  // Cancelar pela pessoa não é erro e não passa por aqui; `cause` é só para o seu registro.
  protected onError(event: RteUploadErrorEvent): void {
    this.message.set(`Falha ao enviar ${event.fileName}: ${event.reason}.`);
  }
}
// #endregion
