import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Configuração base lida pelo builder `unit-test` (runnerConfig). Amplia os
// tempos dos casos e limita os workers: com o padrão (núcleos − 1), os
// ambientes jsdom disputam a CPU (e o coletor de lixo de cada isolate) e um
// caso leve fica até 10× mais lento, sem ganho no tempo total (revisão final
// da 05b1, I3). A primeira chamada do ESLint em lint-guards.spec.ts (~20 s)
// fica no `beforeAll` com tempo próprio; os casos mais lentos (propriedades)
// declaram o seu.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: Math.max(1, Math.min(4, availableParallelism() - 1)),
    // Alvo `coverage` (spec 08a, X10): o builder grava em coverage/<projeto> por padrão.
    coverage: {
      reportsDirectory: resolve(
        import.meta.dirname,
        '../../coverage/packages/angular',
      ),
    },
  },
});
