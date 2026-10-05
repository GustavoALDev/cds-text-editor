import type { Routes } from '@angular/router';

// `/` não tem editor; as outras rotas carregam o editor sob demanda.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  {
    path: 'forms',
    loadComponent: () => import('./pages/forms').then((m) => m.FormsPage),
  },
  {
    path: 'labels',
    loadComponent: () => import('./pages/labels').then((m) => m.LabelsPage),
  },
  {
    path: 'content',
    loadComponent: () => import('./pages/content').then((m) => m.ContentPage),
  },
  {
    path: 'lifecycle',
    loadComponent: () =>
      import('./pages/lifecycle').then((m) => m.LifecyclePage),
  },
  {
    path: 'perf',
    loadComponent: () => import('./pages/perf').then((m) => m.PerfPage),
  },
  {
    path: 'toolbar',
    loadComponent: () => import('./pages/toolbar').then((m) => m.ToolbarPage),
  },
  {
    path: 'dialogs',
    loadComponent: () => import('./pages/dialogs').then((m) => m.DialogsPage),
  },
  {
    path: 'floating',
    loadComponent: () => import('./pages/floating').then((m) => m.FloatingPage),
  },
  {
    path: 'media',
    loadComponent: () => import('./pages/media').then((m) => m.MediaPage),
  },
];
