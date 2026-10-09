import { describe, expect, expectTypeOf, it } from 'vitest';
import type { RteHeadingLevel } from '../../src/headings';
import {
  extractToc,
  type RteExtractTocOptions,
  type RteTocEntry,
} from './extract-toc';

const HTML =
  '<h2 id="rt-a">A</h2><h3 id="rt-b">B <em>x</em></h3><h4 id="rt-c">C</h4><h2>sem id</h2><h2 id="evil">E</h2>';

describe('extractToc', () => {
  it('usa níveis 2 e 3 e ignora ids inválidos ou ausentes', () => {
    expect(extractToc(HTML)).toEqual([
      { id: 'rt-a', text: 'A', level: 2 },
      { id: 'rt-b', text: 'B x', level: 3 },
    ]);
  });

  it('levels aceita readonly RteHeadingLevel[] (as const) e o nível sai tipado', () => {
    const levels = [2, 3] as const;
    const readonlyLevels: readonly RteHeadingLevel[] = [2, 3, 4];
    expect(extractToc(HTML, { levels })).toHaveLength(2);
    expect(extractToc(HTML, { levels: readonlyLevels })).toHaveLength(3);
    expectTypeOf<RteExtractTocOptions['levels']>().toEqualTypeOf<
      readonly RteHeadingLevel[] | undefined
    >();
    expectTypeOf<RteTocEntry['level']>().toEqualTypeOf<RteHeadingLevel>();
    expectTypeOf<RteHeadingLevel>().toEqualTypeOf<2 | 3 | 4>();
  });

  it('níveis fora de 2–4 são ignorados (o tipo promete RteHeadingLevel)', () => {
    const html = '<h1 id="rt-u">U</h1><h2 id="rt-a">A</h2><h5 id="rt-e">E</h5>';
    expect(
      extractToc(html, { levels: [1, 2, 5] as unknown as RteHeadingLevel[] }),
    ).toEqual([{ id: 'rt-a', text: 'A', level: 2 }]);
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

  it('devolve texto decodificado (deve ser escapado pelo chamador)', () => {
    expect(
      extractToc('<h2 id="rt-x">&lt;img src=x onerror=1&gt;</h2>'),
    ).toEqual([{ id: 'rt-x', text: '<img src=x onerror=1>', level: 2 }]);
  });

  it('limita aninhamento profundo e valida maxDepth', () => {
    const t0 = performance.now();
    expect(
      extractToc('<div>'.repeat(200_000) + '<h2 id="rt-a">x</h2>'),
    ).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(
      extractToc('<div><h2 id="rt-a">x</h2>', { maxDepth: 2 }),
    ).toHaveLength(1);
    expect(extractToc('<div><h2 id="rt-a">x</h2>', { maxDepth: 1 })).toEqual(
      [],
    );
    expect(() => extractToc('', { maxDepth: 0 })).toThrow(RangeError);
  });
});
