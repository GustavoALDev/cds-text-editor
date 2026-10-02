import { afterEach, describe, expect, it, vi } from 'vitest';
import { toHex } from './convert';
import { parseColor } from './parse';

const hex = (input: string): string | null => {
  const rgb = parseColor(input);
  return rgb ? toHex(rgb) : null;
};

describe('parseColor (sem DOM)', () => {
  it('reads hex in 3 and 6 digits, any case', () => {
    expect(hex('#8514f5')).toBe('#8514f5');
    expect(hex('#ABC')).toBe('#aabbcc');
  });

  it('reads hex with alpha (4 and 8 digits) ignoring the alpha', () => {
    expect(hex('#abcd')).toBe('#aabbcc');
    expect(hex('#8514f580')).toBe('#8514f5');
  });

  it('reads rgb() with commas, spaces and percentages', () => {
    expect(hex('rgb(133, 20, 245)')).toBe('#8514f5');
    expect(hex('rgb(133 20 245)')).toBe('#8514f5');
    expect(hex('rgb(100% 0% 0%)')).toBe('#ff0000');
    expect(hex('rgba(133, 20, 245, 0.5)')).toBe('#8514f5');
  });

  it('reads rgb() with extra spaces, slash alpha, decimals and clips overflow', () => {
    expect(hex('  RGB(  133 ,20 ,  245 )  ')).toBe('#8514f5');
    expect(hex('rgb(133 20 245 / 50%)')).toBe('#8514f5');
    expect(hex('rgb(127.5 0 0)')).toBe('#800000');
    expect(hex('rgb(300 -5 0)')).toBe('#ff0000');
  });

  it('reads hsl()', () => {
    expect(hex('hsl(0 100% 50%)')).toBe('#ff0000');
    expect(hex('hsl(120, 100%, 25%)')).toBe('#008000');
  });

  it('reads hsl() edge cases (hue 360, negative, deg, alpha, plain numbers)', () => {
    expect(hex('hsl(360 100% 50%)')).toBe('#ff0000');
    expect(hex('hsl(-120 100% 50%)')).toBe('#0000ff');
    expect(hex('hsl(240deg 100% 50%)')).toBe('#0000ff');
    expect(hex('hsla(120, 100%, 25%, 0.3)')).toBe('#008000');
    expect(hex('hsl(0 0% 100%)')).toBe('#ffffff');
    expect(hex('hsl(0 150% 50%)')).toBe('#ff0000');
  });

  it('reads oklch() and clips out-of-gamut values', () => {
    expect(hex('oklch(1 0 0)')).toBe('#ffffff');
    expect(hex('oklch(0.7 0.4 150)')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('reads oklch() with percent lightness, deg and alpha', () => {
    expect(hex('oklch(70% 0.2 150)')).toBe(hex('oklch(0.7 0.2 150)'));
    expect(hex('oklch(0.7 0.2 150deg / 0.5)')).toBe(hex('oklch(0.7 0.2 150)'));
    expect(hex('OKLCH(0 0 0)')).toBe('#000000');
  });

  it.each([
    'banana',
    '',
    ' ',
    'var(--inexistente)',
    '12px',
    '#12',
    '#gggggg',
    'rgb(1,2)',
    'oklch(x y z)',
  ])('returns null for the invalid value %j without throwing', (value) => {
    expect(parseColor(value)).toBeNull();
  });

  it.each([
    'rgb(1e999 0 0)',
    'rgb(NaN 0 0)',
    'rgb(1 2 3 4 5)',
    'rgb(1 2 3',
    'rgb(1 2 x)',
    'hsl(1e999 50% 50%)',
    'hsl(10 20 30 x)',
    'oklch(1e999 0 0)',
    'oklch(0.5 1e999 0)',
    '#12345',
  ])('returns null for non-finite or malformed %j', (value) => {
    expect(parseColor(value)).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseColor(null as unknown as string)).toBeNull();
    expect(parseColor(undefined as unknown as string)).toBeNull();
    expect(parseColor(123 as unknown as string)).toBeNull();
    expect(parseColor({} as unknown as string)).toBeNull();
  });

  it('always returns three finite channels in [0, 1]', () => {
    for (const input of [
      'oklch(0.7 0.4 150)',
      'oklch(2 1 10)',
      'rgb(999 -9 5)',
      'hsl(500 900% 900%)',
    ]) {
      const rgb = parseColor(input);
      expect(rgb).not.toBeNull();
      for (const c of rgb ?? []) {
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not use the DOM when there is none (named colors are null in Node)', () => {
    expect(typeof document).toBe('undefined');
    expect(parseColor('rebeccapurple')).toBeNull();
  });
});

// Canvas falso: aceita só nomes conhecidos, como o navegador (valor inválido é ignorado).
function fakeDocument(known: Record<string, [number, number, number]>) {
  const created = vi.fn();
  const doc = {
    createElement: (tag: string) => {
      created(tag);
      let current = '#000000';
      let painted: [number, number, number] = [0, 0, 0];
      const ctx = {
        get fillStyle() {
          return current;
        },
        set fillStyle(value: string) {
          if (/^#[0-9a-f]{3}$/.test(value)) {
            const [, r = '0', g = '0', b = '0'] = value;
            current = `#${r}${r}${g}${g}${b}${b}`;
          } else if (value in known) {
            current =
              '#' +
              (known[value] ?? [])
                .map((v) => v.toString(16).padStart(2, '0'))
                .join('');
          }
        },
        clearRect: () => undefined,
        fillRect: () => {
          const entry = Object.values(known).find(
            (rgb) =>
              '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') ===
              current,
          );
          painted = entry ?? [0, 0, 0];
        },
        getImageData: () => ({ data: [...painted, 255] }),
      };
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
  return { doc, created };
}

describe('parseColor (canvas simulado)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves named colors via canvas and rejects invalid ones', () => {
    const { doc } = fakeDocument({
      rebeccapurple: [102, 51, 153],
      black: [0, 0, 0],
    });
    vi.stubGlobal('document', doc);
    expect(hex('rebeccapurple')).toBe('#663399');
    expect(hex('black')).toBe('#000000');
    expect(parseColor('banana')).toBeNull();
    expect(parseColor('var(--x)')).toBeNull();
  });

  it('creates the canvas lazily and caches it per document', () => {
    const first = fakeDocument({ red: [255, 0, 0] });
    vi.stubGlobal('document', first.doc);
    hex('red');
    hex('red');
    expect(first.created).toHaveBeenCalledTimes(1);
    const second = fakeDocument({ red: [255, 0, 0] });
    vi.stubGlobal('document', second.doc);
    hex('red');
    expect(second.created).toHaveBeenCalledTimes(1);
  });

  it('returns null when the canvas or its context is unavailable or throws', () => {
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => null }),
    });
    expect(parseColor('red')).toBeNull();
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('boom');
      },
    });
    expect(parseColor('red')).toBeNull();
  });
});
