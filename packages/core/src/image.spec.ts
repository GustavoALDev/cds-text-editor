import { describe, expect, it } from 'vitest';
import { computeResize, formatSrcset, parseSrcset } from './image';

const base = { width: 400, height: 200, dx: 0, dy: 0 } as const;

describe('computeResize', () => {
  it('se com dx positivo cresce mantendo a proporção', () => {
    expect(computeResize({ ...base, corner: 'se', dx: 100 })).toEqual({
      width: 500,
      height: 250,
    });
  });
  it('nw com dx positivo encolhe', () => {
    expect(computeResize({ ...base, corner: 'nw', dx: 100 })).toEqual({
      width: 300,
      height: 150,
    });
  });
  it('ne com dx negativo encolhe', () => {
    expect(computeResize({ ...base, corner: 'ne', dx: -100 })).toEqual({
      width: 300,
      height: 150,
    });
  });
  it('o eixo de maior variação vence', () => {
    expect(computeResize({ ...base, corner: 'se', dy: 100 })).toEqual({
      width: 600,
      height: 300,
    });
  });
  it('empate vai para o eixo horizontal', () => {
    expect(computeResize({ ...base, corner: 'se', dx: 100, dy: 50 })).toEqual({
      width: 500,
      height: 250,
    });
  });
  it('respeita minWidth e maxWidth padrão', () => {
    expect(computeResize({ ...base, corner: 'se', dx: -1000 })).toEqual({
      width: 48,
      height: 24,
    });
    expect(computeResize({ ...base, corner: 'se', dx: 100000 })).toEqual({
      width: 10000,
      height: 5000,
    });
  });
  it('respeita limites informados', () => {
    expect(
      computeResize({ ...base, corner: 'se', dx: 1000, maxWidth: 600 }),
    ).toEqual({ width: 600, height: 300 });
    expect(
      computeResize({ ...base, corner: 'se', dx: -1000, minWidth: 100 }),
    ).toEqual({ width: 100, height: 50 });
  });
  it('largura original abaixo de minWidth sobe até minWidth', () => {
    expect(
      computeResize({ width: 20, height: 10, dx: 0, dy: 0, corner: 'se' }),
    ).toEqual({ width: 48, height: 24 });
  });
  it('imagem muito alta mantém altura entre 1 e 10000', () => {
    const r = computeResize({
      width: 3,
      height: 1000,
      dx: -1000,
      dy: 0,
      corner: 'se',
    });
    expect(r.height).toBeGreaterThanOrEqual(1);
    expect(r.height).toBeLessThanOrEqual(10000);
    expect(r.width).toBeGreaterThanOrEqual(1);
  });
  it('imagem muito larga mantém altura >= 1', () => {
    expect(
      computeResize({
        width: 10000,
        height: 1,
        dx: -100000,
        dy: 0,
        corner: 'se',
      }).height,
    ).toBeGreaterThanOrEqual(1);
  });
  it('resultados são sempre inteiros', () => {
    const r = computeResize({
      width: 333,
      height: 111,
      dx: 17,
      dy: 3,
      corner: 'sw',
    });
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
  });
  it('lança RangeError para entradas inválidas', () => {
    const bad = (o: object) => () =>
      computeResize({ ...base, corner: 'se', ...o });
    for (const o of [
      { width: 0 },
      { width: -1 },
      { width: NaN },
      { width: Infinity },
      { height: 0 },
      { height: -5 },
      { height: NaN },
      { height: Infinity },
      { dx: NaN },
      { dy: Infinity },
      { minWidth: 0 },
      { maxWidth: 10001 },
      { minWidth: 500, maxWidth: 100 },
    ]) {
      expect(bad(o)).toThrow(RangeError);
    }
  });
});

describe('srcset reexportado', () => {
  it('parseSrcset e formatSrcset funcionam em ida e volta', () => {
    const c = parseSrcset('a.png 1x, b.png 2x');
    expect(c).not.toBeNull();
    expect(parseSrcset(formatSrcset(c!))).toEqual(c);
  });
});
