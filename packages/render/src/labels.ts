import { InjectionToken } from '@angular/core';
import type { RteRenderLabels } from './types';

/** Rótulos em inglês (padrão), congelados. */
export const RTE_RENDER_LABELS_EN: RteRenderLabels = Object.freeze({
  toc: 'Table of contents',
  tableScroller: 'Scrollable table',
});

/** Rótulos vigentes; sem `provideRteRender` valem os em inglês. */
export const RTE_RENDER_LABELS = new InjectionToken<RteRenderLabels>(
  'RTE_RENDER_LABELS',
  { providedIn: 'root', factory: () => RTE_RENDER_LABELS_EN },
);

/** Sobrepõe `over` a `base`, aceitando só `string` não vazia; o resto cai na base. */
export function mergeRenderLabels(
  base: RteRenderLabels,
  ...over: (Partial<RteRenderLabels> | undefined)[]
): RteRenderLabels {
  const result: RteRenderLabels = { ...base };
  for (const layer of over) {
    if (!layer) continue;
    for (const key of Object.keys(base) as (keyof RteRenderLabels)[]) {
      const value: unknown = layer[key];
      if (typeof value === 'string' && value !== '') result[key] = value;
    }
  }
  return result;
}
