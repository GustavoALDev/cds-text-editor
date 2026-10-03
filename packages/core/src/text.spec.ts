import { afterEach, describe, expect, it, vi } from 'vitest';
import { countWords, readingTime } from './text';

afterEach(() => vi.unstubAllGlobals());

describe('countWords', () => {
  it('conta palavras', () => {
    expect(countWords('Olá, mundo!')).toBe(2);
    expect(countWords('')).toBe(0);
    expect(countWords('  ')).toBe(0);
    expect(countWords('日本語のテキスト')).toBeGreaterThan(1);
  });
  it('usa regex sem Intl.Segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    expect(countWords('a b c')).toBe(3);
  });
});

describe('readingTime', () => {
  const words = (n: number) => Array(n).fill('a').join(' ');
  it('arredonda para cima a 200 palavras por minuto', () => {
    expect(readingTime('')).toBe(0);
    expect(readingTime(words(200))).toBe(1);
    expect(readingTime(words(201))).toBe(2);
    expect(readingTime(words(100), { wordsPerMinute: 50 })).toBe(2);
  });
  it('rejeita wordsPerMinute inválido', () => {
    expect(() => readingTime('a', { wordsPerMinute: 0 })).toThrow(RangeError);
    expect(() => readingTime('a', { wordsPerMinute: NaN })).toThrow(RangeError);
    expect(() => readingTime('a', { wordsPerMinute: Infinity })).toThrow(
      RangeError,
    );
  });
});
