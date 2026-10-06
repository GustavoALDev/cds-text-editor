import { computed, type Signal } from '@angular/core';
import type { RteUploadLabels } from '../labels/types';
import type { RteUploadAnnouncement, RteUploadHost } from './host';

/**
 * Texto de um anúncio (E8, E20) nos rótulos atuais: início com a contagem
 * do gesto; conclusão, cancelamento e erro com uma frase por nome (o
 * cancelamento em lote e as recusas de um gesto juntam por espaço).
 */
export function announcementText(
  a: RteUploadAnnouncement,
  labels: RteUploadLabels,
): string {
  switch (a.kind) {
    case 'start':
      return labels.announceStart(a.count ?? a.names.length);
    case 'done':
      return a.names.map((name) => labels.announceDone(name)).join(' ');
    case 'cancelled':
      return a.names.map((name) => labels.announceCancelled(name)).join(' ');
    case 'error':
      return a.names
        .map((name, i) =>
          labels.announceError(name, a.reasons?.[i] ?? a.reason ?? 'server'),
        )
        .join(' ');
  }
}

/**
 * Textos da região `aria-live` (E8) sobre os anúncios do turno e os rótulos
 * atuais; `n` é a chave do `@for` (nó novo a cada anúncio, o mesmo texto
 * repetido é reanunciado).
 */
export function announcementTexts(
  host: Pick<RteUploadHost, 'announcements'>,
  labels: () => RteUploadLabels,
): Signal<readonly { readonly n: number; readonly text: string }[]> {
  return computed(() => {
    const l = labels();
    return host
      .announcements()
      .map((a) => ({ n: a.n, text: announcementText(a, l) }));
  });
}
