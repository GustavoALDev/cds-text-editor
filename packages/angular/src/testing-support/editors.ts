import { RTE_CODE_LANGUAGES } from '@cds/rte-core/code-languages';
import {
  createEditorExtensions,
  type RteEditorOptions,
} from '@cds/rte-core/extensions';
import type { AnyExtension, Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core (polyfills do jsdom), só teste
import * as coreTesting from '../../../core/extensions/src/testing/editor';

export const destroyTestEditors = coreTesting.destroyTestEditors;

/**
 * Editor com todos os recursos e o catálogo de linguagens, montado num `div`
 * anexado ao `document`. Destrua com `destroyTestEditors()` no `afterEach`.
 * `extra` acrescenta extensões às da fábrica (ex.: a `RteUiExtension`).
 */
export function createTestEditor(
  html: string,
  opts: Partial<RteEditorOptions> = {},
  extra: readonly AnyExtension[] = [],
): Editor {
  const options: RteEditorOptions = {
    features: {
      colors: true,
      code: true,
      tables: true,
      tasks: true,
      media: true,
      embeds: true,
      newsBlocks: true,
    },
    codeLanguages: RTE_CODE_LANGUAGES,
    ...opts,
  };
  return coreTesting.createTestEditor(
    options,
    html,
    extra.length
      ? { extensions: [...createEditorExtensions(options), ...extra] }
      : {},
  );
}

/** Posição no documento do caractere `offset` do texto de um bloco de texto. */
function positionAt(block: ProseMirrorNode, start: number, offset: number) {
  let chars = 0;
  let pos = start;
  let found = null as number | null;
  block.forEach((child, childOffset) => {
    if (found !== null) return;
    if (child.isText) {
      const length = child.text?.length ?? 0;
      if (offset <= chars + length) {
        found = start + childOffset + (offset - chars);
        return;
      }
      chars += length;
    }
    pos = start + childOffset + child.nodeSize;
  });
  return found ?? pos;
}

/**
 * Seleciona a primeira ocorrência de `text` num bloco de texto; `from`/`to`
 * são deslocamentos dentro dela (padrão: o trecho inteiro; `from === to` põe
 * o cursor).
 */
export function selectText(
  editor: Editor,
  text: string,
  from = 0,
  to = from === 0 ? text.length : from,
): void {
  const { doc } = editor.state;
  let range = null as [number, number] | null;
  doc.descendants((node, pos) => {
    if (range) return false;
    if (!node.isTextblock) return true;
    const index = node.textContent.indexOf(text);
    if (index >= 0) {
      range = [
        positionAt(node, pos + 1, index + from),
        positionAt(node, pos + 1, index + to),
      ];
    }
    return false;
  });
  if (!range) throw new Error(`selectText: "${text}" não encontrado.`);
  const [a, b] = range;
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(doc, a, b)),
  );
}
