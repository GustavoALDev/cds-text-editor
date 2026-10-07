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
  // Rascunho (spec 05c2b): `draftKey` e `clearLocalDrafts`.
  {
    path: 'draft',
    loadComponent: () => import('./pages/draft').then((m) => m.DraftPage),
  },
  // Aviso ao sair e salvamento (spec 05c2b).
  {
    path: 'draft-save',
    loadComponent: () =>
      import('./pages/draft-save').then((m) => m.DraftSavePage),
  },
  // Colagem externa (spec 05c2b): URL → embed.
  {
    path: 'paste-external',
    loadComponent: () =>
      import('./pages/paste-external').then((m) => m.PasteExternalPage),
  },
  // Envio de arquivos (spec 05c2a): providers de rota sob demanda.
  {
    path: 'upload',
    loadChildren: () =>
      import('./pages/upload.routes').then((m) => m.UPLOAD_ROUTES),
  },
  {
    path: 'upload-preview',
    loadChildren: () =>
      import('./pages/upload.routes').then((m) => m.UPLOAD_PREVIEW_ROUTES),
  },
  {
    path: 'render',
    loadComponent: () => import('./pages/render').then((m) => m.RenderPage),
  },
  {
    path: 'render/artigo',
    data: { article: true },
    loadComponent: () => import('./pages/render').then((m) => m.RenderPage),
  },
  {
    path: 'render-tt',
    loadComponent: () => import('./pages/render').then((m) => m.RenderPage),
  },
];
