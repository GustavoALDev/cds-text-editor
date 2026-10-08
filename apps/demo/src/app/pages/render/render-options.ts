import type { RteEditorConfig } from '@cds/rte-angular';

/**
 * Opções do esquema HTML, **uma só constante**: o editor (`[options]`) e o
 * `createSanitizer(...)` da exibição recebem as mesmas (README do `@cds/rte-render`).
 */
export const RENDER_OPTIONS: RteEditorConfig = {
  linkPolicy: { forceRel: ['noopener', 'noreferrer'] },
};
