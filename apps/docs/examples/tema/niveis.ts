// #region js
import { Component } from '@angular/core';
import { provideRichText, RteEditor } from '@cds/rte-angular';
import type { RteTheme } from '@cds/rte-theme';

// Para a aplicação: sementes e modo no provider (mesclam por chave com o da instância).
export const appTheme: RteTheme = {
  primary: '#0369a1',
  secondary: '#0e7490',
  tertiary: '#4f46e5',
  mode: 'inherit',
};
export const themeProviders = [provideRichText({ theme: appTheme })];

@Component({
  selector: 'docs-theme-instance',
  imports: [RteEditor],
  // Por instância: a entrada vence o provider, chave a chave.
  template: `<rte-editor [theme]="theme" ariaLabel="Texto" />`,
})
export class ThemeInstance {
  protected readonly theme: RteTheme = { primary: '#c2185b' };
}
// #endregion
