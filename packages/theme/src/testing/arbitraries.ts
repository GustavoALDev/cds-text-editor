import fc from 'fast-check';
import { toLinear } from '../color/convert';
import { WHITE_Y } from '../derive';

/**
 * Geradores de sementes e limites compartilhados pelos testes de propriedade do tema: o Vitest
 * (`src/property.spec.ts`) e o Playwright (`e2e/theme/property.spec.ts`, nos 3 motores) usam os
 * mesmos geradores. Fica fora do build (`tsconfig.lib.json` exclui `src/testing`).
 */

export const channel = fc.integer({ min: 0, max: 255 });
export const hex2 = (v: number): string => v.toString(16).padStart(2, '0');

export const hexColor = fc
  .tuple(channel, channel, channel)
  .map(([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`);
export const upperHex = hexColor.map((s) => s.toUpperCase());
export const gray = channel.map((v) => `#${hex2(v)}${hex2(v)}${hex2(v)}`);
export const rgbFn = fc
  .tuple(channel, channel, channel)
  .map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`);
export const hslFn = fc
  .tuple(
    fc.integer({ min: 0, max: 360 }),
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 0, max: 100 }),
  )
  .map(([h, s, l]) => `hsl(${h} ${s}% ${l}%)`);
export const oklchFn = (l: fc.Arbitrary<number>): fc.Arbitrary<string> =>
  fc
    .tuple(
      l,
      fc.double({ min: 0, max: 0.4, noNaN: true }),
      fc.double({ min: 0, max: 360, noNaN: true }),
    )
    .map(([L, C, h]) => `oklch(${L} ${C} ${h})`);
export const oklchAny = oklchFn(fc.double({ min: 0, max: 1, noNaN: true }));
export const oklchExtremeL = oklchFn(
  fc.oneof(
    fc.double({ min: 0, max: 0.02, noNaN: true }),
    fc.double({ min: 0.98, max: 1, noNaN: true }),
  ),
);

/**
 * Cores de 8 bits com luminância WCAG (srgb-linear) perto do limiar do on-*: um único passe
 * sobre as 2^24 cores (~0.3 s) em vez de `fc.pre`. `near` = |Y - WHITE_Y| < 0.002; `razor` = < 2e-6
 * (as poucas cores a ~1e-7 do limiar, onde nasceram dois defeitos reais).
 */
const lin8 = Array.from(
  { length: 256 },
  (_, v) => toLinear([v / 255, 0, 0])[0],
);
const near: string[] = [];
const razor: string[] = [];
for (let r = 0; r < 256; r++) {
  for (let g = 0; g < 256; g++) {
    for (let b = 0; b < 256; b++) {
      const d = Math.abs(
        0.2126 * (lin8[r] as number) +
          0.7152 * (lin8[g] as number) +
          0.0722 * (lin8[b] as number) -
          WHITE_Y,
      );
      if (d < 0.002) {
        const c = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
        near.push(c);
        if (d < 2e-6) razor.push(c);
      }
    }
  }
}
// (`constantFrom(...array)` estoura a pilha com centenas de milhares de itens: indexa por inteiro.)
const pick = (pool: string[]): fc.Arbitrary<string> =>
  fc.integer({ min: 0, max: pool.length - 1 }).map((i) => pool[i] as string);
export const nearThreshold = pick(near);
export const razorThreshold = pick(razor);

export const anySeed = fc.oneof(
  { weight: 3, arbitrary: hexColor },
  { weight: 1, arbitrary: upperHex },
  { weight: 1, arbitrary: rgbFn },
  { weight: 1, arbitrary: hslFn },
  { weight: 3, arbitrary: oklchAny },
  { weight: 2, arbitrary: oklchExtremeL },
  { weight: 1, arbitrary: gray },
  { weight: 3, arbitrary: nearThreshold },
  { weight: 1, arbitrary: razorThreshold },
);

export const garbage = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 400 }),
  fc.string({ unit: 'grapheme', maxLength: 400 }),
  fc.string({ unit: 'binary', minLength: 300, maxLength: 400 }),
  fc.constantFrom(
    '',
    ' ',
    '#',
    '#12',
    '#12345',
    'rgb(',
    'rgb()',
    'rgb(1,2',
    'rgba(0 0 0 / 0)',
    'hsl(1e999 1 1)',
    'oklch(1e308 1e308 1e308)',
    'oklch(NaN 0 0)',
    'rgb(Infinity 0 0)',
    'rgb(-1e309, 5, 5)',
    'red',
    'transparent',
    'ＲＧＢ(1 2 3)',
    'rgb(' + '9'.repeat(390) + ' 0 0)',
  ),
  fc
    .tuple(
      fc.constantFrom('rgb', 'rgba', 'hsl', 'hsla', 'oklch'),
      fc.double(),
      fc.double(),
      fc.double(),
    )
    .map(([fn, a, b, c]) => `${fn}(${a} ${b} ${c})`),
  fc
    .tuple(
      fc.constantFrom('rgb(', 'hsl(', 'oklch(', '#'),
      fc.string({ maxLength: 40 }),
    )
    .map(([p, s]) => p + s),
);

export const mode = fc.constantFrom('light', 'dark') as fc.Arbitrary<
  'light' | 'dark'
>;
export const neutral = fc.constantFrom('tinted', 'gray') as fc.Arbitrary<
  'tinted' | 'gray'
>;

/**
 * Cadeias da gramática pura (#hex, rgb/rgba, hsl/hsla, oklch) com uma mutação estrutural que
 * quase sempre as invalida (separador trocado, parêntese/dígito removido, sufixo estranho).
 * Para a propriedade `parseColor(x) !== null` se e somente se `CSS.supports('color', x)`.
 */
export const mutatedColor: fc.Arbitrary<string> = fc
  .tuple(
    fc.oneof(hexColor, rgbFn, hslFn, oklchAny),
    fc.nat({ max: 1000 }),
    fc.constantFrom(
      'drop',
      'dup-comma',
      'swap-sep',
      'junk-unit',
      'extra-arg',
      'trail-dot',
      'upper',
      'space-fn',
    ),
  )
  .map(([s, n, kind]) => {
    const i = n % s.length;
    switch (kind) {
      case 'drop':
        return s.slice(0, i) + s.slice(i + 1);
      case 'dup-comma':
        return s.replace(/[ ]/, ', ,');
      case 'swap-sep':
        return s.includes(',') ? s.replace(', ', ' ') : s.replace(' ', ', ');
      case 'junk-unit':
        return s.replace(/(\d)([ )])/, '$1deg$2');
      case 'extra-arg':
        return s.replace(/\)$/, ' 0.5)');
      case 'trail-dot':
        return s.replace(/(\d)([ )])/, '$1.$2');
      case 'upper':
        return s.toUpperCase();
      default:
        return s.replace('(', ' (');
    }
  });

/**
 * Sementes dentro do gamut sRGB (sem oklch fora do gamut, onde o CSS nativo e o plano B mapeiam
 * por caminhos diferentes de propósito): base da propriedade "nativo ≈ plano B" no navegador.
 */
export const srgbSeed = fc.oneof(
  { weight: 3, arbitrary: hexColor },
  { weight: 1, arbitrary: upperHex },
  { weight: 1, arbitrary: rgbFn },
  { weight: 1, arbitrary: hslFn },
  { weight: 1, arbitrary: gray },
  { weight: 3, arbitrary: nearThreshold },
  { weight: 1, arbitrary: razorThreshold },
);
