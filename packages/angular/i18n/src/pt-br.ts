import type { RteLabels } from '@cds/rte-angular';
import { RTE_CONTENT_LABELS, RTE_SLASH_LABELS } from '@cds/rte-core/extensions';

/** Rótulos em português do Brasil, congelados em profundidade. */
export const RTE_LABELS_PT_BR: RteLabels = Object.freeze({
  content: RTE_CONTENT_LABELS['pt-BR'],
  slash: RTE_SLASH_LABELS['pt-BR'],
  editor: Object.freeze({ ariaLabel: 'Editor de texto rico' }),
  errors: Object.freeze({
    rteRequired: 'Este campo é obrigatório.',
    rteMaxChars: ({ max, actual }: { max: number; actual: number }) =>
      `Use no máximo ${max} caracteres (${actual} agora).`,
    rteMaxWords: ({ max, actual }: { max: number; actual: number }) =>
      `Use no máximo ${max} palavras (${actual} agora).`,
  }),
});
