import { defineConfig } from 'vitest/config';

// Lido pelo builder `unit-test` (runnerConfig). O primeiro caso de cada arquivo importa o editor
// (JIT do jsdom) e passa dos 5 s padrão; o monorepo faz o mesmo em packages/angular.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
