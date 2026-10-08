import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { checkRteTheme } from './check-theme';
import { luminance, toLinear } from './color/convert';
import { linearToOklab, toOklch } from './color/oklab';
import { parseColor } from './color/parse';
import { createRteTheme } from './create-theme';
import { onLevel, WHITE_Y } from './derive';
import {
  anySeed as seed,
  garbage,
  hexColor,
  hslFn,
  mode,
  neutral,
  razorThreshold,
  rgbFn,
} from './testing/arbitraries';

/**
 * Testes de propriedade (fast-check). Semente fixa para reprodutibilidade em CI; para ampliar a
 * cobertura localmente: `FC_SEED=123 npx nx test theme` (a semente usada aparece na falha).
 * `FC_RUNS` sobrescreve o número de execuções (padrão: 5000 por propriedade).
 */
const SEED = Number(process.env['FC_SEED'] ?? 20261002);
const RUNS = Number(process.env['FC_RUNS'] ?? 5000);
vi.setConfig({ testTimeout: 120_000 }); // FC_RUNS alto em execuções locais
const opts = { numRuns: RUNS, seed: SEED, verbose: 1 } as const;
const hexOk = /^#[0-9a-f]{6}$/;
const FIELDS = ['primary', 'secondary', 'tertiary'] as const;

const EXPECTED_KEYS = [
  ...[
    'surface',
    'surface-raised',
    'text',
    'text-muted',
    'border',
    'focus',
    'danger',
    'warning',
    'success',
    'code-bg',
    'code-text',
    'code-comment',
    'code-keyword',
    'code-string',
    'code-number',
    'code-function',
  ],
  ...FIELDS.flatMap((r) => [
    r,
    `on-${r}`,
    `${r}-hover`,
    `${r}-active`,
    `${r}-text`,
    `${r}-subtle`,
    `${r}-border`,
  ]),
]
  .map((k) => `--rte-${k}`)
  .sort();

// ---------------------------------------------------------------------------------------------
// a) Contraste
// ---------------------------------------------------------------------------------------------

describe('property: contraste', () => {
  it('nenhuma das 72 verificações falha para trios aleatórios (inclui limiar do on-*)', () => {
    fc.assert(
      fc.property(seed, seed, seed, (primary, secondary, tertiary) => {
        const report = checkRteTheme({ primary, secondary, tertiary });
        const failed = report.checks.filter((c) => !c.pass);
        expect(report.checks).toHaveLength(72);
        expect(failed).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.invalid).toEqual([]);
      }),
      opts,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// b) Boa formação
// ---------------------------------------------------------------------------------------------

describe('property: boa formação', () => {
  const anyInput = fc.oneof(seed, garbage);
  const maybe = fc.option(anyInput, { nil: undefined });

  it('createRteTheme nunca lança e emite exatamente as 37 chaves em #rrggbb', () => {
    fc.assert(
      fc.property(
        maybe,
        maybe,
        maybe,
        mode,
        neutral,
        (primary, secondary, tertiary, m, n) => {
          const tokens = createRteTheme({
            ...(primary !== undefined && { primary }),
            ...(secondary !== undefined && { secondary }),
            ...(tertiary !== undefined && { tertiary }),
            mode: m,
            neutral: n,
          });
          expect(Object.keys(tokens).sort()).toEqual(EXPECTED_KEYS);
          expect(EXPECTED_KEYS).toHaveLength(37);
          for (const value of Object.values(tokens)) {
            expect(value).toMatch(hexOk);
          }
        },
      ),
      opts,
    );
  });

  it('parseColor nunca lança: null ou três canais finitos em [0, 1]', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const rgb = parseColor(input);
        if (rgb === null) return;
        expect(rgb).toHaveLength(3);
        for (const v of rgb) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }),
      opts,
    );
  });

  it('checkRteTheme nunca lança e `invalid` lista só os campos dados e ilegíveis', () => {
    fc.assert(
      fc.property(maybe, maybe, maybe, (primary, secondary, tertiary) => {
        const given = { primary, secondary, tertiary };
        const report = checkRteTheme({
          ...(primary !== undefined && { primary }),
          ...(secondary !== undefined && { secondary }),
          ...(tertiary !== undefined && { tertiary }),
        });
        const expected = FIELDS.filter(
          (f) =>
            given[f] !== undefined && parseColor(given[f] as string) === null,
        );
        expect(report.invalid).toEqual(expected);
        // Ilegível cai no padrão: as verificações continuam todas passando.
        expect(report.checks).toHaveLength(72);
        expect(report.ok).toBe(true);
      }),
      opts,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// c) Fidelidade de matiz (defeito da mistura polar)
// ---------------------------------------------------------------------------------------------

/**
 * Distância (no plano a,b do OKLab) do token ao raio de matiz da semente: perpendicular quando o
 * token está do lado da semente; se estiver atrás da origem, conta como a própria croma.
 */
function hueOffset(
  tokenHex: string,
  seedRgb: readonly [number, number, number],
): number {
  const [, sa, sb] = linearToOklab(toLinear(seedRgb));
  const sc = Math.hypot(sa, sb);
  const [, ta, tb] = linearToOklab(toLinear(parseColor(tokenHex) as never));
  const ux = sa / sc;
  const uy = sb / sc;
  const along = ta * ux + tb * uy;
  return along >= 0 ? Math.abs(-ta * uy + tb * ux) : Math.hypot(ta, tb);
}

/**
 * Limites EMPÍRICOS (duas varreduras de 200 mil casos por vizinhança, sementes 20261002 e 7; ADR
 * 0002 "Teste de propriedade"). Máximos medidos: gray border 0.0061 (quantização do hex: a mistura
 * ideal em ponto flutuante dá 0 exato) e subtle 0.0023; tinted border 0.0085 e subtle 0.0124 (a
 * superfície tingida pela primary desloca um pouco o matiz; ver "Desvios da fórmula do spike").
 * Os limites abaixo têm folga de ~30-70%. Uma mistura polar (oklch) em vez de OKLab os estoura.
 */
const HUE_BOUND = {
  gray: { border: 0.008, subtle: 0.004 },
  tinted: { border: 0.012, subtle: 0.016 },
} as const;

const chromaticSeed = fc.oneof(
  { weight: 2, arbitrary: hexColor },
  { weight: 1, arbitrary: rgbFn },
  { weight: 1, arbitrary: hslFn },
  {
    weight: 3,
    arbitrary: fc
      .tuple(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.08, max: 0.4, noNaN: true }),
        fc.double({ min: 0, max: 360, noNaN: true }),
      )
      .map(([L, C, h]) => `oklch(${L} ${C} ${h})`),
  },
);

describe('property: fidelidade de matiz', () => {
  it.each(['gray', 'tinted'] as const)(
    'border e subtle da secundária ficam sobre o raio de matiz da semente (%s)',
    (n) => {
      fc.assert(
        fc.property(chromaticSeed, seed, mode, (secondary, primary, m) => {
          const seedRgb = parseColor(secondary) as readonly [
            number,
            number,
            number,
          ];
          // Domínio: croma da semente (já recortada ao gamut sRGB) >= 0.08.
          if (toOklch(toLinear(seedRgb))[1] < 0.08) return;
          const tokens = createRteTheme({
            primary,
            secondary,
            mode: m,
            neutral: n,
          });
          const border = hueOffset(
            tokens['--rte-secondary-border'] as string,
            seedRgb,
          );
          const subtle = hueOffset(
            tokens['--rte-secondary-subtle'] as string,
            seedRgb,
          );
          expect(border, `border ${m}`).toBeLessThan(HUE_BOUND[n].border);
          expect(subtle, `subtle ${m}`).toBeLessThan(HUE_BOUND[n].subtle);
        }),
        opts,
      );
    },
  );
});

// ---------------------------------------------------------------------------------------------
// d) Determinismo e equivalências
// ---------------------------------------------------------------------------------------------

/** Tokens que o tom dos neutros (`neutral: 'tinted'`) pode mudar; todo o resto é idêntico. */
const NEUTRAL_AFFECTED = new Set(
  [
    'surface',
    'surface-raised',
    'text',
    'text-muted',
    'border',
    ...FIELDS.flatMap((r) => [`${r}-subtle`, `${r}-border`]),
  ].map((k) => `--rte-${k}`),
);

describe('property: determinismo e equivalências', () => {
  const maybe = fc.option(fc.oneof(seed, garbage), { nil: undefined });

  it('é determinístico e independe da ordem das chaves das opções', () => {
    fc.assert(
      fc.property(
        maybe,
        maybe,
        maybe,
        mode,
        neutral,
        fc.infiniteStream(fc.nat()),
        (primary, secondary, tertiary, m, n, rnd) => {
          const entries = (
            [
              ['primary', primary],
              ['secondary', secondary],
              ['tertiary', tertiary],
              ['mode', m],
              ['neutral', n],
            ] as const
          ).filter(([, v]) => v !== undefined);
          const shuffled = [...entries];
          const it = rnd[Symbol.iterator]();
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = (it.next().value as number) % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
          }
          const a = createRteTheme(Object.fromEntries(entries));
          expect(createRteTheme(Object.fromEntries(entries))).toEqual(a);
          expect(createRteTheme(Object.fromEntries(shuffled))).toEqual(a);
        },
      ),
      opts,
    );
  });

  it('`dark: true` equivale a `mode: "dark"` (e `dark: false` vence `mode`)', () => {
    fc.assert(
      fc.property(maybe, maybe, neutral, (primary, secondary, n) => {
        const base = {
          ...(primary !== undefined && { primary }),
          ...(secondary !== undefined && { secondary }),
          neutral: n,
        };
        expect(createRteTheme({ ...base, dark: true })).toEqual(
          createRteTheme({ ...base, mode: 'dark' }),
        );
        expect(createRteTheme({ ...base, dark: true, mode: 'light' })).toEqual(
          createRteTheme({ ...base, mode: 'dark' }),
        );
        expect(createRteTheme({ ...base, dark: false, mode: 'dark' })).toEqual(
          createRteTheme({ ...base, mode: 'light' }),
        );
      }),
      opts,
    );
  });

  it('`neutral: "gray"` só muda neutros, subtle e border; on/hover/active/text ficam idênticos', () => {
    fc.assert(
      fc.property(seed, seed, seed, mode, (primary, secondary, tertiary, m) => {
        const input = { primary, secondary, tertiary, mode: m };
        const tinted = createRteTheme({ ...input, neutral: 'tinted' });
        const grayed = createRteTheme({ ...input, neutral: 'gray' });
        for (const key of Object.keys(tinted) as (keyof typeof tinted)[]) {
          if (NEUTRAL_AFFECTED.has(key)) continue;
          expect(grayed[key], key).toBe(tinted[key]);
        }
      }),
      opts,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// e) Degrau do on-*
// ---------------------------------------------------------------------------------------------

describe('property: onLevel', () => {
  it('só devolve 0 ou 1 para Y em [0, 1], exceto a 1e-9 de WHITE_Y', () => {
    const check = (y: number): void => {
      if (Math.abs(y - WHITE_Y) <= 1e-9) return;
      const level = onLevel(y);
      expect(level === 0 || level === 1, `onLevel(${y}) = ${level}`).toBe(true);
      expect(level).toBe(y < WHITE_Y ? 1 : 0);
    };
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), check),
      opts,
    );
    fc.assert(
      fc.property(
        fc.double({ min: 1e-8, max: 1e-3, noNaN: true }),
        fc.boolean(),
        (d, up) => check(WHITE_Y + (up ? d : -d)),
      ),
      opts,
    );
  });

  it('a luminância das cores de 8 bits mais próximas do limiar nunca cai a menos de 1e-7 de WHITE_Y', () => {
    fc.assert(
      fc.property(razorThreshold, (c) => {
        const y = luminance(toLinear(parseColor(c) as never));
        expect(Math.abs(y - WHITE_Y)).toBeGreaterThan(1e-7);
      }),
      opts,
    );
  });
});
