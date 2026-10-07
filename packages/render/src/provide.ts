import { InjectionToken, type Provider } from '@angular/core';
import {
  mergeRenderLabels,
  RTE_RENDER_LABELS,
  RTE_RENDER_LABELS_EN,
} from './labels';
import type { RteRenderOptions } from './types';

/** Opções fornecidas por `provideRteRender` (interno). */
export const RTE_RENDER_OPTIONS = new InjectionToken<RteRenderOptions>(
  'RTE_RENDER_OPTIONS',
  { providedIn: 'root', factory: () => ({}) },
);

/** Configura a renderização: sanitizador, links de fragmento e rótulos. */
export function provideRteRender(options: RteRenderOptions): Provider[] {
  return [
    { provide: RTE_RENDER_OPTIONS, useValue: options },
    {
      provide: RTE_RENDER_LABELS,
      useValue: mergeRenderLabels(RTE_RENDER_LABELS_EN, options.labels),
    },
  ];
}
