import type { RteUploadType } from './types';

/**
 * Elemento do marcador de envio (E7): `contenteditable="false"` e
 * `aria-hidden="true"` (controles e anúncios são da bandeja, E8); `--queued`
 * até o envio começar. A Tarefa 8 completa o conteúdo (nome, progresso,
 * miniatura).
 */
export function createMarkerElement(
  doc: Document,
  type: RteUploadType,
): HTMLElement {
  const el = doc.createElement('span');
  el.className = `rte-upload-marker rte-upload-marker--${type} rte-upload-marker--queued`;
  el.setAttribute('contenteditable', 'false');
  el.setAttribute('aria-hidden', 'true');
  return el;
}
