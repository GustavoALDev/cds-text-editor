import { RteUploadError, type AdapterReason } from './types';

/**
 * Motivo de um erro do adaptador (E4, pré-voo 4): reconhece pela marca
 * (`name` + `reason` válido), não só por `instanceof`, para que o `/upload`
 * crie erros sem importar o principal. Tudo o mais vale `'server'`.
 */
export function uploadReason(e: unknown): AdapterReason {
  try {
    if (e instanceof RteUploadError) return e.reason;
    if (typeof e === 'object' && e !== null) {
      const { name, reason } = e as { name?: unknown; reason?: unknown };
      if (
        name === 'RteUploadError' &&
        (reason === 'network' || reason === 'server' || reason === 'response')
      ) {
        return reason;
      }
    }
  } catch {
    // getter que lança: vale 'server'
  }
  return 'server';
}
