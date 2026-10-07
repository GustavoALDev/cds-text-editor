import { provideZonelessChangeDetection } from '@angular/core';

// Build padrão (zoneless). O build `build-zone` troca este arquivo por
// `change-detection.zone.ts` (fileReplacements).
export const changeDetectionProviders = provideZonelessChangeDetection();
