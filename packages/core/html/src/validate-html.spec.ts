import { describe, expect, it } from 'vitest';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
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
    expect(kinds('<p __proto__="x">a</p>')).not.toContain('invalid-attribute');
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
});
