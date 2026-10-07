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
import type { RteTheme } from '@cds/rte-theme';
import type { RteDraftConfig } from './draft/types';
import type { RteFloatingMenusConfig } from './floating/types';
import type { RteToolbarConfig } from './toolbar/items';
import type { RteUploadConfig } from './upload/types';
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
  /** Barra de ferramentas padrão (entrada > provider > 'article'). */
  toolbar?: RteToolbarConfig;
  /** Tema padrão; sem ele, o CSS em cascata. */
  theme?: RteTheme;
  /** Menus flutuantes padrão; sem ele, todos ligados (M17). */
  floatingMenus?: RteFloatingMenusConfig;
  /** Envio de arquivos padrão (entrada `upload` > provider); sem ele, sem arquivo (E3). */
  upload?: RteUploadConfig;
  /** Rascunho padrão (armazenamento, idade, aviso); só age com `draftKey` (S3). */
  draft?: RteDraftConfig;
  /** Aviso ao sair com alterações não salvas; padrão desligado (entrada > provider, S10). */
  warnOnUnsaved?: boolean;
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
