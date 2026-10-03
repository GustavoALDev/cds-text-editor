import { describe, expect, it } from 'vitest';
import { extractToc } from './extract-toc';

const HTML =
  '<h2 id="rt-a">A</h2><h3 id="rt-b">B <em>x</em></h3><h4 id="rt-c">C</h4><h2>sem id</h2><h2 id="evil">E</h2>';

describe('extractToc', () => {
  it('usa níveis 2 e 3 e ignora ids inválidos ou ausentes', () => {
    expect(extractToc(HTML)).toEqual([
      { id: 'rt-a', text: 'A', level: 2 },
      { id: 'rt-b', text: 'B x', level: 3 },
    ]);
  });

  it('levels inclui h4', () => {
    expect(extractToc(HTML, { levels: [2, 3, 4] })).toHaveLength(3);
  });

  it('respeita idPrefix', () => {
    expect(
      extractToc('<h2 id="x-a">A</h2><h2 id="rt-a">B</h2>', { idPrefix: 'x-' }),
    ).toEqual([{ id: 'x-a', text: 'A', level: 2 }]);
  });

  it('idPrefix inválido lança', () => {
    expect(() => extractToc(HTML, { idPrefix: 'A!' })).toThrow(RangeError);
  });

  it('HTML malformado não lança', () => {
    expect(extractToc('<h2 id="rt-a">a<h2 id="rt-b">b')).toEqual([
      { id: 'rt-a', text: 'a', level: 2 },
      { id: 'rt-b', text: 'b', level: 2 },
    ]);
    expect(() =>
      extractToc('<!--x--><h2 id="rt-a"><script>q</script>t'),
    ).not.toThrow();
  });

  it('ignora script dentro do título', () => {
    expect(extractToc('<h2 id="rt-a">a<script>q</script>b</h2>')[0]?.text).toBe(
      'ab',
    );
  });
});
