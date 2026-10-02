import { expect, test } from '@playwright/test';
import {
  applyRteTheme,
  checkRteTheme,
  createRteTheme,
  parseColor,
  supportsRelativeColors,
} from '../../packages/theme/src/index';

// Teste só de Node (sem navegador, sem globais de DOM): roda uma vez, no projeto chromium.
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Node-only: uma execução basta',
);

test('SSR: a API pública importa e roda em Node sem DOM e sem lançar', () => {
  expect(typeof (globalThis as { document?: unknown }).document).toBe(
    'undefined',
  );
  expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
  expect(Object.keys(createRteTheme()).length).toBeGreaterThan(20);
  expect(() => checkRteTheme()).not.toThrow();
  expect(parseColor('#fff')).toEqual([1, 1, 1]);
  const cleanup = applyRteTheme({} as HTMLElement);
  expect(typeof cleanup).toBe('function');
  expect(() => cleanup()).not.toThrow();
  expect(supportsRelativeColors()).toBe(false);
});
