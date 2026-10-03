import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dangerousUrl } from './testing/dangerous-urls';
import type { RteUrlRule } from './types';
import { isAllowedUrl } from './url';

const link: RteUrlRule = {
  kind: 'url',
  schemes: ['https', 'http', 'mailto', 'tel'],
  relative: true,
  fragment: true,
  maxLength: 2048,
};

describe('isAllowedUrl', () => {
  it.each([
    ['https://Example.com', 'https://example.com/'],
    ['  https://a.com/x  ', 'https://a.com/x'],
    ['/materia/1', '/materia/1'],
    ['#rt-intro', '#rt-intro'],
    ['mailto:joao@x.com.br', 'mailto:joao@x.com.br'],
    ['tel:+5511999999999', 'tel:+5511999999999'],
  ])('aceita e canoniza %j', (input, expected) => {
    expect(isAllowedUrl(link, input)).toBe(expected);
  });

  it('converte IDN para punycode', () => {
    expect(isAllowedUrl(link, 'https://пример.рф')).toMatch(/^https:\/\/xn--/);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    '\u0001javascript:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    'file:///etc/passwd',
    '//evil.com',
    '/\\evil.com',
    'https://u:p@a.com',
    'tel:+55 11',
    'mailto:nada',
    'materia/1',
    'a'.repeat(2049),
  ])('rejeita %j', (input) => {
    expect(isAllowedUrl(link, input)).toBeNull();
  });

  it('respeita relative e fragment desligados', () => {
    const r = { ...link, relative: false, fragment: false };
    expect(isAllowedUrl(r, '/x')).toBeNull();
    expect(isAllowedUrl(r, '#x')).toBeNull();
  });

  it('respeita hosts, blockedHosts e patterns', () => {
    const h = { ...link, hosts: ['a.com', '*.cdn.com'] };
    expect(isAllowedUrl(h, 'https://a.com/')).not.toBeNull();
    expect(isAllowedUrl(h, 'https://img.cdn.com/1')).not.toBeNull();
    expect(isAllowedUrl(h, 'https://b.com/')).toBeNull();

    const b = { ...link, blockedHosts: ['evil.com'] };
    expect(isAllowedUrl(b, 'https://sub.evil.com/')).toBeNull();
    expect(isAllowedUrl(b, 'https://evil.com./')).toBeNull();
    expect(isAllowedUrl(b, 'https://notevil.com/')).not.toBeNull();

    const p = { ...link, patterns: ['^https://a\\.com/v/\\d+$'] };
    expect(isAllowedUrl(p, 'https://a.com/v/1')).not.toBeNull();
    expect(isAllowedUrl(p, 'https://a.com/v/x')).toBeNull();
  });

  it('rejeita quando a forma canônica excede maxLength', () => {
    const v = 'https://a.com/' + 'é'.repeat(700);
    expect(v.length).toBeLessThanOrEqual(link.maxLength);
    expect(isAllowedUrl(link, v)).toBeNull();
    const idn = { ...link, maxLength: 20 };
    expect(isAllowedUrl(idn, 'https://пример.рф')).toBeNull();
    const ok = isAllowedUrl(link, 'https://a.com/é');
    expect(ok).toBe('https://a.com/%C3%A9');
    expect(isAllowedUrl(link, ok as string)).toBe(ok);
  });

  it('propriedade: esquemas perigosos ofuscados nunca passam', () => {
    fc.assert(
      fc.property(dangerousUrl, (v) => {
        expect(isAllowedUrl(link, v)).toBeNull();
      }),
      { numRuns: 2000 },
    );
  });

  it('propriedade: saída não nula é segura e idempotente', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.string({ unit: 'binary' }),
          fc.webUrl(),
          fc.string({ unit: 'binary' }).map((x) => `https://a.com/${x}`),
          dangerousUrl,
        ),
        (v) => {
          const out = isAllowedUrl(link, v);
          if (out === null) return;
          expect(out).toMatch(/^(?!(?:javascript|data|vbscript|file):)/i);
          expect(isAllowedUrl(link, out)).toBe(out);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
