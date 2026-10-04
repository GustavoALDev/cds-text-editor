import type { RteLabels } from '@cds/rte-angular';
import { RTE_CONTENT_LABELS, RTE_SLASH_LABELS } from '@cds/rte-core/extensions';

/** Rótulos em espanhol, congelados em profundidade. */
export const RTE_LABELS_ES: RteLabels = Object.freeze({
  content: RTE_CONTENT_LABELS.es,
  slash: RTE_SLASH_LABELS.es,
  editor: Object.freeze({ ariaLabel: 'Editor de texto enriquecido' }),
  errors: Object.freeze({
    rteRequired: 'Este campo es obligatorio.',
    rteMaxChars: ({ max, actual }: { max: number; actual: number }) =>
      `Usa como máximo ${max} caracteres (${actual} ahora).`,
    rteMaxWords: ({ max, actual }: { max: number; actual: number }) =>
      `Usa como máximo ${max} palabras (${actual} ahora).`,
  }),
});
