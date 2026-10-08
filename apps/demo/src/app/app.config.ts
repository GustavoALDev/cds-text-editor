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

// Hidratação sem a incremental (padrão no Angular 22): ela traria o *event replay* com
// `<script>` inline, barrado por `script-src 'self'` (CSP estrita, spec 07b W4).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withNoIncrementalHydration()),
  ],
};
