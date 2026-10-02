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

  // Formas que o CSS rejeita (CSS.supports('color', s) === false em Chromium, Firefox e WebKit;
  // ver e2e/theme/behavior-parse-align.spec.ts): o caminho puro também precisa rejeitar.
  it.each([
    'rgb(255 0 0 0.5)', // alfa sem "/" na sintaxe moderna
    'rgb(1,,2,3)', // vírgula vazia
    'rgb(1,2,3,)', // vírgula sobrando
    'rgb(,1,2,3)',
    'rgb(1, 2 3)', // vírgulas misturadas com espaços
    'rgb(1 2, 3)',
    'rgb(255, 0, 0 / 0.5)', // "/" na sintaxe com vírgulas
    'rgb(255 0 0 / 0.5deg)', // deg no alfa
    'rgb(255, 0, 0, 0.5deg)',
    'rgb(255, 50%, 0)', // sintaxe com vírgulas mistura número e porcentagem
    'rgb(5. 0 0)', // número CSS não termina em "."
    'rgb(1 2 3 / )',
    'rgb(/ 1 2 3)',
    'hsl(120, 100, 25)', // com vírgulas, S e L precisam de %
    'hsl(120, 100%, 25)',
    'hsl(120 100% 25% 0.5)',
    'oklch(0.7, 0.15, 150)', // oklch() não tem sintaxe com vírgulas
    'oklch(0.7 0.15 150 0.5)',
  ])('rejects %j like CSS does', (value) => {
    expect(parseColor(value)).toBeNull();
  });

  it.each([
    ['rgb(255, 0, 0, 50%)', '#ff0000'],
    ['rgba(100%, 0%, 0%, 50%)', '#ff0000'],
    ['rgb(255 0 0/0.5)', '#ff0000'],
    ['rgb(255 0 0 /0.5)', '#ff0000'],
    ['rgb(255 50% 0)', '#ff8000'],
    ['rgb(1e2 0 0)', '#640000'],
    ['rgb(1e+2 0 0)', '#640000'],
    ['rgb(.5 0 0)', '#010000'],
    ['rgb(+5 0 0)', '#050000'],
    ['rgba(255 0 0)', '#ff0000'],
    ['hsl(240deg, 100%, 50%)', '#0000ff'],
    ['hsl(120 100 25)', '#008000'],
    ['hsl(120 100% 25% / 50%)', '#008000'],
    ['oklch(0.7 0.15 150 / 50%)', null],
  ])('keeps accepting the valid CSS form %j', (value, expected) => {
    if (expected) expect(hex(value)).toBe(expected);
    else expect(parseColor(value)).not.toBeNull();
  });

  it('treats alpha exactly 0 as invalid and keeps ignoring partial alpha', () => {
    expect(parseColor('rgba(10,20,30,0)')).toBeNull();
    expect(parseColor('rgb(10 20 30 / 0%)')).toBeNull();
    expect(parseColor('hsla(120, 100%, 25%, 0)')).toBeNull();
    expect(parseColor('oklch(0.7 0.2 150 / 0)')).toBeNull();
    expect(parseColor('#00000000')).toBeNull();
    expect(parseColor('#0000')).toBeNull();
    expect(hex('rgba(10,20,30,0.5)')).toBe('#0a141e');
    expect(hex('#000000ff')).toBe('#000000');
  });

  it('is linear on pathological input and caps the input length', () => {
    const start = performance.now();
    expect(parseColor('1'.repeat(1e5) + 'x')).toBeNull();
    expect(parseColor('rgb(' + '1'.repeat(1e5) + 'x)')).toBeNull();
    expect(performance.now() - start).toBeLessThan(200);
    expect(hex('rgb(' + ' '.repeat(150) + '133 20 245)')).toBe('#8514f5');
    expect(parseColor('rgb(' + ' '.repeat(300) + '133 20 245)')).toBeNull();
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
type Known = Record<
  string,
  [number, number, number] | [number, number, number, number]
>;

function fakeDocument(known: Known) {
  const created = vi.fn();
  const hexOf = (c: number[]): string =>
    '#' +
    c
      .slice(0, 3)
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  const doc = {
    createElement: (tag: string) => {
      created(tag);
      let entry: number[] = [0, 0, 0, 255];
      let painted: number[] = [0, 0, 0, 0];
      const ctx = {
        get fillStyle() {
          return hexOf(entry);
        },
        set fillStyle(value: string) {
          const found = value in known ? known[value] : undefined;
          if (found)
            entry = [...found, 255].slice(0, found.length === 4 ? 4 : 4);
          else if (/^#[0-9a-f]{3}$/.test(value)) {
            const [, r = '0', g = '0', b = '0'] = value;
            entry = [
              parseInt(r + r, 16),
              parseInt(g + g, 16),
              parseInt(b + b, 16),
              255,
            ];
          }
        },
        clearRect: () => {
          painted = [0, 0, 0, 0];
        },
        fillRect: () => {
          painted = entry;
        },
        getImageData: () => ({ data: painted }),
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

  it('treats transparent canvas colors as invalid (seeds must be opaque)', () => {
    const { doc } = fakeDocument({
      transparent: [0, 0, 0, 0],
      ghost: [10, 20, 30, 0],
      half: [10, 20, 30, 128],
      red: [255, 0, 0, 255],
    });
    vi.stubGlobal('document', doc);
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('ghost')).toBeNull();
    expect(parseColor('half')).toBeNull();
    expect(hex('red')).toBe('#ff0000');
  });

  it('caches the negative result when the context is unavailable', () => {
    const createElement = vi.fn(() => ({ getContext: () => null }));
    vi.stubGlobal('document', { createElement });
    expect(parseColor('red')).toBeNull();
    expect(parseColor('red')).toBeNull();
    expect(createElement).toHaveBeenCalledTimes(1);
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
