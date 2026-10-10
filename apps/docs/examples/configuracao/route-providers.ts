// #region rota
import { Component } from '@angular/core';
import type { Route } from '@angular/router';
import { RteEditor, provideRichText } from '@comodeviaser/rte-angular';
import { RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';

@Component({
  selector: 'docs-article-editor',
  imports: [RteEditor],
  template: `<rte-editor ariaLabel="Artigo" />`,
})
export class ArticleEditor {}

export const articleRoute: Route = {
  path: 'artigos',
  // provideRichText devolve EnvironmentProviders: vale aqui, não em um componente.
  providers: [
    provideRichText({ labels: RTE_LABELS_PT_BR, toolbar: 'minimal' }),
  ],
  component: ArticleEditor,
};
// #endregion
