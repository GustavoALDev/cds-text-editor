import { describe, expect, it, vi } from 'vitest';
import { checkRteTheme, suggestRteColor, warnIfPoorTheme } from './check-theme';

describe('checkRteTheme', () => {
  it('passes for the default Angular theme in both modes', () => {
    const report = checkRteTheme();
    expect(report.ok).toBe(true);
    expect(report.invalid).toEqual([]);
    expect(new Set(report.checks.map((c) => c.mode))).toEqual(
      new Set(['light', 'dark']),
    );
    expect(
      report.checks.filter((c) => c.id.startsWith('C1')).length,
    ).toBeGreaterThanOrEqual(6);
  });

  it('runs the ten spike checks plus the secondary, tertiary and static ones', () => {
    const ids = new Set(checkRteTheme().checks.map((c) => c.id));
    for (const id of [
      'C1',
      'C2a',
      'C2b',
      'C3a',
      'C3b',
      'C4',
      'C5a',
      'C5b',
      'C6a',
      'C6b',
      'C1:secondary',
      'C6b:tertiary',
      'static:danger:surface',
      'static:success:surface-raised',
      'static:code-keyword:code-bg',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it.each([
    '#000000',
    '#ffffff',
    '#808080',
    '#767676',
    '#ffff00',
    '#ffffe0',
    '#00ffff',
    '#ff0000',
    '#0000ff',
    '#00ff00',
    '#e51e3a',
    '#97687b',
    '#1d8811',
  ])('passes for the extreme seed %s as every role', (seed) => {
    const report = checkRteTheme({
      primary: seed,
      secondary: seed,
      tertiary: seed,
    });
    const failed = report.checks.filter((c) => !c.pass);
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('passes for the threshold seeds mixed across roles', () => {
    const report = checkRteTheme({
      primary: '#e51e3a',
      secondary: '#97687b',
      tertiary: '#1d8811',
    });
    expect(report.ok).toBe(true);
  });

  it('reports invalid values and falls back', () => {
    const report = checkRteTheme({ primary: 'banana' });
    expect(report.invalid).toEqual(['primary']);
    expect(report.ok).toBe(true);
  });

  it('does not treat omitted or undefined fields as invalid', () => {
    expect(checkRteTheme({ secondary: '#123456' }).invalid).toEqual([]);
  });

  it('treats a throwing parser as invalid without throwing', () => {
    const throwing = (): never => {
      throw new Error('boom');
    };
    const report = checkRteTheme({
      primary: '#123456',
      secondary: '#654321',
      parseColor: throwing,
    });
    expect(report.invalid).toEqual(['primary', 'secondary']);
  });

  it('keeps pass consistent with ratio >= min', () => {
    const report = checkRteTheme();
    expect(report.checks.every((c) => c.pass === c.ratio >= c.min)).toBe(true);
    expect(report.checks.every((c) => c.id && c.label)).toBe(true);
  });
});

describe('warnIfPoorTheme', () => {
  it('stays silent for a healthy theme', () => {
    const warn = vi.fn();
    warnIfPoorTheme({}, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once per invalid field, in pt-BR, without throwing', () => {
    const warn = vi.fn();
    expect(() =>
      warnIfPoorTheme({ primary: 'banana', tertiary: '12px' }, warn),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toContain('primary');
    expect(String(warn.mock.calls[0]?.[0])).toContain('banana');
    expect(String(warn.mock.calls[1]?.[0])).toContain('tertiary');
  });

  it('is idempotent and returns the report', () => {
    const w1 = vi.fn();
    const w2 = vi.fn();
    const r1 = warnIfPoorTheme({ primary: 'banana' }, w1);
    const r2 = warnIfPoorTheme({ primary: 'banana' }, w2);
    expect(r2).toEqual(r1);
    expect(w2.mock.calls).toEqual(w1.mock.calls);
  });

  it('defaults to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnIfPoorTheme({ primary: 'banana' });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('suggestRteColor', () => {
  it('returns null when the color already passes', () => {
    expect(suggestRteColor('#8514f5')).toBeNull();
  });

  it('returns null for an unreadable color', () => {
    expect(suggestRteColor('banana')).toBeNull();
  });

  it('finds the nearest lightness shift that passes (injected check)', () => {
    const seen: string[] = [];
    const check = (c: string): boolean => {
      seen.push(c);
      return seen.length >= 4; // original + 3 candidatos reprovados
    };
    const out = suggestRteColor('#8514f5', { check });
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    expect(out).toBe(seen[3]);
    expect(out).not.toBe('#8514f5');
    expect(seen.length).toBe(4);
  });

  it('tries the closest lightness first (+0.01, -0.01, +0.02, ...)', () => {
    const seen: string[] = [];
    suggestRteColor('#8514f5', {
      check: (c) => {
        seen.push(c);
        return false;
      },
    });
    // 1 original + até 2 * 50 candidatos distintos, e termina com null
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.length).toBeLessThanOrEqual(101);
  });

  it('returns null when nothing within 0.5 passes', () => {
    expect(suggestRteColor('#8514f5', { check: () => false })).toBeNull();
  });
});
