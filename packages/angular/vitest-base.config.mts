import { defineConfig } from 'vitest/config';

// Configuração base lida pelo builder `unit-test` (runnerConfig). Só amplia os
// tempos: a primeira chamada do ESLint em lint-guards.spec.ts leva ~20 s sob carga.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
