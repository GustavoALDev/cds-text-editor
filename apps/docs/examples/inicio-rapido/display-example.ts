// #region display
import { Component, input } from '@angular/core';
import { provideRteRender, RteContent } from '@comodeviaser/rte-render';
import { createSanitizer } from '@comodeviaser/rte-sanitizer';

@Component({
  selector: 'docs-display-example',
  imports: [RteContent],
  providers: [provideRteRender({ sanitize: createSanitizer() })],
  template: `<article [rteContent]="html()"></article>`,
})
export class DisplayExample {
  readonly html = input.required<string>();
}
// #endregion
