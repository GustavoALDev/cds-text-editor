import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createHeadingIds, slugify } from './headings';
import { getHtmlSchema } from './schema/get-html-schema';

describe('slugify', () => {
  it('remove acentos e pontuação', () => {
    expect(slugify('Ação Rápida: 2026!')).toBe('acao-rapida-2026');
    expect(slugify('  --x--  ')).toBe('x');
  });
  it('limita o comprimento (padrão 60)', () => {
    expect(slugify('a'.repeat(100))).toHaveLength(60);
    expect(slugify('abc-def', 4)).toBe('abc');
  });
  it('dobra compatibilidade (largura total, ligaduras)', () => {
    expect(slugify('ＡＢＣ ﬁm')).toBe('abc-fim');
  });
  it('sem letras latinas devolve vazio', () => {
    expect(slugify('🚀')).toBe('');
  });
});

describe('createHeadingIds', () => {
  it('gera ids únicos com sufixo', () => {
    const id = createHeadingIds();
    expect(id('Introdução')).toBe('rt-introducao');
    expect(id('Introdução')).toBe('rt-introducao-2');
    expect(id('Introdução 2')).toBe('rt-introducao-2-2');
    expect(id('!!!')).toBe('rt-section');
    expect(id('日本語')).toBe('rt-section-2');
  });
  it('aceita prefixo e fallback', () => {
    expect(createHeadingIds({ prefix: 'x-', fallback: 'secao' })('🚀')).toBe(
      'x-secao',
    );
  });
  it('valida prefixo e fallback', () => {
    expect(() => createHeadingIds({ fallback: 'Seção' })).toThrow(RangeError);
    expect(() => createHeadingIds({ fallback: '' })).toThrow(RangeError);
    expect(() => createHeadingIds({ prefix: 'X' })).toThrow(RangeError);
  });
  it('respeita maxLength 80 mesmo com sufixo (força o corte)', () => {
    const prefix = 'abcdefghijklmno-';
    const id = createHeadingIds({ prefix });
    const title = 'a'.repeat(100);
    const base = prefix + 'a'.repeat(60);
    const seen = new Set<string>();
    let trimmed = 0;
    for (let i = 1; i <= 10000; i++) {
      const v = id(title);
      expect(v.length).toBeLessThanOrEqual(80);
      expect(v).toMatch(/^abcdefghijklmno-[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(seen.has(v)).toBe(false);
      seen.add(v);
      if (i > 1 && v.length < base.length + `-${i}`.length) trimmed++;
    }
    expect(trimmed).toBeGreaterThan(0);
  });
  it('propriedade: ids válidos no esquema e sem repetição', () => {
    const rule = getHtmlSchema().elements['h2']?.attributes['id']?.rule;
    if (rule?.kind !== 'pattern') throw new Error('regra inesperada');
    const re = new RegExp(rule.pattern);
    fc.assert(
      fc.property(fc.array(fc.string()), (titles) => {
        const id = createHeadingIds();
        const seen = new Set<string>();
        for (const t of titles) {
          const v = id(t);
          expect(re.test(v)).toBe(true);
          expect(v.length).toBeLessThanOrEqual(rule.maxLength);
          expect(seen.has(v)).toBe(false);
          seen.add(v);
        }
      }),
    );
  });
});
