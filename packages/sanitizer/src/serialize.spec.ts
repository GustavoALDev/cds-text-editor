import { getHtmlSchema } from '@comodeviaser/rte-core';
import { describe, expect, it } from 'vitest';
import { sanitizeWithSchema } from './engine';
import { serializeNodes } from './serialize';
import { readFixture } from './testing/fixtures';

const schema = getHtmlSchema();
const sanitize = (html: string): string =>
  sanitizeWithSchema(html, schema, 256);

describe('serialização (S13)', () => {
  it('escapa & NBSP < > no texto e deixa aspas literais', () => {
    expect(sanitize('<p>a &amp; b &lt; c &gt; d "e" \u00a0f</p>')).toBe(
      '<p>a &amp; b &lt; c &gt; d "e" &nbsp;f</p>',
    );
  });

  it('CR/CRLF viram LF e NUL vira U+FFFD', () => {
    expect(sanitize('<p>a\r\nb\rc\u0000d</p>')).toBe('<p>a\nb\nc\ufffdd</p>');
  });

  it('escapa & NBSP " < > nos atributos, sempre entre aspas duplas', () => {
    expect(
      sanitize(`<img src="https://example.com/a.jpg" alt='x"<>&\u00a0'>`),
    ).toBe(
      '<img src="https://example.com/a.jpg" alt="x&quot;&lt;&gt;&amp;&nbsp;">',
    );
  });

  it('booleanos saem como nome=""', () => {
    expect(sanitize('<input type=checkbox disabled checked>')).toBe(
      '<input type="checkbox" disabled="" checked="">',
    );
  });

  it('void sai sem fechamento e </br> vira <br>', () => {
    expect(sanitize('<p>a<br>b</br></p>')).toBe('<p>a<br>b<br></p>');
  });

  it('comentário, doctype, PI e CDATA nunca saem', () => {
    expect(
      sanitize('<!doctype html><!--c--><?xml x?><![CDATA[x]]><p>a</p>'),
    ).toBe('<p>a</p>');
  });

  it('não reconhece autofechamento em HTML', () => {
    expect(sanitize('<p/>x')).toBe('<p>x</p>');
  });

  it('tags e nomes de atributo em minúsculas', () => {
    expect(sanitize('<P CLASS="x">a</P>')).toBe('<p>a</p>');
  });

  it('o fixture all-features.html é ponto fixo', () => {
    const html = readFixture('all-features.html');
    expect(sanitize(html)).toBe(html);
  });

  it('serializa árvore profunda sem recursão nativa', () => {
    let tree: import('./tree').HtmlNode = 'x';
    for (let i = 0; i < 50_000; i++) {
      tree = { tag: 'strong', attributes: [], children: [tree] };
    }
    const out = serializeNodes([tree]);
    expect(out).toBe(
      '<strong>'.repeat(50_000) + 'x' + '</strong>'.repeat(50_000),
    );
  });
});
