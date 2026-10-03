import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeAttribute } from './rules';
import { formatSrcset, parseSrcset } from './srcset';
import type { RteAttrRule } from './types';

const rule: RteAttrRule = {
  kind: 'srcset',
  maxLength: 4096,
  url: {
    kind: 'url',
    schemes: ['https'],
    relative: true,
    fragment: false,
    maxLength: 2048,
  },
};

describe('srcset', () => {
  it('lê candidatos com descritor', () => {
    expect(parseSrcset('a.jpg 480w, b.jpg 2x')).toEqual([
      { url: 'a.jpg', descriptor: '480w' },
      { url: 'b.jpg', descriptor: '2x' },
    ]);
  });

  it('rejeita vírgula na URL e descritor inválido', () => {
    expect(parseSrcset('a,b.jpg 1x')).toBeNull();
    expect(parseSrcset('a.jpg 480q')).toBeNull();
  });

  it('formatSrcset(parseSrcset(s)) é estável', () => {
    const parsed = parseSrcset('a.jpg   480w ,b.jpg 2x') ?? [];
    const once = formatSrcset(parsed);
    expect(once).toBe('a.jpg 480w, b.jpg 2x');
    expect(formatSrcset(parseSrcset(once) ?? [])).toBe(once);
  });

  it('a regra rejeita candidato com URL fora das permitidas', () => {
    expect(normalizeAttribute(rule, 'javascript:x 1x')).toBeNull();
    expect(
      normalizeAttribute(rule, '/a.jpg 1x, http://x.com/b.jpg 2x'),
    ).toBeNull();
    expect(normalizeAttribute(rule, '/a.jpg 1x, https://x.com/b.jpg 2x')).toBe(
      '/a.jpg 1x, https://x.com/b.jpg 2x',
    );
  });

  it('entrada gigante é rejeitada pelo maxLength sem processar', () => {
    const big = Array.from(
      { length: 10_000 },
      (_, i) => `/i${i}.jpg ${i + 1}w`,
    ).join(', ');
    const t = performance.now();
    expect(normalizeAttribute(rule, big)).toBeNull();
    expect(performance.now() - t).toBeLessThan(50);
  });

  it('propriedade: normalizar é idempotente', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.constantFrom('/a.jpg', 'https://x.com/b.png', 'ftp://x'),
            fc.nat(3000),
          ),
          {
            minLength: 1,
            maxLength: 5,
          },
        ),
        (cs) => {
          const v = cs.map(([u, n]) => `${u} ${n}w`).join(', ');
          const once = normalizeAttribute(rule, v);
          if (once === null) return;
          expect(normalizeAttribute(rule, once)).toBe(once);
        },
      ),
    );
  });
});
