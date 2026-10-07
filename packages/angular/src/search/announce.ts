import {
  afterRenderEffect,
  signal,
  untracked,
  type NgZone,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import type { RteSearchState } from '@cds/rte-core/extensions';
import type { RteSearchLabels } from '../labels/types';

/** Atraso do anúncio de posição/total quando a consulta muda (K10). */
export const SEARCH_ANNOUNCE_DELAY_MS = 500;

/**
 * Texto de posição da busca (contador visível e anúncio): vazio sem
 * consulta, `none` sem resultado, `capped(i)` no teto de 1000 e
 * `position(i, n)` nos demais casos.
 */
export function searchPositionText(
  state: RteSearchState,
  labels: RteSearchLabels,
): string {
  if (state.query === '') return '';
  if (state.total === 0) return labels.none;
  const index = Math.max(state.activeIndex, 0) + 1;
  return state.capped
    ? labels.capped(index)
    : labels.position(index, state.total);
}

export interface RteSearchAnnouncement {
  /** Texto da região viva. */
  readonly text: Signal<string>;
  /** Uma substituição foi feita: o próximo anúncio é `replaced(n)`, imediato. */
  readonly replaceSeq: WritableSignal<number>;
}

/**
 * Região viva da barra de busca (K10). Posição e total saem 500 ms depois da
 * última mudança da consulta ou do total (não a cada tecla) e na hora quando
 * só o resultado ativo muda (navegação); `replaced(n)` sai na hora, lido de
 * `lastReplaced`, quando `replaceSeq` sobe.
 *
 * É um `afterRenderEffect`, como o menu `/`: o estado vem da versão da ponte,
 * que sobe fora da zona, e um `effect` notificado de fora dela faz o zone.js
 * pedir outro `tick` durante o atual (NG0101).
 */
export function createSearchAnnouncement(o: {
  state: Signal<RteSearchState>;
  labels: Signal<RteSearchLabels>;
  view: Window | null;
  zone: NgZone;
}): RteSearchAnnouncement {
  const text = signal('');
  const replaceSeq = signal(0);
  let seenSeq = 0;
  let seenKey = '';
  afterRenderEffect((onCleanup) => {
    const state = o.state();
    const seq = replaceSeq();
    const view = o.view;
    if (!view) return;
    const labels = untracked(o.labels);
    const key = `${state.query}\u0000${state.caseSensitive}\u0000${state.wholeWord}\u0000${state.total}\u0000${state.capped}`;
    let next: string;
    let delay: number;
    if (seq !== seenSeq) {
      seenSeq = seq;
      seenKey = key;
      next = labels.replaced(state.lastReplaced ?? 0);
      delay = 0;
    } else {
      delay = key === seenKey ? 0 : SEARCH_ANNOUNCE_DELAY_MS;
      seenKey = key;
      next = searchPositionText(state, labels);
    }
    if (next === untracked(text)) return;
    const timer = o.zone.runOutsideAngular(() =>
      view.setTimeout(() => o.zone.run(() => text.set(next)), delay),
    );
    onCleanup(() => view.clearTimeout(timer));
  });
  return { text: text.asReadonly(), replaceSeq };
}
