import { describe, expect, it } from 'vitest';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { normalizeAttribute } from '../../src/schema/rules';
import type { RteAttrRule, RteHtmlSchema } from '../../src/schema/types';
import { validateHtml } from './validate-html';

const s = getHtmlSchema();
const kinds = (html: string, mode?: 'canonical' | 'accepted') =>
  validateHtml(html, s, mode ? { mode } : {}).map((v) => v.kind);

describe('validateHtml', () => {
  it.each([
    '<p style="text-align: center">a</p>',
    '<h2 id="rt-a">A</h2>',
    '<a href="https://a.com/" target="_blank" rel="noopener noreferrer">a</a>',
    '<span data-rt-color="red" style="color: #b3261e">a</span>',
    '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">T</label></li></ul>',
  ])('conforme nos dois modos: %s', (html) => {
    expect(kinds(html, 'canonical')).toEqual([]);
    expect(kinds(html, 'accepted')).toEqual([]);
  });

  it('style', () => {
    expect(kinds('<p style="text-align:center;">a</p>')).toEqual([
      'invalid-style',
    ]);
    expect(kinds('<p style="text-align:center;">a</p>', 'accepted')).toEqual(
      [],
    );
    expect(kinds('<p style="">a</p>')).toEqual(['invalid-style']);
    expect(
      kinds('<p style="text-align: center; color: red">a</p>', 'accepted'),
    ).toEqual(['invalid-style']);
    const span = '<span data-rt-color="red" style="color: #000000">a</span>';
    expect(kinds(span)).toEqual(['invalid-style']);
    expect(kinds(span, 'accepted')).toEqual([]);
  });

  it('atributos', () => {
    const v = validateHtml('<ol start="007"><li>a</li></ol>', s);
    expect(v).toMatchObject([
      { kind: 'non-canonical-attribute', name: 'start', value: '007' },
    ]);
    expect(kinds('<ol start="007"><li>a</li></ol>', 'accepted')).toEqual([]);
    expect(kinds('<ol start="0"><li>a</li></ol>')).toEqual([
      'invalid-attribute',
    ]);
    expect(
      kinds(
        '<a href="https://a.com/" target="_blank" rel="noreferrer noopener">a</a>',
      ),
    ).toEqual(['non-canonical-attribute']);
  });

  it('desconhecidos e nomes do protótipo', () => {
    expect(kinds('<div></div>')).toEqual(['unknown-element']);
    expect(kinds('<constructor></constructor>')).toEqual(['unknown-element']);
    expect(kinds('<tostring></tostring>')).toEqual(['unknown-element']);
    expect(kinds('<hasownproperty></hasownproperty>')).toEqual([
      'unknown-element',
    ]);
    // `<__proto__>` não é tag em HTML (nome começa com `_`): o parser o trata como texto.
    expect(kinds('<__proto__>')).not.toContain('unknown-element');
    expect(kinds('<p __proto__="x">a</p>')).toEqual(['unknown-attribute']);
    expect(kinds('<p data-x="1">a</p>')).toEqual(['unknown-attribute']);
    expect(kinds('<p constructor="x">a</p>')).toEqual(['unknown-attribute']);
    expect(kinds('<p class="x">a</p>')).toEqual(['invalid-class']);
    expect(
      kinds(
        '<aside class="rt-callout rt-desconhecida" role="note"><p class="rt-callout__title">T</p></aside>',
      ),
    ).toEqual(['invalid-class']);
  });

  it('obrigatórios, ensureTokens e requireChild', () => {
    const a = validateHtml('<a href="https://a.com/" target="_blank">a</a>', s);
    expect(a).toMatchObject([{ kind: 'missing-ensured-token', name: 'rel' }]);
    const img = validateHtml(
      '<img src="https://a.com/x.png" loading="lazy" decoding="async">',
      s,
    );
    expect(img).toMatchObject([
      { kind: 'missing-required-attribute', name: 'alt' },
    ]);
    const fig = validateHtml(
      '<figure class="rt-figure rt-figure--center"></figure>',
      s,
    );
    expect(fig.map((x) => x.kind)).toEqual(['missing-required-child']);
  });

  it('iframe sem sandbox', () => {
    const v = validateHtml(
      '<iframe src="https://www.youtube-nocookie.com/embed/abc" title="t" loading="lazy" allowfullscreen=""></iframe>',
      s,
    );
    expect(
      v.some(
        (x) => x.kind === 'missing-required-attribute' && x.name === 'sandbox',
      ),
    ).toBe(true);
  });

  it('nós inesperados', () => {
    expect(kinds('<!--x--><p>a</p>')).toEqual(['unexpected-node']);
    expect(kinds('<!doctype html><p>a</p>')).toEqual(['unexpected-node']);
    const k = kinds('<script>x</script>');
    expect(k).toContain('unknown-element');
    expect(k).toContain('unexpected-node');
  });

  it('profundidade', () => {
    const v = validateHtml('<blockquote>'.repeat(300), s);
    expect(v.filter((x) => x.kind === 'max-depth')).toHaveLength(1);
    expect(() => validateHtml('<p>a</p>', s, { maxDepth: 0 })).toThrow(
      RangeError,
    );
  });

  it('path', () => {
    const v = validateHtml(
      '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">T</p><p class="x">a</p></aside>',
      s,
    );
    expect(v).toMatchObject([{ kind: 'invalid-class', path: 'aside[0]>p[1]' }]);
  });

  describe('rodada de correção 1', () => {
    it('styleFrom sem style: invalid-style só no canonical', () => {
      const h = '<span data-rt-color="red">a</span>';
      expect(kinds(h)).toEqual(['invalid-style']);
      expect(kinds(h, 'accepted')).toEqual([]);
    });

    it('ensureTokens usa valores normalizados', () => {
      const a = '<a href="https://a.com/" target="_BLANK">a</a>';
      expect(kinds(a, 'accepted')).toEqual(['missing-ensured-token']);
      const b =
        '<a href="https://a.com/" target="_blank" rel="NOOPENER NOREFERRER">a</a>';
      expect(kinds(b, 'accepted')).toEqual([]);
      expect(kinds(b)).toEqual(['non-canonical-attribute']);
    });

    it('class fora da forma canônica', () => {
      const f = (c: string) =>
        `<figure class="${c}"><img src="https://a.com/x.png" alt="a" loading="lazy" decoding="async"></figure>`;
      expect(kinds(f('rt-figure rt-figure--left'))).toEqual([]);
      expect(kinds(f('rt-figure rt-figure--left rt-figure--left'))).toEqual([
        'invalid-class',
      ]);
      expect(kinds(f('rt-figure  rt-figure--left'))).toEqual(['invalid-class']);
      expect(kinds(f('rt-figure rt-figure--left'), 'accepted')).toEqual([]);
      expect(kinds('<p class="">a</p>')).toEqual(['invalid-class']);
    });

    it('tokens só aparam espaço ASCII, como o serializeTokens', () => {
      // NBSP não é espaço do HTML: "ugc\u00a0" é outro token, que o
      // serializeTokens descarta; o oráculo não pode aceitá-lo.
      const rel = s.elements['a']?.attributes['rel']?.rule;
      if (!rel) throw new Error('sem rel no a');
      expect(normalizeAttribute(rel, 'nofollow ugc\u00a0')).toBe('nofollow');
      const a = '<a href="https://a.com/" rel="nofollow ugc\u00a0">a</a>';
      expect(kinds(a, 'accepted')).toEqual(['invalid-attribute']);
      expect(kinds(a)).toEqual(['invalid-attribute']);

      // Separador ";": mesmo tratamento (esquema de teste com `allow` em tokens).
      const allowRule: RteAttrRule = {
        kind: 'tokens',
        values: ['encrypted-media', 'fullscreen', 'picture-in-picture'],
        separator: '; ',
        maxLength: 200,
      };
      const schema: RteHtmlSchema = {
        ...s,
        elements: {
          ...s.elements,
          span: { attributes: { allow: { rule: allowRule } } },
        },
      };
      const allow = (value: string) =>
        validateHtml(`<span allow="${value}">a</span>`, schema, {
          mode: 'accepted',
        }).map((v) => v.kind);
      expect(normalizeAttribute(allowRule, 'fullscreen\u00a0')).toBeNull();
      expect(allow('fullscreen\u00a0')).toEqual(['invalid-attribute']);
      expect(
        normalizeAttribute(allowRule, 'encrypted-media; fullscreen\u00a0'),
      ).toBe('encrypted-media');
      expect(allow('encrypted-media; fullscreen\u00a0')).toEqual([
        'invalid-attribute',
      ]);
      expect(allow(' fullscreen ;encrypted-media')).toEqual([]);
    });

    it('token desconhecido em tokens nunca é descartado', () => {
      const h =
        '<a href="https://a.com/" target="_blank" rel="noopener noreferrer evil">a</a>';
      expect(kinds(h)).toEqual(['invalid-attribute']);
      expect(kinds(h, 'accepted')).toEqual(['invalid-attribute']);
    });
  });
});
