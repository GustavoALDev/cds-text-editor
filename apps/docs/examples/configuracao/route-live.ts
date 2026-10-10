import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  EnvironmentInjector,
  createEnvironmentInjector,
  inject,
} from '@angular/core';
import { RteEditor } from '@comodeviaser/rte-angular';
import { ArticleEditor, articleRoute } from './route-providers';

/**
 * Exemplo vivo: o mesmo `providers` da rota `artigos` vira um injetor de ambiente para o
 * `ArticleEditor`; o segundo editor, sem ele, usa os padrões (inglês e barra `article`).
 */
@Component({
  selector: 'docs-route-live',
  imports: [NgComponentOutlet, RteEditor],
  templateUrl: './route-live.html',
})
export class RouteLive {
  protected readonly article = ArticleEditor;
  protected readonly injector = createEnvironmentInjector(
    articleRoute.providers ?? [],
    inject(EnvironmentInjector),
  );
}
