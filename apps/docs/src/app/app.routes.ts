import type { Routes } from '@angular/router';
import { pageResolver } from './content/page';

// `guia/:slug` e `api/:entry` carregam a página gerada (um *chunk* por página); `**` é a 404
// (a rota `404` é pré-renderizada e o build a copia para `404.html`). O `<base href>` leva o prefixo da publicação.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'guia/inicio-rapido' },
  {
    path: 'guia/:slug',
    resolve: { page: pageResolver },
    loadComponent: () => import('./layout/doc-page').then((m) => m.DocPage),
  },
  {
    path: 'api/:entry',
    resolve: { page: pageResolver },
    loadComponent: () => import('./layout/doc-page').then((m) => m.DocPage),
  },
  {
    path: '404',
    loadComponent: () => import('./layout/not-found').then((m) => m.NotFound),
  },
  {
    path: '**',
    loadComponent: () => import('./layout/not-found').then((m) => m.NotFound),
  },
];
