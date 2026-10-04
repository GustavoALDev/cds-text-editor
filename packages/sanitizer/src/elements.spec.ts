import { getHtmlSchema } from '@cds/rte-core';
import { describe, expect, it } from 'vitest';
import { sanitizeWithSchema } from './engine';
import { DISCARD_CONTENT_TAGS } from './parser-model';
import { sanitizeTree } from './sanitize-tree';
import type { HtmlNode } from './tree';

const schema = getHtmlSchema();
const sanitize = (html: string): string =>
  sanitizeWithSchema(html, schema, 256);

const YOUTUBE = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const IFRAME_FIXED =
  ' referrerpolicy="strict-origin-when-cross-origin"' +
  ' allow="encrypted-media; fullscreen; picture-in-picture"' +
  ' sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"';

describe('S3a: elemento fora do esquema é desembrulhado', () => {
  it.each([
    ['<div><p>a</p></div>', '<p>a</p>'],
    ['<h1>T</h1>', 'T'],
    ['<font color=red>x</font>', 'x'],
    ['a<wbr>b', 'ab'],
    ['<constructor>x</constructor>', 'x'],
    ['<__proto__>x', '&lt;__proto__&gt;x'],
  ])('%s → %s', (input, expected) => {
    expect(sanitize(input)).toBe(expected);
  });

  it('desembrulha árvore profunda sem recursão nativa', () => {
    let tree: HtmlNode = 'x';
    for (let i = 0; i < 50_000; i++) {
      tree = {
        tag: i % 2 ? 'div' : 'strong',
        attributes: [],
        children: [tree],
      };
    }
    const out = sanitizeTree([tree], schema);
    let depth = 0;
    let node: HtmlNode | undefined = out[0];
    while (typeof node === 'object') {
      expect(node.tag).toBe('strong');
      depth++;
      node = node.children[0];
    }
    expect(node).toBe('x');
    expect(depth).toBe(25_000);
  });
});

describe('S3b: conteúdo descartado inteiro', () => {
  const tags = [...DISCARD_CONTENT_TAGS].filter(
    (t) => t !== 'plaintext' && t !== 'embed',
  );

  it.each(tags)('<%s> some com o conteúdo', (t) => {
    expect(sanitize(`<${t}><p>x</p></${t}>y`)).toBe('y');
  });

  it('embed some', () => {
    expect(sanitize('<embed src=x>y')).toBe('y');
  });

  it('plaintext descarta todo o resto', () => {
    expect(sanitize('a<plaintext><p>x</p>')).toBe('a');
  });

  it('svg some com o conteúdo', () => {
    expect(sanitize('<svg><p>x</p></svg>y')).toBe('y');
  });

  it('iframe sai sempre vazio', () => {
    expect(
      sanitize(
        `<iframe src="${YOUTUBE}" title="T"><p>x</p>&lt;script&gt;</iframe>`,
      ),
    ).toBe(`<iframe src="${YOUTUBE}" title="T"${IFRAME_FIXED}></iframe>`);
  });
});

describe('atributos (S5)', () => {
  it.each([
    ['<a href="javascript:x">t</a>', 't'],
    ['<img src=x onerror=alert(1)>', ''],
    ['<p onclick=x id=y title=z>a</p>', '<p>a</p>'],
    ['<p __proto__="x" class="a">a</p>', '<p>a</p>'],
  ])('%s → %s', (input, expected) => {
    expect(sanitize(input)).toBe(expected);
  });
});
