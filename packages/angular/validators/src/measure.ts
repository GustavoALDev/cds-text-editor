import { countCharacters, countWords } from '@cds/rte-core';
import { htmlToText } from '@cds/rte-core/html';

/** Medida do texto de um valor HTML (regra do C5: a mesma do `textStats()`). */
export interface RteTextMeasure {
  readonly characters: number;
  readonly words: number;
  readonly hasText: boolean;
  readonly hasMedia: boolean;
}

/**
 * O serializador canônico escapa `<` em atributos e texto, então o padrão é
 * exato para o HTML do editor; para HTML não canônico é aproximação.
 */
const MEDIA = /<(?:img|video|iframe)[\s/>]/i;

/** Sonda de teste: quantas vezes o HTML foi de fato lido. */
export const measureProbe = { parses: 0 };

let lastValue: string | undefined;
let lastMeasure: RteTextMeasure | undefined;

/** Mede o valor; o último par valor→medida fica em cache (um parse por valor). */
export function measureRteText(
  html: string | null | undefined,
): RteTextMeasure {
  const value = html ?? '';
  if (lastMeasure && lastValue === value) return lastMeasure;
  measureProbe.parses++;
  const text = htmlToText(value);
  const measure: RteTextMeasure = {
    characters: countCharacters(text),
    words: countWords(text),
    hasText: text.length > 0,
    hasMedia: MEDIA.test(value),
  };
  lastValue = value;
  lastMeasure = measure;
  return measure;
}

/** Limite válido (inteiro não negativo) ou `undefined` = sem limite. */
export function resolveMax(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}
