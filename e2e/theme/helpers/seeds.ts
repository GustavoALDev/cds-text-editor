/** Porte de docs/specs/referencias/t6-tema/make-seeds.py (listas de sementes do spike). */

/** Equivalente a `colorsys.hls_to_rgb`. */
function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  const m1 = 2 * l - m2;
  const v = (hue: number): number => {
    hue %= 1;
    if (hue < 0) hue += 1;
    if (hue < 1 / 6) return m1 + (m2 - m1) * hue * 6;
    if (hue < 0.5) return m2;
    if (hue < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - hue) * 6;
    return m1;
  };
  return [v(h + 1 / 3), v(h), v(h - 1 / 3)];
}

/** `round()` do Python: arredonda metades para o par. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

const dedupe = (list: string[]): string[] => [...new Set(list)];

export function srgbSeeds(): string[] {
  const seeds = [
    '#8514f5',
    '#f637e3',
    '#0546ff',
    '#ffffff',
    '#000000',
    '#808080',
    '#ffff00',
    '#fff9c4',
    '#ffeb3b',
    '#00ffff',
    '#a3ff00',
    '#00ff00',
    '#ff0000',
    '#0000ff',
    '#ff8800',
    '#ff69b4',
    '#800080',
    '#635bff',
    '#1db954',
    '#1d9bf0',
    '#8b4513',
    '#0a0a3c',
    '#fefefe',
    '#010101',
    '#e6e6fa',
    '#fffaf0',
    '#777777',
    '#767676',
    '#757575',
  ];
  for (let h = 0; h < 360; h += 30) {
    for (const s of [0, 0.5, 1.0]) {
      for (const l of [0.05, 0.2, 0.35, 0.5, 0.6, 0.7, 0.85, 0.97]) {
        const [r, g, b] = hlsToRgb(h / 360, l, s);
        seeds.push(
          '#' +
            [r, g, b]
              .map((x) =>
                pyRound(255 * x)
                  .toString(16)
                  .padStart(2, '0'),
              )
              .join(''),
        );
      }
    }
  }
  return dedupe(seeds);
}

export function wideSeeds(): string[] {
  const seeds: string[] = [];
  for (const L of [0.3, 0.5, 0.7, 0.9])
    for (const C of [0.1, 0.25, 0.37])
      for (let h = 0; h < 360; h += 30) seeds.push(`oklch(${L} ${C} ${h})`);
  return seeds.concat([
    'color(display-p3 1 0 0)',
    'color(display-p3 0 1 0)',
    'color(display-p3 0 0.8 1)',
    'color(display-p3 1 0 1)',
  ]);
}

/**
 * Cores de 8 bits com luminância relativa próxima do limiar do on-* (WHITE_Y = 0.1791005).
 * Pegaram defeitos reais (rampa, precisão de float dos motores): rodam em todo motor, nativo e plano B.
 * As seis primeiras são as fixadas pela Tarefa 10; as demais vêm de uma varredura de 8 bits
 * (|Y - 0.1791005| < 5e-7, mais próximas do limiar).
 */
export function thresholdSeeds(): string[] {
  return [
    '#e51e3a',
    '#97687b',
    '#1d8811',
    '#2d870b',
    '#4071d9',
    '#2374da',
    '#a0684d',
    '#7365d8',
    '#3a844b',
    '#8e5ccf',
    '#a046ec',
    '#ea1013',
  ];
}
