import { expect, test } from '@playwright/test';
import { createRteTheme } from '../../packages/theme/src/create-theme';
import { parseColor } from '../../packages/theme/src/color/parse';
import { to8 } from '../../packages/theme/src/color/convert';
import { evaluateChecks, runChecks, type Tokens } from './helpers/contrast';

// Teste só de Node (sem navegador): roda uma vez, no projeto chromium, em vez de três.
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Node-only: uma execução basta',
);

/** Tokens reais do plano B (hex -> Rgb8) para um tema. */
function realTokens(dark: boolean): Tokens {
  const vars = createRteTheme({ dark });
  const t: Tokens = {};
  for (const [k, v] of Object.entries(vars)) {
    const rgb = parseColor(v);
    if (k.startsWith('--rte-') && rgb) t[k.slice(6)] = to8(rgb);
  }
  return t;
}

test('runChecks passes a real, valid token set (light and dark)', () => {
  for (const dark of [false, true]) {
    const t = realTokens(dark);
    expect(Object.keys(t)).toContain('primary-hover');
    expect(runChecks(t)).toEqual([]);
    expect(evaluateChecks(t).length).toBeGreaterThan(20);
  }
});

test('runChecks reports the exact ids of low-contrast pairs', () => {
  const t = realTokens(false);
  t['on-primary'] = t['primary']!; // C1, C2a, C2b do primary
  t['text'] = t['surface']!; // C5a, C6a (3 papéis)
  const ids = runChecks(t).map((f) => f.split(' ')[0]);
  expect(ids.sort()).toEqual(
    [
      'C1:primary',
      'C2a:primary',
      'C2b:primary',
      'C5a',
      'C6a:primary',
      'C6a:secondary',
      'C6a:tertiary',
    ].sort(),
  );
});

test('runChecks throws a clear error for a missing token', () => {
  const t = realTokens(false);
  delete t['primary-hover'];
  expect(() => runChecks(t)).toThrow('token ausente: --rte-primary-hover');
});
