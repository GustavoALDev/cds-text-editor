import { describe, expect, it } from 'vitest';
import { RTE_HIGHLIGHT_COLORS, RTE_TEXT_COLORS } from './palette';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('paleta fechada', () => {
  it('tem os nomes exatos, na ordem', () => {
    expect(RTE_TEXT_COLORS.map((c) => c.name)).toEqual([
      'gray',
      'red',
      'orange',
      'green',
      'blue',
      'purple',
      'pink',
      'teal',
    ]);
    expect(RTE_HIGHLIGHT_COLORS.map((c) => c.name)).toEqual([
      'yellow',
      'green',
      'blue',
      'pink',
      'orange',
      'purple',
    ]);
  });

  it('todo hex é minúsculo de 6 dígitos', () => {
    for (const c of [...RTE_TEXT_COLORS, ...RTE_HIGHLIGHT_COLORS]) {
      expect(c.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.dark).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('texto tem contraste >= 4,5 no fundo do próprio modo', () => {
    for (const c of RTE_TEXT_COLORS) {
      expect(contrast(c.light, '#ffffff'), c.name).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.dark, '#121212'), c.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('marca-texto tem contraste >= 7 com preto (light) e branco (dark)', () => {
    for (const h of RTE_HIGHLIGHT_COLORS) {
      expect(contrast('#000000', h.light), h.name).toBeGreaterThanOrEqual(7);
      expect(contrast('#ffffff', h.dark), h.name).toBeGreaterThanOrEqual(7);
    }
  });

  it('todo texto sobre todo marca-texto do mesmo modo tem >= 4,5', () => {
    for (const t of RTE_TEXT_COLORS) {
      for (const h of RTE_HIGHLIGHT_COLORS) {
        expect(
          contrast(t.light, h.light),
          `${t.name}/${h.name} light`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(t.dark, h.dark),
          `${t.name}/${h.name} dark`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('está congelada', () => {
    for (const list of [RTE_TEXT_COLORS, RTE_HIGHLIGHT_COLORS]) {
      expect(Object.isFrozen(list)).toBe(true);
      for (const c of list) expect(Object.isFrozen(c)).toBe(true);
    }
  });
});
