import { shortName } from './short-name';
import type { RteUploadType } from './types';

/**
 * Elemento do marcador de envio (E7, pré-voo 7):
 * `span.rte-upload-marker.rte-upload-marker--<tipo>` com
 * `contenteditable="false"` e `aria-hidden="true"` (controles e anúncios são
 * da bandeja, E8), com a miniatura (`img[alt=""]`, só com `preview` numa
 * imagem, E16), o nome (texto, nunca HTML) e um `<progress>` sem `value`
 * (indeterminado); `--queued` até o envio começar. Progresso e fila mudam por
 * escrita direta no elemento, sem transação.
 */
export function createMarkerElement(
  doc: Document,
  type: RteUploadType,
  name = '',
  preview: string | null = null,
): HTMLElement {
  const el = doc.createElement('span');
  el.className = `rte-upload-marker rte-upload-marker--${type} rte-upload-marker--queued`;
  el.setAttribute('contenteditable', 'false');
  el.setAttribute('aria-hidden', 'true');
  if (preview !== null && type === 'image') {
    const img = doc.createElement('img');
    img.className = 'rte-upload-marker__preview';
    img.setAttribute('alt', '');
    img.setAttribute('src', preview);
    el.append(img);
  }
  const label = doc.createElement('span');
  label.className = 'rte-upload-marker__name';
  label.textContent = shortName(name);
  const bar = doc.createElement('progress');
  bar.className = 'rte-upload-marker__progress';
  el.append(label, bar);
  return el;
}

/** Progresso do marcador: `null` tira o `value` (indeterminado). */
export function setMarkerProgress(el: HTMLElement, value: number | null): void {
  const bar = el.querySelector('progress');
  if (!bar) return;
  if (value === null) bar.removeAttribute('value');
  else bar.value = value;
}
