import { RTE_CONTENT_LABELS, RTE_SLASH_LABELS } from '@cds/rte-core/extensions';
import type { RteLabels } from './types';

/** Rótulos em inglês (padrão), congelados em profundidade. */
export const RTE_LABELS_EN: RteLabels = Object.freeze({
  content: RTE_CONTENT_LABELS.en,
  slash: RTE_SLASH_LABELS.en,
  editor: Object.freeze({ ariaLabel: 'Rich text editor' }),
  errors: Object.freeze({
    rteRequired: 'This field is required.',
    rteMaxChars: ({ max, actual }: { max: number; actual: number }) =>
      `Use at most ${max} characters (${actual} now).`,
    rteMaxWords: ({ max, actual }: { max: number; actual: number }) =>
      `Use at most ${max} words (${actual} now).`,
  }),
});
