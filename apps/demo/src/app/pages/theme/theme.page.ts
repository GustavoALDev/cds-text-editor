import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RteEditor } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import { ThemePlayground } from './playground.component';

const SAMPLE_HTML =
  '<h2>Título de exemplo</h2>' +
  '<p>Um parágrafo com <strong>negrito</strong>, <em>itálico</em> e um <a href="https://example.com/">link de exemplo</a>.</p>' +
  '<ul><li>Primeiro item</li><li>Segundo item</li></ul>' +
  '<blockquote><p>Uma citação para ver a borda e o fundo.</p></blockquote>' +
  '<pre><code>const tema = "playground";</code></pre>' +
  '<table><tbody><tr><th>Cor</th><th>Papel</th></tr><tr><td>Primária</td><td>Ação principal</td></tr></tbody></table>' +
  '<p>Edite este texto: o tema é o mesmo que o integrador aplicaria.</p>';

/**
 * Página "Tema": o playground e, projetado nele, o `rte-editor` real da pré-visualização, criado
 * só no navegador (`@defer (on idle)`; no prerender sai um esqueleto do mesmo tamanho).
 */
@Component({
  selector: 'demo-theme-page',
  imports: [RteEditor, ThemePlayground],
  templateUrl: './theme.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePage {
  protected readonly labels = RTE_LABELS_PT_BR;
  protected readonly sample = SAMPLE_HTML;
}
