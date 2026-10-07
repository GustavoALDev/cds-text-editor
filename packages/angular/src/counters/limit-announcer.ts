import {
  afterRenderEffect,
  DestroyRef,
  inject,
  signal,
  untracked,
  type NgZone,
  type Signal,
} from '@angular/core';
import type { RteCharLimitState } from '@cds/rte-core/extensions';
import type { RteCounterLabels } from '../labels/types';

/** Intervalo mínimo entre anúncios de recusa (K12). */
export const REJECTED_MIN_INTERVAL_MS = 1000;

/** @internal */
export interface RteLimitAnnouncement {
  readonly n: number;
  readonly text: string;
}

/** Limiar do aviso de pouco espaço: `max(10, 10% do limite)` (K12). */
export function remainingThreshold(limit: number): number {
  return Math.max(10, limit * 0.1);
}

interface Baseline {
  limit: number;
  rejected: number;
  below: boolean;
  over: boolean;
}

function baselineOf(s: RteCharLimitState | null): Baseline | null {
  if (!s || s.limit === null || s.remaining === null) return null;
  return {
    limit: s.limit,
    rejected: s.rejected,
    below: s.remaining < remainingThreshold(s.limit),
    over: s.overLimit,
  };
}

export interface RteLimitAnnouncer {
  /** Anúncio atual (uma entrada; o `n` novo recria o nó e a leitura se repete). */
  readonly announcements: Signal<readonly RteLimitAnnouncement[]>;
  /**
   * Toma o estado atual como base sem anunciar: carga externa (D9) e criação.
   * Chamado depois de `bridge.refresh()`.
   */
  rebase(): void;
}

/**
 * Anúncios do limite (K12), só com limite: `rejected` no máximo 1/s;
 * `remaining` cruzando abaixo de `max(10, 10%)` uma vez por cruzamento (rearma
 * ao subir); `over` na transição. A primeira leitura e a troca de limite só
 * tomam a base. É um `afterRenderEffect` (a versão da ponte sobe fora da zona;
 * um `effect` causaria NG0101 no zone.js) e a escrita vai por temporizador.
 */
export function createLimitAnnouncer(o: {
  stats: Signal<RteCharLimitState | null>;
  labels: Signal<RteCounterLabels>;
  view: Window | null;
  zone: NgZone;
}): RteLimitAnnouncer {
  const list = signal<readonly RteLimitAnnouncement[]>([]);
  let base: Baseline | null = null;
  let counter = 0;
  let lastRejectedAt = Number.NEGATIVE_INFINITY;

  // Temporizadores pendentes: limpos ao destruir, para não escrever num
  // sinal de componente já destruído.
  const timers = new Set<number>();
  inject(DestroyRef).onDestroy(() => {
    for (const id of timers) o.view?.clearTimeout(id);
    timers.clear();
  });

  const emit = (text: string): void => {
    const view = o.view;
    if (!view) return;
    const n = ++counter;
    const id = o.zone.runOutsideAngular(() =>
      view.setTimeout(() => {
        timers.delete(id);
        o.zone.run(() => list.set([{ n, text }]));
      }, 0),
    );
    timers.add(id);
  };

  afterRenderEffect(() => {
    const s = o.stats();
    untracked(() => {
      const next = baselineOf(s);
      const prev = base;
      base = next;
      if (!s || !next || !prev || prev.limit !== next.limit) return;
      const labels = o.labels();
      if (next.over && !prev.over) {
        emit(labels.over(-(s.remaining ?? 0)));
      } else if (next.rejected > prev.rejected) {
        const now = Date.now();
        if (now - lastRejectedAt >= REJECTED_MIN_INTERVAL_MS) {
          lastRejectedAt = now;
          emit(labels.rejected(next.limit));
        }
      } else if (next.below && !prev.below) {
        emit(labels.remaining(s.remaining ?? 0));
      }
    });
  });

  return {
    announcements: list.asReadonly(),
    rebase: () => {
      base = baselineOf(untracked(o.stats));
    },
  };
}
