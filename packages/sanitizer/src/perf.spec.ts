import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from './index';
import { readFixture } from './testing/fixtures';

describe('R10: desempenho no Node (informativo)', () => {
  it('mediana de ~400 kB (fixture repetido)', () => {
    const fixture = readFixture('all-features.html');
    const doc = fixture.repeat(Math.ceil(400_000 / fixture.length));
    expect(doc.length).toBeGreaterThanOrEqual(400_000);

    for (let i = 0; i < 3; i++) sanitizeRichText(doc);
    const times: number[] = [];
    for (let i = 0; i < 11; i++) {
      const start = performance.now();
      sanitizeRichText(doc);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[5] as number;
    console.log(
      '[R10] node mediana',
      median.toFixed(1),
      'ms',
      `(${doc.length} caracteres)`,
    );
    expect(median).toBeLessThan(2000);
  });
});
