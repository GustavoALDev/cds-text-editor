// #region servidor
import { mergeApplicationConfig, type ApplicationConfig } from '@angular/core';
import {
  provideClientHydration,
  withNoIncrementalHydration,
} from '@angular/platform-browser';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { provideRichText } from '@cds/rte-angular';
import { provideRteRender } from '@cds/rte-render';
import { createSanitizer } from '@cds/rte-sanitizer';

// As opções do editor: as mesmas no servidor, no navegador e na gravação.
const editorOptions = {};

const browserConfig: ApplicationConfig = {
  providers: [
    // Sem hidratação incremental e sem withEventReplay(): o replay injeta um <script> inline,
    // que a CSP estrita (script-src 'self') barra.
    provideClientHydration(withNoIncrementalHydration()),
    provideRichText({ editor: editorOptions }),
    provideRteRender({ sanitize: createSanitizer(editorOptions) }),
  ],
};

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes([]))],
};

export const config = mergeApplicationConfig(browserConfig, serverConfig);
// #endregion
