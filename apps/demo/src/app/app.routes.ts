import type { Routes } from '@angular/router';

// Cada página carrega sob demanda (o editor só entra nas rotas que o usam). As rotas
// `upload`, `csrf` e `media` ficam livres para o servidor de exemplo (spec 07b, W5/W6).
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Início',
    loadComponent: () =>
      import('./pages/inicio/inicio.page').then((m) => m.InicioPage),
  },
  {
    path: 'editor',
    title: 'Editor',
    loadComponent: () =>
      import('./pages/editor/editor.page').then((m) => m.EditorPage),
  },
  {
    path: 'toolbar',
    title: 'Barra',
    loadComponent: () =>
      import('./pages/toolbar/toolbar.page').then((m) => m.ToolbarPage),
  },
  {
    path: 'forms',
    title: 'Formulários',
    loadComponent: () =>
      import('./pages/forms/forms.page').then((m) => m.FormsPage),
  },
  {
    path: 'i18n',
    title: 'Idiomas',
    loadComponent: () =>
      import('./pages/i18n/i18n.page').then((m) => m.I18nPage),
  },
  {
    path: 'files',
    title: 'Arquivos',
    loadComponent: () =>
      import('./pages/files/files.page').then((m) => m.FilesPage),
  },
  {
    path: 'render',
    title: 'Exibição',
    loadComponent: () =>
      import('./pages/render/render.page').then((m) => m.RenderPage),
  },
  {
    path: 'theme',
    title: 'Tema',
    loadComponent: () =>
      import('./pages/theme/theme.page').then((m) => m.ThemePage),
  },
];
