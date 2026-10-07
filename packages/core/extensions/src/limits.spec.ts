import { describe, expect, it } from 'vitest';
import { truncateText } from './limits';

const EMOJI = '😀'; // par substituto (2 unidades UTF-16)

describe('truncateText', () => {
  it('não deixa substituto alto solto quando o par cruza o limite (1000)', () => {
    expect(truncateText('a'.repeat(999) + EMOJI, 1000)).toBe('a'.repeat(999));
  });

  it.each([300, 100])(
    'não parte o par no limite %i (title do iframe, label do track)',
    (max) => {
      const out = truncateText('a'.repeat(max - 1) + EMOJI + 'b', max);
      expect(out).toBe('a'.repeat(max - 1));
      expect(/[\uD800-\uDBFF]$/.test(out)).toBe(false);
    },
  );

  it('mantém o par inteiro quando ele cabe', () => {
    expect(truncateText('a'.repeat(998) + EMOJI + 'b', 1000)).toBe(
      'a'.repeat(998) + EMOJI,
    );
  });

  it('corta em unidades UTF-16', () => {
    expect(truncateText('abc', 2)).toBe('ab');
  });

  it('abaixo ou no limite devolve igual', () => {
    expect(truncateText('abc', 3)).toBe('abc');
    expect(truncateText('abc', 10)).toBe('abc');
    expect(truncateText('', 0)).toBe('');
  });
});
