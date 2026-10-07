import {
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
} from '@angular/core';
import { provideRteRender, RteContent } from '@cds/rte-render';
import { E2eBridge } from '../e2e-bridge';
import { RENDER_SANITIZE } from '../render-options';

/** Âncoras do conteúdo mantidas como vieram (`fragmentLinks: 'keep'`). */
const KEEP_HTML = '<h2 id="rt-k">K</h2><p><a href="#rt-k">k</a></p>';

@Component({
  selector: 'app-render-keep',
  imports: [RteContent],
  providers: [
    provideRteRender({ sanitize: RENDER_SANITIZE, fragmentLinks: 'keep' }),
  ],
  template:
    '<div data-testid="render-keep" [rteContent]="html" #keep="rteContent"></div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenderKeep {
  protected readonly html = KEEP_HTML;
  private readonly keep = viewChild.required('keep', { read: RteContent });

  constructor() {
    inject(E2eBridge).registerRender('render-keep', {
      renderedHtml: () => this.keep().renderedHtml(),
      error: () => this.keep().error(),
    });
  }
}
