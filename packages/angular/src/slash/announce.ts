import {
  afterRenderEffect,
  computed,
  signal,
  untracked,
  type NgZone,
  type Signal,
} from '@angular/core';
import type { RteSlashMenuState } from '@cds/rte-core/extensions';
import type { RteSlashMenuLabels } from '../labels/types';

/** Atraso do anúncio da contagem (K4). */
export const SLASH_ANNOUNCE_DELAY_MS = 300;

/**
 * Texto da região viva do menu `/` (K4): `slashMenu.count(n)` ao abrir e
 * quando o número de itens muda, `slashMenu.empty` sem itens, tudo adiado
 * 300 ms (a digitação rápida anuncia só o último); fechado, vazio.
 *
 * É um `afterRenderEffect`, não um `effect`: o estado vem da versão da ponte,
 * que sobe fora da zona, e um `effect` notificado de fora dela faz o zone.js
 * pedir outro `tick` durante o atual (NG0101, ver `onTransaction` do editor).
 * O temporizador também fica fora da zona; a escrita volta a ela.
 */
export function createSlashAnnouncement(o: {
  state: Signal<RteSlashMenuState>;
  labels: Signal<RteSlashMenuLabels>;
  view: Window | null;
  zone: NgZone;
}): Signal<string> {
  const text = signal('');
  const count = computed(() => {
    const s = o.state();
    return s.open ? s.items.length : null;
  });
  afterRenderEffect((onCleanup) => {
    const n = count();
    const view = o.view;
    if (!view) return;
    // Fechado e já vazio: nada a escrever.
    if (n === null && untracked(text) === '') return;
    const labels = untracked(o.labels);
    const next =
      n === null ? '' : n === 0 ? labels.empty : labels.count(n);
    const timer = o.zone.runOutsideAngular(() =>
      view.setTimeout(
        () => o.zone.run(() => text.set(next)),
        n === null ? 0 : SLASH_ANNOUNCE_DELAY_MS,
      ),
    );
    onCleanup(() => view.clearTimeout(timer));
  });
  return text.asReadonly();
}
