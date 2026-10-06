import type { RteUploads } from '../upload/facade';
import type { RteUploadManager } from '../upload/manager';

/** Fachada dos envios de um `RteEditor` (campo privado, só nos testes). */
export function uploadsOf(cmp: object): RteUploads {
  return (cmp as { uploadRuntime: RteUploads }).uploadRuntime;
}

/**
 * Espera o *chunk* `rte-upload` (Ruling 28): começa a carga se ainda não
 * começou e resolve com o gerenciador montado.
 */
export async function whenUploadReady(cmp: object): Promise<RteUploadManager> {
  const uploads = uploadsOf(cmp);
  await uploads.load();
  const runtime = uploads.current();
  if (!runtime) throw new Error('envio não montado (configuração nula?)');
  return runtime.manager;
}

/** Gerenciador já montado (depois de {@link whenUploadReady}). */
export function uploadManagerOf(cmp: object): RteUploadManager {
  const runtime = uploadsOf(cmp).current();
  if (!runtime) throw new Error('envio não montado');
  return runtime.manager;
}
