// API pública do sanitizador (spec 04, S8 e S9).
import { getHtmlSchema, type RteHtmlSchemaOptions } from '@cds/rte-core';
import { sanitizeWithSchema } from './engine';
import { RteSanitizeError } from './errors';

/** Opções do sanitizador: as do esquema (S9) mais os limites de S8. */
export interface RteSanitizeOptions extends RteHtmlSchemaOptions {
  /** Comprimento máximo da entrada em unidades UTF-16. Padrão `1_000_000`. */
  maxInputLength?: number;
  /**
   * Profundidade máxima de elementos abertos, de 1 a 512 (o parser do
   * Chromium achata o DOM acima de 512 níveis e a saída deixaria de ser
   * estável sob ele, I1). Padrão `256`.
   */
  maxDepth?: number;
}

const DEFAULT_MAX_INPUT_LENGTH = 1_000_000;
const DEFAULT_MAX_DEPTH = 256;
/** Teto de profundidade do parser HTML do Chromium. */
const MAX_DEPTH_CEILING = 512;

/** Valida um limite de S8: inteiro ≥ 1 (e ≤ `max`, quando houver). */
function readLimit(
  name: string,
  value: number | undefined,
  fallback: number,
  max?: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(
      `${name} ${String(value)} inválido: precisa ser um inteiro ≥ 1.`,
    );
  }
  if (max !== undefined && value > max) {
    throw new RangeError(
      `${name} ${String(value)} inválido: precisa ser um inteiro de 1 a ${max}.`,
    );
  }
  return value;
}

/**
 * Cria um sanitizador: valida os limites e monta o esquema uma vez (as
 * chaves que não são do esquema, como as do editor, são ignoradas). A função
 * devolvida lança `TypeError` para entrada que não é `string` e
 * `RteSanitizeError` ao passar de `maxInputLength` (antes de ler) ou de
 * `maxDepth`.
 */
export function createSanitizer(
  options: RteSanitizeOptions = {},
): (html: string) => string {
  const maxInputLength = readLimit(
    'maxInputLength',
    options.maxInputLength,
    DEFAULT_MAX_INPUT_LENGTH,
  );
  const maxDepth = readLimit(
    'maxDepth',
    options.maxDepth,
    DEFAULT_MAX_DEPTH,
    MAX_DEPTH_CEILING,
  );
  const schema = getHtmlSchema(options);
  return (html: string): string => {
    if (typeof html !== 'string') {
      throw new TypeError(
        `O HTML a sanitizar precisa ser string (recebido ${typeof html}).`,
      );
    }
    if (html.length > maxInputLength) {
      throw new RteSanitizeError('input-too-long', maxInputLength);
    }
    return sanitizeWithSchema(html, schema, maxDepth);
  };
}

/** Sanitizador padrão, criado na primeira chamada (R9). */
let defaultSanitizer: ((html: string) => string) | undefined;

/**
 * Sanitiza `html` pelo esquema. Sem `options`, usa o sanitizador padrão
 * memoizado; com `options`, equivale a `createSanitizer(options)(html)`.
 */
export function sanitizeRichText(
  html: string,
  options?: RteSanitizeOptions,
): string {
  if (options !== undefined) return createSanitizer(options)(html);
  defaultSanitizer ??= createSanitizer();
  return defaultSanitizer(html);
}
