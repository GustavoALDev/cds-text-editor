import type { RteCharLimitState } from '@cds/rte-core/extensions';
import type { RteCounterLabels } from '../labels/types';

/** Palavras por minuto do tempo de leitura (K11). */
export const WORDS_PER_MINUTE = 200;

/** Fração do limite que marca o estado "perto" (K11). */
const NEAR_FRACTION = 0.1;

export type RteCounterLevel = 'normal' | 'near' | 'over';

export interface RteFooterModel {
  readonly chars: { readonly text: string; readonly level: RteCounterLevel } | null;
  readonly words: string | null;
}

/** Tempo de leitura em minutos, arredondado para cima (K11). */
export function readingMinutes(words: number): number {
  return Math.ceil(words / WORDS_PER_MINUTE);
}

/** Restam `<=` 10% do limite (e ainda não passou dele). */
export function isNearLimit(stats: RteCharLimitState): boolean {
  const { limit, remaining } = stats;
  if (limit === null || remaining === null || stats.overLimit) return false;
  return remaining <= limit * NEAR_FRACTION;
}

/**
 * O que o rodapé mostra (K11): `null` sem editor pronto (`textStats()` nulo,
 * inclusive no servidor) ou sem nenhum contador ligado.
 */
export function buildFooter(
  stats: RteCharLimitState | null,
  show: { readonly chars: boolean; readonly words: boolean },
  labels: RteCounterLabels,
): RteFooterModel | null {
  if (!stats || (!show.chars && !show.words)) return null;
  return {
    chars: show.chars
      ? {
          text: labels.chars(stats.characters, stats.limit),
          level: stats.overLimit ? 'over' : isNearLimit(stats) ? 'near' : 'normal',
        }
      : null,
    words: show.words
      ? labels.words(stats.words, readingMinutes(stats.words))
      : null,
  };
}
