import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  from8,
  to8,
  toLinear,
  toSrgb,
  type Rgb8,
} from './color/convert';
import { onLevel, stateChannel, WHITE_Y } from './derive';

const T = WHITE_Y;

// Varreduras exaustivas das 2^24 cores de 8 bits: segundos sozinhas, mas
// passam dos 30 s globais sob a carga de vários projetos em paralelo (CI).
const EXHAUSTIVE = 120_000;

describe('on-* step', () => {
  it('is an exact step around the luminance threshold', () => {
    expect(onLevel(T - 1e-7)).toBe(1);
    expect(onLevel(T + 1e-7)).toBe(0);
    expect(onLevel(0)).toBe(1);
    expect(onLevel(1)).toBe(0);
  });

  it(
    'no 8-bit sRGB color lies within 1e-7 of the threshold (engines differ in float precision)',
    () => {
      const lin = Array.from(
        { length: 256 },
        (_, i) => toLinear(from8([i, i, i]))[0] as number,
      );
      let minDist = Infinity;
      let argmin = '';
      for (let r = 0; r < 256; r++)
        for (let g = 0; g < 256; g++) {
          const base = 0.2126 * lin[r]! + 0.7152 * lin[g]!;
          for (let b = 0; b < 256; b++) {
            const d = Math.abs(base + 0.0722 * lin[b]! - WHITE_Y);
            if (d < minDist) {
              minDist = d;
              argmin = `rgb(${r},${g},${b})`;
            }
          }
        }
      console.log(`min |Y - WHITE_Y| ${minDist.toExponential(3)} at ${argmin}`);
      expect(minDist).toBeGreaterThanOrEqual(1e-7);
    },
    EXHAUSTIVE,
  );

  it(
    'keeps on/hover/active readable (>= 4.5) for every 8-bit sRGB color',
    () => {
      const lin = Array.from(
        { length: 256 },
        (_, i) => toLinear(from8([i, i, i]))[0],
      );
      // Tabelas por canal (s é sempre 0 ou 1 para qualquer cor de 8 bits) usando o mesmo código do derive.
      const table = (amt: number, s: number): number[] =>
        lin.map((c) => to8(toSrgb([stateChannel(c, amt, s), 0, 0]))[0]);
      const tables = {
        0: { 0.14: table(0.14, 0), 0.26: table(0.26, 0) },
        1: { 0.14: table(0.14, 1), 0.26: table(0.26, 1) },
      } as const;
      const yOf = (r: number, g: number, b: number): number =>
        0.2126 * lin[r]! + 0.7152 * lin[g]! + 0.0722 * lin[b]!;
      const ratio = (ya: number, yb: number): number =>
        (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
      const idx = (v: number): number => Math.round(v);
      let min = Infinity;
      let argmin = '';
      const note = (
        v: number,
        r: number,
        g: number,
        b: number,
        what: string,
      ): void => {
        if (v < min) {
          min = v;
          argmin = `${what} rgb(${r},${g},${b})`;
        }
      };
      for (let r = 0; r < 256; r++) {
        for (let g = 0; g < 256; g++) {
          for (let b = 0; b < 256; b++) {
            const y = yOf(r, g, b);
            const s = onLevel(y);
            if (s !== 0 && s !== 1)
              throw new Error(`degrau fracionário em rgb(${r},${g},${b})`);
            const yOn = s; // on = cinza 0 ou 255
            note(ratio(yOn, y), r, g, b, 'on/seed');
            const t = tables[s as 0 | 1];
            for (const amt of [0.14, 0.26] as const) {
              const tab = t[amt];
              const yh = yOf(idx(tab[r]!), idx(tab[g]!), idx(tab[b]!));
              note(
                ratio(yOn, yh),
                r,
                g,
                b,
                `on/${amt === 0.14 ? 'hover' : 'active'}`,
              );
            }
          }
        }
      }
      console.log(`min contrast ${min.toFixed(3)} at ${argmin}`);
      expect(min).toBeGreaterThanOrEqual(4.5);
    },
    EXHAUSTIVE,
  );

  it('matches contrastRatio on a sample of the table math', () => {
    const on: Rgb8 = to8(toSrgb([1, 1, 1]));
    expect(contrastRatio(on, [0, 0, 0])).toBeCloseTo(21, 6);
  });
});
