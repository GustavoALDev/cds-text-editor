import type { RteRgb } from './types';

/**
 * Leitor de cores: recebe uma cor CSS em texto e devolve o RGB, ou `null` se não a entender.
 */
export type RteColorParser = (input: string) => RteRgb | null;
