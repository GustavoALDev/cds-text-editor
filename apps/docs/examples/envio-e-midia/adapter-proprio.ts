// #region adaptador
import { RteUploadError, type RteUploadAdapter } from '@comodeviaser/rte-angular';

interface UploadResponse {
  url: string;
  width?: number;
  height?: number;
}

export const meuAdaptador: RteUploadAdapter = {
  async uploadImage(file, { signal, onProgress }) {
    // `fetch` não informa o progresso de envio: `null` mostra a barra indeterminada.
    onProgress(null);
    const body = new FormData();
    body.set('file', file);
    let response: Response;
    try {
      // O `signal` precisa chegar à requisição: cancelar o envio chama `abort()` de verdade.
      response = await fetch('/api/images', { method: 'POST', body, signal });
    } catch (cause) {
      throw new RteUploadError('network', { cause });
    }
    if (!response.ok) throw new RteUploadError('server');
    const data = (await response.json()) as UploadResponse;
    // O editor revalida a resposta pelas regras do esquema (mediaHosts, allowRelativeMedia).
    return { url: data.url, width: data.width, height: data.height };
  },
};
// #endregion
