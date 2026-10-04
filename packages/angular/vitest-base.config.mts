import { defineConfig } from 'vitest/config';

// Configuração base lida pelo builder `unit-test` (runnerConfig). Só amplia os
// tempos dos casos. A primeira chamada do ESLint em lint-guards.spec.ts (~20 s,
// até ~60 s com `test` e `test-zone` em paralelo) fica no `beforeAll` com tempo
// próprio; os casos mais lentos (propriedades) declaram o seu.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
