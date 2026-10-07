import type { RteUploadConfig } from '@cds/rte-angular';
import { httpUploadAdapter } from '@cds/rte-angular/upload';

/** Teto das imagens no app de teste (o servidor recusa acima de 5 MB). */
const MAX_IMAGE_BYTES = 1024 * 1024;

/**
 * Configuração de envio do app de teste (spec 05c2a, E25):
 * `httpUploadAdapter` contra o `POST /__upload` do `serve.mjs`; `query` vira
 * a consulta do *endpoint* (`?status=500`, `?bad=json`, `?slow=1`; Ruling 14).
 * Cada chamada é uma referência nova (trocar aborta os envios, E17).
 */
export function uploadConfig(preview: boolean, query = ''): RteUploadConfig {
  return {
    adapter: httpUploadAdapter({ endpoint: `/__upload${query}` }),
    maxImageBytes: MAX_IMAGE_BYTES,
    preview,
  };
}
