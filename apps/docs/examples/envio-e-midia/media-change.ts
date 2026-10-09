// #region sessao
import { Component, viewChild } from '@angular/core';
import { RteEditor, type RteMediaChange } from '@cds/rte-angular';

@Component({
  selector: 'docs-media-save',
  imports: [RteEditor],
  template: `
    <rte-editor ariaLabel="Texto" (mediaChange)="onMedia($event)" />
    <button type="button" (click)="save()">Salvar</button>
  `,
})
export class MediaSave {
  private readonly editor = viewChild.required(RteEditor);

  // Uma emissão por transação que muda o conjunto de endereços de mídia.
  protected onMedia(change: RteMediaChange): void {
    console.debug('adicionadas', change.added, 'removidas', change.removed);
  }

  protected async save(): Promise<void> {
    const editor = this.editor();
    const html = editor.value();
    // O líquido desde a base: desfazer pode devolver um endereço que o delta já dava como removido.
    const { removed } = editor.mediaSession();
    const response = await fetch('/api/documents/42', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, removed }),
    });
    // Só depois de gravar: a base passa a ser este HTML e o rascunho local é apagado.
    if (response.ok) editor.markSaved(html);
  }
}
// #endregion

// #region remocao
import type { RteUploadAdapter } from '@cds/rte-angular';

export const comLimpeza: RteUploadAdapter = {
  uploadImage: () => Promise.reject(new Error('veja o adaptador do envio')),
  // Chamado depois de markSaved e sem envios pendentes. Peça ao servidor para apagar COM carência.
  async onMediaRemoved(urls) {
    await fetch('/api/media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, graceMs: 24 * 60 * 60 * 1000 }),
    });
  },
};
// #endregion
