import { describe, expect, it } from 'vitest';
import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('separa blocos por quebra de linha', () => {
    expect(htmlToText('<p>a</p><p>b</p>')).toBe('a\nb');
    expect(htmlToText('<ul><li>1</li><li>2</li></ul>')).toBe('1\n2');
  });

  it('br vira quebra de linha', () => {
    expect(htmlToText('<p>a<br>b</p>')).toBe('a\nb');
  });

  it('colapsa espaços em branco', () => {
    expect(htmlToText('<p>a  \n  b</p>')).toBe('a b');
  });

  it('descarta script, style e template', () => {
    expect(
      htmlToText('<script>x</script><style>y</style><template>z</template>t'),
    ).toBe('t');
  });

  it('decodifica entidades', () => {
    expect(htmlToText('&lt;b&gt; &amp;')).toBe('<b> &');
  });

  it.each(['<p>a<div>b', '<!--x-->c', '<h2>a<h2>b', '<![CDATA[x]]>y'])(
    'HTML malformado %s não lança nem contém "<"',
    (html) => {
      const out = htmlToText(html);
      expect(out).not.toContain('<');
    },
  );

  it('não vaza conteúdo de script malformado', () => {
    expect(htmlToText('<script>segredo<p>a')).not.toContain('segredo');
  });
});
