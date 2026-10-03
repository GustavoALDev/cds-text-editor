import { describe, expect, it } from 'vitest';
import { DEFAULT_EMBED_PROVIDERS } from '../embeds/providers';
import { isAllowedClass } from './classes';
import { getHtmlSchema } from './get-html-schema';
import type { RteElementSpec } from './types';

const s = getHtmlSchema();
const el = (tag: string): RteElementSpec => {
  const spec = s.elements[tag];
  if (!spec) throw new Error(`elemento ausente: ${tag}`);
  return spec;
};

describe('isAllowedClass', () => {
  it('aceita padrões e valores do esquema', () => {
    expect(isAllowedClass(el('code'), 'language-js')).toBe(true);
    expect(isAllowedClass(el('figure'), 'rt-figure--left')).toBe(true);
  });

  it('recusa o que não casa', () => {
    expect(isAllowedClass(el('code'), 'language-JS')).toBe(false);
    expect(isAllowedClass(el('code'), 'hljs')).toBe(false);
    expect(isAllowedClass(el('code'), 'language-')).toBe(false);
  });

  it('elemento sem classes recusa tudo', () => {
    expect(isAllowedClass(el('p'), 'x')).toBe(false);
  });

  it('recusa tokens malformados e nomes do protótipo', () => {
    const fig = el('figure');
    expect(isAllowedClass(fig, 'constructor')).toBe(false);
    expect(isAllowedClass(fig, '__proto__')).toBe(false);
    expect(isAllowedClass(fig, '')).toBe(false);
    expect(isAllowedClass(fig, 'rt-figure rt-figure--left')).toBe(false);
    expect(isAllowedClass(fig, 'a'.repeat(129))).toBe(false);
  });

  it('getHtmlSchema aceita listas readonly', () => {
    const schema = getHtmlSchema({
      embedProviders: DEFAULT_EMBED_PROVIDERS,
      mediaHosts: ['a.com'] as const,
    });
    expect(schema.version).toBe(1);
  });
});
