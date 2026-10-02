import { describe, expect, it, vi } from 'vitest';

// Falha de propósito o C1 da secundária: on-secondary igual a secondary (razão 1).
vi.mock('./create-theme', async (importOriginal) => {
  const real = await importOriginal<typeof import('./create-theme')>();
  return {
    ...real,
    createRteTheme: (o: Parameters<typeof real.createRteTheme>[0]) => {
      const t = real.createRteTheme(o);
      return { ...t, '--rte-on-secondary': t['--rte-secondary'] as string };
    },
  };
});

import { warnIfPoorTheme } from './check-theme';

describe('warnIfPoorTheme (failed checks)', () => {
  it('warns once per failed check, without suggesting for primary', () => {
    const warn = vi.fn();
    const report = warnIfPoorTheme({}, warn);
    expect(report.ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(6);
    const ids = ['C1:secondary', 'C2a:secondary', 'C2b:secondary'];
    warn.mock.calls.forEach(([msg], i) => {
      expect(msg).toContain('contraste insuficiente');
      expect(msg).toContain(`em ${ids[i % 3]}:`);
      expect(msg).toMatch(/razão 1\.\d\d < 4\.5\./);
      expect(msg).not.toContain('primary');
    });
    expect(String(warn.mock.calls[0]?.[0])).toContain('(light)');
    expect(String(warn.mock.calls[3]?.[0])).toContain('(dark)');
  });

  it('does not throw when no suggestion is found', () => {
    expect(() =>
      warnIfPoorTheme({ secondary: '#123456' }, vi.fn()),
    ).not.toThrow();
  });
});
