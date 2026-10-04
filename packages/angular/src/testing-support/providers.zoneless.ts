import { provideZonelessChangeDetection } from '@angular/core';
import { RTE_TEST_MODE } from './test-mode';

// providersFile do alvo `test` (build sem polyfills: o builder não carrega
// o zone.js; pré-voo 2 do plano da spec 05a).
export default [
  provideZonelessChangeDetection(),
  { provide: RTE_TEST_MODE, useValue: 'zoneless' },
];
