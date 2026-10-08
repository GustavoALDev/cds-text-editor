/** Entrada da navegação lateral; a ordem é a da tela. */
export interface NavItem {
  /** Caminho da rota (`''` é o início). */
  readonly path: string;
  /** Rótulo em pt-BR. */
  readonly label: string;
}

/** As 8 páginas do demo (spec 07b, W5). */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '', label: 'Início' },
  { path: 'editor', label: 'Editor' },
  { path: 'toolbar', label: 'Barra' },
  { path: 'forms', label: 'Formulários' },
  { path: 'i18n', label: 'Idiomas' },
  { path: 'files', label: 'Arquivos' },
  { path: 'render', label: 'Exibição' },
  { path: 'theme', label: 'Tema' },
];
