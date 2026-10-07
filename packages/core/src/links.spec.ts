import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dangerousUrl } from './schema/testing/dangerous-urls';
import { DEFAULT_LINK_POLICY, getLinkAttributes, normalizeHref } from './links';

describe('normalizeHref', () => {
  it('completa domínio sem esquema com https', () => {
    expect(normalizeHref('site.com')).toBe('https://site.com/');
    expect(normalizeHref('site.com/a?b=1#c')).toBe('https://site.com/a?b=1#c');
  });
  it('e-mail vira mailto', () => {
    expect(normalizeHref('joao@x.com')).toBe('mailto:joao@x.com');
  });
  it('apara espaços e aceita relativo e fragmento', () => {
    expect(normalizeHref(' https://a.com ')).toBe('https://a.com/');
    expect(normalizeHref('/materia')).toBe('/materia');
    expect(normalizeHref('#rt-x')).toBe('#rt-x');
  });
  it.each(['', '   ', 'javascript:alert(1)', '//evil.com', 'materia'])(
    'rejeita %j',
    (v) => expect(normalizeHref(v)).toBeNull(),
  );
  it('respeita a política', () => {
    expect(normalizeHref('http://a.com', { protocols: ['https'] })).toBeNull();
    expect(normalizeHref('site.com', { protocols: ['http'] })).toBeNull();
    expect(normalizeHref('/x', { allowRelative: false })).toBeNull();
    expect(normalizeHref('#x', { allowRelative: false })).toBeNull();
    expect(
      normalizeHref('https://sub.evil.com', { blockedDomains: ['evil.com'] }),
    ).toBeNull();
    expect(
      normalizeHref('evil.com', { blockedDomains: ['EVIL.com.'] }),
    ).toBeNull();
  });
  it('recusa curinga em blockedDomains', () => {
    expect(() =>
      normalizeHref('a.com', { blockedDomains: ['*.a.com'] }),
    ).toThrow(TypeError);
  });
  it('blockedDomains IDN bloqueia o href em punycode', () => {
    expect(
      normalizeHref('https://exämple.com', { blockedDomains: ['exämple.com'] }),
    ).toBeNull();
  });
  it.each(['evil.com:443', 'evil.com/', '*.evil.com'])(
    'blockedDomains recusa %j',
    (d) =>
      expect(() => normalizeHref('a.com', { blockedDomains: [d] })).toThrow(
        TypeError,
      ),
  );
  it.each(['javascript', 'data', 'https:'])('protocols %j lança', (p) =>
    expect(() => normalizeHref('a.com', { protocols: [p] })).toThrow(TypeError),
  );
  it('política padrão', () => {
    expect(DEFAULT_LINK_POLICY).toEqual({
      protocols: ['https', 'http', 'mailto', 'tel'],
      allowRelative: true,
      defaultRel: [],
      forceRel: [],
      blockedDomains: [],
      target: 'preserve',
    });
  });
  it('propriedade: nunca devolve esquema perigoso', () => {
    fc.assert(
      fc.property(
        fc.oneof(dangerousUrl, fc.string({ unit: 'binary' })),
        (s) => {
          const out = normalizeHref(s);
          if (out === null) return true;
          return !/^(javascript|data|vbscript|file):/.test(out.toLowerCase());
        },
      ),
    );
  });
});

describe('getLinkAttributes', () => {
  it('target _blank pedido adiciona rel de segurança', () => {
    expect(
      getLinkAttributes('https://a.com', {}, { target: '_blank' }),
    ).toEqual({
      href: 'https://a.com/',
      rel: 'noopener noreferrer',
      target: '_blank',
    });
  });
  it('sem target devolve só href', () => {
    expect(getLinkAttributes('https://a.com')).toEqual({
      href: 'https://a.com/',
    });
  });
  it('blank só para http(s) absoluto', () => {
    expect(getLinkAttributes('/interno', { target: 'blank' })).toEqual({
      href: '/interno',
    });
    expect(getLinkAttributes('mailto:a@b.com', { target: 'blank' })).toEqual({
      href: 'mailto:a@b.com',
    });
    expect(getLinkAttributes('https://a.com', { target: 'blank' })).toEqual({
      href: 'https://a.com/',
      rel: 'noopener noreferrer',
      target: '_blank',
    });
  });
  it('never ignora options.target', () => {
    expect(
      getLinkAttributes(
        'https://a.com',
        { target: 'never' },
        { target: '_blank' },
      ),
    ).toEqual({ href: 'https://a.com/' });
  });
  it('rel em ordem canônica', () => {
    expect(
      getLinkAttributes('https://a.com', {
        forceRel: ['ugc', 'nofollow'],
        defaultRel: ['sponsored'],
      }),
    ).toEqual({ href: 'https://a.com/', rel: 'nofollow sponsored ugc' });
  });
  it('token desconhecido lança', () => {
    expect(() =>
      getLinkAttributes('https://a.com', { defaultRel: ['x'] }),
    ).toThrow(TypeError);
    expect(() =>
      getLinkAttributes('https://a.com', { forceRel: ['x'] }),
    ).toThrow(TypeError);
  });
  it('href inválido devolve null', () => {
    expect(getLinkAttributes('javascript:alert(1)')).toBeNull();
  });
});
