import type { Routes } from '@angular/router';
import { provideRichText } from '@comodeviaser/rte-angular';
import { uploadConfig } from './upload-config';

/**
 * Rotas `upload` e `upload-preview` (spec 05c2a, E25): o `provideRichText`
 * com o envio fica nos `providers` da rota, carregados sob demanda (o
 * `app.routes.ts` não importa o pacote). `upload-preview` liga a miniatura
 * (`data.preview`; a CSP da rota tem `img-src blob:`).
 */
export const UPLOAD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./upload').then((m) => m.UploadPage),
    providers: [provideRichText({ upload: uploadConfig(false) })],
  },
];

export const UPLOAD_PREVIEW_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./upload').then((m) => m.UploadPage),
    data: { preview: true },
    providers: [provideRichText({ upload: uploadConfig(true) })],
  },
];
