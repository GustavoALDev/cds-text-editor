import * as core from '@comodeviaser/rte-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as mod from './index';
import { readFixture } from './testing/fixtures';

vi.mock('@comodeviaser/rte-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@comodeviaser/rte-core')>();
  return { ...original, getHtmlSchema: vi.fn(original.getHtmlSchema) };
});

describe('@comodeviaser/rte-sanitizer', () => {
  it('exporta só a API pública', () => {
    expect(Object.keys(mod).sort()).toEqual([
      'RteSanitizeError',
      'createSanitizer',
      'sanitizeRichText',
    ]);
    for (const name of ['htmlToText', 'countWords', 'readingTime']) {
      expect(mod).not.toHaveProperty(name);
    }
  });
});

describe('sanitizeRichText (S9)', () => {
  const getHtmlSchema = vi.mocked(core.getHtmlSchema);

  beforeEach(() => {
    getHtmlSchema.mockClear();
  });

  it('memoiza o sanitizador padrão (esquema montado uma vez)', () => {
    expect(mod.sanitizeRichText('<p>a</p>')).toBe('<p>a</p>');
    expect(mod.sanitizeRichText('<p>a</p>')).toBe('<p>a</p>');
    expect(getHtmlSchema).toHaveBeenCalledTimes(1);
    getHtmlSchema.mockClear();
    mod.sanitizeRichText('<p>b</p>');
    expect(getHtmlSchema).not.toHaveBeenCalled();
  });

  it('com opções, monta o esquema a cada chamada e dá a mesma saída', () => {
    const fixture = readFixture('all-features.html');
    const expected = mod.sanitizeRichText(fixture);
    getHtmlSchema.mockClear();
    expect(mod.sanitizeRichText(fixture, {})).toBe(expected);
    expect(mod.sanitizeRichText(fixture, {})).toBe(expected);
    expect(getHtmlSchema).toHaveBeenCalledTimes(2);
  });

  it('createSanitizer monta o esquema uma vez', () => {
    const s = mod.createSanitizer({ features: { tables: false } });
    expect(getHtmlSchema).toHaveBeenCalledTimes(1);
    s('<p>a</p>');
    s('<p>b</p>');
    expect(getHtmlSchema).toHaveBeenCalledTimes(1);
  });
});
