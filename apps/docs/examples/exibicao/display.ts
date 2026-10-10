// #region opcoes
import type { RteEditorConfig } from '@comodeviaser/rte-angular';

// Um só objeto: o mesmo para o editor, para o sanitizador do servidor e para o da exibição.
export const editorOptions: RteEditorConfig = {
  mediaHosts: ['cdn.example.com'],
};
// #endregion

// #region exibicao
import { Component, input } from '@angular/core';
import { provideRteRender, RteContent } from '@comodeviaser/rte-render';
import { RteToc } from '@comodeviaser/rte-render/toc';
import { createSanitizer } from '@comodeviaser/rte-sanitizer';

@Component({
  selector: 'docs-post-view',
  imports: [RteContent, RteToc],
  // As MESMAS opções do editor: com outras, a exibição remove mais ou menos que o editor.
  providers: [provideRteRender({ sanitize: createSanitizer(editorOptions) })],
  template: `
    <!-- O sumário lê o HTML já tratado, com os href de âncora corretos. -->
    <rte-toc [html]="c.renderedHtml()" [levels]="[2, 3]" />
    <article [rteContent]="html()" #c="rteContent"></article>
  `,
})
export class PostView {
  readonly html = input.required<string>();
}
// #endregion

// #region servidor
import { extractToc } from '@comodeviaser/rte-core/html';

// No servidor (ou no build) o sumário sai do HTML salvo, sem Angular.
export function tocOf(html: string) {
  return extractToc(html).filter((entry) => entry.level <= 3);
}
// #endregion
