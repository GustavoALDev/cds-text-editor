import {
  computed,
  InjectionToken,
  makeEnvironmentProviders,
  signal,
  type EnvironmentProviders,
  type Signal,
} from '@angular/core';
import type {
  RteEditorOptions,
  RteSlashOptions,
} from '@cds/rte-core/extensions';
import { RTE_LABELS_EN } from './labels/en';
import { mergeLabels, readLabelsSource } from './labels/merge';
import type { RteLabels, RteLabelsSource } from './labels/types';

/** Opções lidas só na criação (D20). `placeholder`, `charLimit` e `labels` vêm de entradas. */
export type RteEditorConfig = Omit<
  RteEditorOptions,
  'placeholder' | 'charLimit' | 'labels' | 'slash'
> & {
  slash?: Omit<RteSlashOptions, 'labels'>;
};

export interface RteConfig {
  labels?: RteLabelsSource;
  /** Padrões de criação para toda instância (D20). */
  editor?: RteEditorConfig;
}

/** Rótulos do provider já mesclados sobre `en` (sem a entrada da instância). */
export const RTE_LABELS = new InjectionToken<Signal<RteLabels>>('RTE_LABELS', {
  providedIn: 'root',
  factory: () => signal(RTE_LABELS_EN).asReadonly(),
});

/** Configuração do provider (interno). */
export const RTE_CONFIG = new InjectionToken<RteConfig>('RTE_CONFIG', {
  providedIn: 'root',
  factory: () => ({}),
});

/**
 * Opcional: sem ele, rótulos `en` e padrões do core. Em `bootstrapApplication`
 * ou em `providers` de rota.
 */
export function provideRichText(config: RteConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: RTE_CONFIG, useValue: config },
    {
      provide: RTE_LABELS,
      useFactory: () =>
        computed(() =>
          mergeLabels(RTE_LABELS_EN, readLabelsSource(config.labels)),
        ),
    },
  ]);
}
