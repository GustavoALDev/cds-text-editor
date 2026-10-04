import { RTE_TEST_MODE } from './test-mode';

// providersFile do alvo `test-zone` (polyfills: ["zone.js"]); o builder já
// acrescenta provideZoneChangeDetection() quando há `Zone`.
export default [{ provide: RTE_TEST_MODE, useValue: 'zone' }];
