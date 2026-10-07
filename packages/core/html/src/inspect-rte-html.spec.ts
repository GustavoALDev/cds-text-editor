// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inspectRteHtml } from './inspect-rte-html';

describe('inspectRteHtml', () => {
  it('lista os href de qualquer profundidade, na ordem, e ignora href ausente', () => {
    const r = inspectRteHtml(
      '<p><a href="https://a.com/">a</a> <a name="x">b</a></p><ul><li><p><strong><a href="mailto:a@b.com">c</a></strong></p></li></ul><a href="">d</a>',
    );
    expect(r.hrefs).toEqual(['https://a.com/', 'mailto:a@b.com', '']);
  });

  it('decodifica entidades no href', () => {
    expect(
      inspectRteHtml('<a href="https://a.com/?a=1&amp;b=2">x</a>').hrefs,
    ).toEqual(['https://a.com/?a=1&b=2']);
  });

  it('conta h2 a h4 vazios, com espaços, nbsp e br', () => {
    const r = inspectRteHtml(
      '<h2></h2><h3> </h3><h4><br></h4><h2>&nbsp;</h2><h3>ok</h3><h4><em> </em></h4><h1></h1><h5></h5>',
    );
    expect(r.emptyHeadings).toBe(5);
  });

  it('título com texto aninhado não é vazio', () => {
    expect(inspectRteHtml('<h2><strong>a</strong></h2>').emptyHeadings).toBe(0);
  });

  it('vazio, sem links e HTML malformado não lançam', () => {
    expect(inspectRteHtml('')).toEqual({ hrefs: [], emptyHeadings: 0, truncated: false });
    expect(inspectRteHtml('<h2><a href="x">').emptyHeadings).toBe(1);
    expect(inspectRteHtml('<h2><h3>a')).toEqual({
      hrefs: [],
      emptyHeadings: 1,
      truncated: false,
    });
  });

  it('marca truncated quando passa de 256 níveis (o resto não foi lido)', () => {
    const deep = (n: number) =>
      '<div>'.repeat(n) + '<a href="javascript:alert(1)">x</a>';
    const hostile = inspectRteHtml(deep(257));
    expect(hostile.truncated).toBe(true);
    expect(hostile.hrefs).toEqual([]);
    const ok = inspectRteHtml(deep(255));
    expect(ok.truncated).toBe(false);
    expect(ok.hrefs).toEqual(['javascript:alert(1)']);
  });
});
