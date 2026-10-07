import {
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  provideRteRender,
  RTE_RENDER_LABELS_EN,
  RteContent,
  type RteRenderLabels,
} from '@cds/rte-render';
import {
  RTE_RENDER_LABELS_ES,
  RTE_RENDER_LABELS_PT_BR,
} from '@cds/rte-render/i18n';
import { RteToc } from '@cds/rte-render/toc';
// O fixture compartilhado (spec 04/06) entra como texto, fora do projeto.
// eslint-disable-next-line @nx/enforce-module-boundaries
import fixtureHtml from '../../../../../../fixtures/content/all-features.html' with {
  loader: 'text',
};
import { E2eBridge, type RteE2eLang, type RteE2eRenderId } from '../e2e-bridge';
import { RENDER_SANITIZE } from '../render-options';
import { RenderKeep } from './render-keep';

/**
 * Tabela de colunas largas (H7, R6): 2 × 300 px (`width: 600px` como na edição, H20) —
 * transborda o contêiner numa viewport de 400 px e cabe nos 688 px do `main` (1280 e 1600).
 */
export const WIDE_TABLE =
  '<table><colgroup><col style="width: 300px"><col style="width: 300px"></colgroup><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>';

const LABELS: Record<RteE2eLang, RteRenderLabels> = {
  en: RTE_RENDER_LABELS_EN,
  'pt-BR': RTE_RENDER_LABELS_PT_BR,
  es: RTE_RENDER_LABELS_ES,
};

/**
 * Spec 06, §6.2: exibição do fixture (`render-main`), sumário, tabela larga, entrada
 * livre pela ponte (`render-input`) e âncoras mantidas. `render/artigo` tem cabeçalho
 * fixo (`--rte-scroll-margin`); `render-tt` é servida com *Trusted Types*.
 */
@Component({
  selector: 'app-render',
  imports: [RteContent, RteToc, RenderKeep],
  providers: [provideRteRender({ sanitize: RENDER_SANITIZE })],
  templateUrl: './render.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenderPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly article: boolean =
    inject(ActivatedRoute).snapshot.data['article'] === true;
  protected readonly fixture = fixtureHtml;
  protected readonly wide = WIDE_TABLE;
  protected readonly labels = (): RteRenderLabels => LABELS[this.bridge.lang()];

  private readonly main = viewChild.required('main', { read: RteContent });
  private readonly wideHost = viewChild.required('wideHost', {
    read: RteContent,
  });
  private readonly input = viewChild.required('input', { read: RteContent });

  constructor() {
    const pairs: [RteE2eRenderId, () => RteContent][] = [
      ['render-main', this.main],
      ['render-wide', this.wideHost],
      ['render-input', this.input],
    ];
    for (const [id, host] of pairs) {
      this.bridge.registerRender(id, {
        renderedHtml: () => host().renderedHtml(),
        error: () => host().error(),
      });
    }
  }
}
