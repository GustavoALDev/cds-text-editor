/** Conta palavras com `Intl.Segmenter` (ou regex de letras/dígitos como alternativa). */
export function countWords(text: string): number {
  const str = String(text);
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    let count = 0;
    for (const part of new Intl.Segmenter(undefined, {
      granularity: 'word',
    }).segment(str)) {
      if (part.isWordLike) count++;
    }
    return count;
  }
  return str.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

/** Minutos de leitura, arredondados para cima (0 para texto sem palavras). */
export function readingTime(
  text: string,
  options: { wordsPerMinute?: number } = {},
): number {
  const wpm = options.wordsPerMinute ?? 200;
  if (!Number.isFinite(wpm) || wpm <= 0) {
    throw new RangeError(
      `wordsPerMinute ${String(wpm)} inválido: precisa ser finito e maior que 0.`,
    );
  }
  return Math.ceil(countWords(text) / wpm);
}
