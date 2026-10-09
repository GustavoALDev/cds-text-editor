import type { RteRgb } from './types';

export type RteColorParser = (input: string) => RteRgb | null;
