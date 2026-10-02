import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/spike-golden.json';
import { contrastRatio, from8, toLinear, type Rgb8 } from './color/convert';
import { toOklch } from './color/oklab';
import { createRteTheme } from './create-theme';
import { ANGULAR_DEFAULTS } from './defaults';

interface GoldenCase {
  seed: string;
  mode: 'light' | 'dark';
  neutralTint: 0 | 1;
  hex: Record<string, string>;
}

const HEX = /^#[0-9a-f]{6}$/;
const rgb8 = (hex: string): Rgb8 => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

describe('createRteTheme', () => {
  it.each(golden as GoldenCase[])(
    'matches the spike for $seed $mode tint=$neutralTint',
    (c) => {
      const vars = createRteTheme({
        primary: c.seed,
        secondary: c.seed,
        tertiary: c.seed,
        mode: c.mode,
        neutral: c.neutralTint === 0 ? 'gray' : 'tinted',
      });
      for (const [name, value] of Object.entries(c.hex)) {
        expect(vars[`--rte-${name}`], `--rte-${name}`).toBe(value);
      }
    },
  );

  it('defaults to the Angular palette in light mode', () => {
    const vars = createRteTheme();
    expect(vars['--rte-primary']).toBe(ANGULAR_DEFAULTS.primary);
    expect(vars['--rte-secondary']).toBe(ANGULAR_DEFAULTS.secondary);
    expect(vars['--rte-tertiary']).toBe(ANGULAR_DEFAULTS.tertiary);
  });

  it.each(['banana', '', 'var(--x)', '12px', '#12'])(
    'falls back to the Angular default for the invalid value %j',
    (bad) => {
      expect(createRteTheme({ primary: bad })).toEqual(createRteTheme());
    },
  );

  it('is deterministic and resolves "dark" over mode hints', () => {
    expect(createRteTheme({ mode: 'dark' })['--rte-surface']).not.toBe(
      createRteTheme({ mode: 'light' })['--rte-surface'],
    );
    expect(createRteTheme({ mode: 'auto', dark: true })).toEqual(
      createRteTheme({ mode: 'dark' }),
    );
    expect(createRteTheme({ mode: 'auto' })).toEqual(
      createRteTheme({ mode: 'light' }),
    );
    expect(createRteTheme({ mode: 'dark', dark: false })).toEqual(
      createRteTheme({ mode: 'light' }),
    );
  });

  it('never emits NaN or malformed hex for degenerate seeds', () => {
    for (const seed of [
      '#000000',
      '#ffffff',
      '#808080',
      '#000001',
      '#fffffe',
      '#010000',
      '#ffff00',
    ]) {
      for (const mode of ['light', 'dark'] as const) {
        for (const neutral of ['tinted', 'gray'] as const) {
          const vars = createRteTheme({
            primary: seed,
            secondary: seed,
            tertiary: seed,
            mode,
            neutral,
          });
          for (const [key, value] of Object.entries(vars)) {
            expect(value, `${key} (${seed} ${mode} ${neutral})`).toMatch(HEX);
          }
        }
      }
    }
  });

  it('never emits NaN when a custom parser returns non-finite channels', () => {
    const vars = createRteTheme({
      primary: 'x',
      parseColor: () => [Number.NaN, Infinity, -Infinity],
    });
    for (const value of Object.values(vars)) expect(value).toMatch(HEX);
  });

  it('treats a throwing custom parser as invalid and clamps out-of-range channels', () => {
    const boom = (): never => {
      throw new Error('boom');
    };
    expect(createRteTheme({ primary: 'x', parseColor: boom })).toEqual(
      createRteTheme(),
    );
    expect(
      createRteTheme({ primary: 'x', parseColor: () => [2, -1, 128 / 255] }),
    ).toEqual(createRteTheme({ primary: '#ff0080' }));
  });

  it('emits exactly the documented --rte-* keys', () => {
    const roles = ['primary', 'secondary', 'tertiary'].flatMap((r) => [
      `--rte-${r}`,
      `--rte-on-${r}`,
      `--rte-${r}-hover`,
      `--rte-${r}-active`,
      `--rte-${r}-text`,
      `--rte-${r}-subtle`,
      `--rte-${r}-border`,
    ]);
    const expected = [
      '--rte-surface',
      '--rte-surface-raised',
      '--rte-text',
      '--rte-text-muted',
      '--rte-border',
      '--rte-focus',
      ...roles,
      '--rte-danger',
      '--rte-warning',
      '--rte-success',
      '--rte-code-bg',
      '--rte-code-text',
      '--rte-code-comment',
      '--rte-code-keyword',
      '--rte-code-string',
      '--rte-code-number',
      '--rte-code-function',
    ];
    for (const mode of ['light', 'dark'] as const) {
      const keys = Object.keys(createRteTheme({ mode }));
      expect(keys.sort()).toEqual(expected.sort());
      expect(keys).toHaveLength(37);
      expect(keys.some((k) => k.startsWith('--_'))).toBe(false);
    }
  });

  it('keeps on-* readable on the ramp example from the review', () => {
    expect(createRteTheme({ primary: '#e51e3a' })['--rte-on-primary']).toBe(
      '#ffffff',
    );
  });

  it('exposes the static semantic and code tokens for the resolved mode', () => {
    const light = createRteTheme({ mode: 'light' });
    const dark = createRteTheme({ mode: 'dark' });
    for (const key of [
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
    ]) {
      expect(light[`--rte-${key}`]).toMatch(HEX);
      expect(dark[`--rte-${key}`]).toMatch(HEX);
    }
    expect(light['--rte-danger']).not.toBe(dark['--rte-danger']);
  });

  describe('static token contrast (>= 4.5)', () => {
    const seeds = [undefined, '#000000', '#ffffff', '#8514f5', '#ffff00'];
    for (const seed of seeds) {
      for (const mode of ['light', 'dark'] as const) {
        it(`semantic and code tokens for ${seed ?? 'default palette'} ${mode}`, () => {
          const vars = createRteTheme(
            seed ? { primary: seed, mode } : { mode },
          );
          for (const surface of ['--rte-surface', '--rte-surface-raised']) {
            for (const key of ['danger', 'warning', 'success']) {
              const ratio = contrastRatio(
                rgb8(vars[`--rte-${key}`] as string),
                rgb8(vars[surface] as string),
              );
              expect(ratio, `${key} on ${surface}`).toBeGreaterThanOrEqual(4.5);
            }
          }
          for (const key of [
            'text',
            'comment',
            'keyword',
            'string',
            'number',
            'function',
          ]) {
            const ratio = contrastRatio(
              rgb8(vars[`--rte-code-${key}`] as string),
              rgb8(vars['--rte-code-bg'] as string),
            );
            expect(ratio, `code-${key} on code-bg`).toBeGreaterThanOrEqual(4.5);
          }
        });
      }
    }
  });
});

describe('hue of subtle and border (mix in OKLab)', () => {
  const trios: [string, string, string][] = [
    ['#1d8811', '#e51e3a', '#4071d9'],
    ['#8514f5', '#f637e3', '#0546ff'],
    ['#ea580c', '#db2777', '#9333ea'],
    ['#0369a1', '#0e7490', '#4f46e5'],
    ['#00bcd4', '#ff5722', '#8bc34a'],
  ];
  const lch = (hex: string): readonly [number, number, number] =>
    toOklch(toLinear(from8(rgb8(hex))));
  const dh = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  // Antes (mistura polar): até ~155 graus. Com neutros cinza a superfície é acromática e o matiz
  // fica na semente (resta o ruído de 8 bits); com neutros tingidos a superfície carrega o matiz da
  // primary por desenho: a borda (45%) fica a <= 6 graus e o subtle (12%, quase só superfície) a <= 35.
  for (const neutral of ['gray', 'tinted'] as const)
    for (const dark of [false, true])
      it(`keeps each role hue near its seed (${neutral}, ${dark ? 'dark' : 'light'})`, () => {
        for (const trio of trios) {
          const t = createRteTheme({
            primary: trio[0],
            secondary: trio[1],
            tertiary: trio[2],
            neutral,
            dark,
          });
          trio.forEach((seed, i) => {
            const role = ['primary', 'secondary', 'tertiary'][i]!;
            const seedH = lch(seed)[2];
            for (const [kind, limit] of [
              ['subtle', neutral === 'gray' ? 5 : 35],
              ['border', neutral === 'gray' ? 5 : 6],
            ] as const) {
              const [, c, h] = lch(t[`--rte-${role}-${kind}`] as string);
              if (c > 0.01)
                expect(
                  dh(h, seedH),
                  `${trio} ${role}-${kind} ${neutral} dark=${dark}`,
                ).toBeLessThanOrEqual(limit);
            }
          });
        }
      });
});
