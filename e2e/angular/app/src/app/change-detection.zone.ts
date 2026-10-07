import { provideZoneChangeDetection } from '@angular/core';

// Build `build-zone` (polyfills: zone.js): detecção de mudanças pela zona.
export const changeDetectionProviders = provideZoneChangeDetection({
  eventCoalescing: true,
});
