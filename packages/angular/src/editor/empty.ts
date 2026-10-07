import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** Documento vazio (D6): um único `paragraph` sem conteúdo. */
export function isEmptyDoc(doc: ProseMirrorNode): boolean {
  const first = doc.firstChild;
  return (
    doc.childCount === 1 &&
    first !== null &&
    first.type.name === 'paragraph' &&
    first.content.size === 0
  );
}

/** Valor do editor (D6): `''` para o documento vazio, senão o HTML canônico. */
export function readValue(editor: Editor): string {
  return isEmptyDoc(editor.state.doc) ? '' : getRteHtml(editor);
}

const EMPTY_HTML = /^\s*(?:<p>\s*<\/p>)?\s*$/i;

/**
 * Vazio antes da criação (D6, D19): reconhece, sem analisar o HTML, as formas
 * que o editor lê como o documento vazio — `''`, só espaços e um `<p></p>`
 * (com espaços, sem diferenciar caixa). `<p><br></p>` não é vazio: o `<br>`
 * vira um `hardBreak`. Qualquer outra forma conta como conteúdo até a criação.
 */
export function isEmptyValue(html: string | null | undefined): boolean {
  return EMPTY_HTML.test(html ?? '');
}
