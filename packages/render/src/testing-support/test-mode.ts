import { InjectionToken } from '@angular/core';

/** Modo de detecção de mudanças em que a suíte roda (`test` ou `test-zone`). */
export type RteTestMode = 'zoneless' | 'zone';

/** Marcado pelo `providersFile` de cada alvo; conferido por `mode.spec.ts`. */
export const RTE_TEST_MODE = new InjectionToken<RteTestMode>('RTE_TEST_MODE');
