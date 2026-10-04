import { getHtmlSchema } from '@cds/rte-core';
import { describe, expect, it } from 'vitest';
import { sanitizeWithSchema } from './engine';
import { DISCARD_CONTENT_TAGS } from './parser-model';
import { sanitizeTree } from './sanitize-tree';
import type { HtmlNode } from './tree';

const schema = getHtmlSchema();
const sanitize = (html: string): string =>
  sanitizeWithSchema(html, schema, 256);

/** Confere a saída e a idempotência (R3) de cada caso deste arquivo. */
function check(input: string, expected: string): void {
  const out = sanitize(input);
  expect(out).toBe(expected);
  expect(sanitize(out)).toBe(out);
}

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
  ])('%s → %s', check);

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
    check(`<${t}><p>x</p></${t}>y`, 'y');
  });

  it('embed some', () => {
    check('<embed src=x>y', 'y');
  });

  it('plaintext descarta todo o resto', () => {
    check('a<plaintext><p>x</p>', 'a');
  });

  it('svg some com o conteúdo', () => {
    check('<svg><p>x</p></svg>y', 'y');
  });

  it('iframe sai sempre vazio', () => {
    check(
      `<iframe src="${YOUTUBE}" title="T"><p>x</p>&lt;script&gt;</iframe>`,
      `<iframe src="${YOUTUBE}" title="T"${IFRAME_FIXED}></iframe>`,
    );
  });
});

describe('atributos (S5)', () => {
  it.each([
    ['<a href="javascript:x">t</a>', 't'],
    ['<img src=x onerror=alert(1)>', ''],
    ['<p onclick=x id=y title=z>a</p>', '<p>a</p>'],
    ['<p __proto__="x" class="a">a</p>', '<p>a</p>'],
  ])('%s → %s', check);
});

describe('S3c: normalizações para a releitura do navegador (I1)', () => {
  describe('tabela (N5 e N7)', () => {
    it.each([
      [
        '<table><tr><td>a</td></tr>x<p>y</p></table>',
        '<table><tbody><tr><td>a</td></tr></tbody></table>',
      ],
      [
        '<table><thead><tr><th>h</th></tr></thead><tr><td>1</td></tr><tr><td>2</td></tr></table>',
        '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>',
      ],
      [
        '<table> <tbody> <tr> <td>a</td> </tr> </tbody> </table>',
        '<table><tbody><tr><td>a</td></tr></tbody></table>',
      ],
      [
        '<table><col><colgroup><col></colgroup></table>',
        '<table><colgroup><col></colgroup></table>',
      ],
      [
        '<table><div><tr><td>a</td></tr></div></table>',
        '<table><tbody><tr><td>a</td></tr></tbody></table>',
      ],
      [
        '<table><tr><td>1</td></tr><caption>c</caption><tr><td>2</td></tr></table>',
        '<table><tbody><tr><td>1</td></tr></tbody><caption>c</caption><tbody><tr><td>2</td></tr></tbody></table>',
      ],
    ])('%s → %s', check);
  });

  describe('partes fora do pai exigido (N3)', () => {
    it.each([
      ['<p><td>x</td></p>', '<p>x</p>'],
      ['<tr><td>a</td></tr>', 'a'],
      ['<caption>c</caption>', 'c'],
      ['<ul><span><li>a</li></span></ul>', '<ul><span>a</span></ul>'],
      ['<li>a</li>', 'a'],
    ])('%s → %s', check);
  });

  it('a dentro de a é desembrulhado (N1)', () => {
    check(
      '<a href="https://a.com/">1<span><a href="https://b.com/">2</a></span></a>',
      '<a href="https://a.com/">1<span>2</span></a>',
    );
  });

  describe('bloco dentro de p (N2)', () => {
    it.each([
      ['<p><span><ul><li>x</li></ul></span></p>', '<p><span>x</span></p>'],
      ['<p><font><table><tr><td>x</td></tr></table></font></p>', '<p>x</p>'],
      ['<p><b><h2>t</h2></b></p>', '<p>t</p>'],
    ])('%s → %s', check);
  });

  it('título dentro de título (N4)', () => {
    check('<h2><b><h3>x</h3></b></h2>', '<h2>x</h2>');
  });

  describe('quebras no início do pre (N6)', () => {
    it.each([
      ['<pre>\n\nx</pre>', '<pre>x</pre>'],
      ['<pre><x></x>\r\nx</pre>', '<pre>x</pre>'],
      ['<pre>\n</pre>', '<pre></pre>'],
      ['<pre><code>\nx</code></pre>', '<pre><code>\nx</code></pre>'],
    ])('%j → %j', check);
  });
});

describe('S6: requireChild em cascata', () => {
  it('figure cujo img perdeu o src some com a legenda', () => {
    check(
      '<figure class="rt-figure"><img src="x"><figcaption>c</figcaption></figure>',
      '',
    );
  });

  it('pullquote com blockquote fica', () => {
    const html =
      '<figure class="rt-pullquote"><blockquote><p>q</p></blockquote></figure>';
    check(html, html);
  });

  it('embed com iframe de provedor desconhecido some', () => {
    check(
      '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube">' +
        '<iframe src="https://evil.example/embed/x" title="T"></iframe>' +
        '<figcaption>c</figcaption></figure>',
      '',
    );
  });
});

describe('S7: id repetido', () => {
  it.each([
    [
      '<h2 id="rt-a">a</h2><h3 id="rt-a">b</h3>',
      '<h2 id="rt-a">a</h2><h3>b</h3>',
    ],
    [
      '<figure><h2 id="rt-a">a</h2></figure><h2 id="rt-a">b</h2>',
      '<h2 id="rt-a">b</h2>',
    ],
  ])('%s → %s', check);
});
