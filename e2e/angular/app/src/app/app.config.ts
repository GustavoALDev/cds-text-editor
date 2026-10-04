import {
  provideBrowserGlobalErrorListeners,
  type ApplicationConfig,
} from '@angular/core';
import {
  provideClientHydration,
  withNoIncrementalHydration,
} from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { changeDetectionProviders } from './change-detection';

// Hidratação sem a incremental (padrão no Angular 22), que traria o *event
// replay* com `<script>` inline, barrado por `script-src 'self'` (pré-voo 12).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    changeDetectionProviders,
    provideRouter(routes),
    provideClientHydration(withNoIncrementalHydration()),
  ],
};
