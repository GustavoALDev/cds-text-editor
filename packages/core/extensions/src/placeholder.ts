import { Extension } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { RteExtensionContext } from './context';
import { RTE_CONTENT_LABELS } from './labels';
import { emptyTitleLabel } from './titles';
import type { RteEditorOptions } from './types';

const CLASS = 'rte-placeholder';
const CLASS_DOC = 'rte-placeholder rte-placeholder--doc';

/**
 * Texto do placeholder lido a cada uso (lição 4). Função que lança ou valor que
 * não é texto valem como ausentes: `''`.
 */
export function resolvePlaceholder(
  source: RteEditorOptions['placeholder'],
): string {
  try {
    const value: unknown = typeof source === 'function' ? source() : source;
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

/** Documento vazio: um único `paragraph` sem conteúdo. */
export function isEmptyDoc(doc: ProseMirrorNode): boolean {
  const first = doc.firstChild;
  return (
    doc.childCount === 1 &&
    first !== null &&
    first.type.name === 'paragraph' &&
    first.content.size === 0
  );
}

interface TitleSlot {
  pos: number;
  node: ProseMirrorNode;
  parent: ProseMirrorNode;
}

// Só detecta o título vazio; o texto do rótulo vem de `ctx.labels()`.
const PROBE = RTE_CONTENT_LABELS['en'];

// Posições dos títulos sem texto, por documento; os rótulos mudam sem o
// documento mudar e por isso são lidos a cada atualização.
const titleSlots = new WeakMap<ProseMirrorNode, readonly TitleSlot[]>();

function findEmptyTitles(doc: ProseMirrorNode): readonly TitleSlot[] {
  const cached = titleSlots.get(doc);
  if (cached !== undefined) return cached;
  const found: TitleSlot[] = [];
  doc.descendants((node, pos, parent) => {
    if (parent !== null && emptyTitleLabel(node, parent, PROBE) !== null) {
      found.push({ pos, node, parent });
    }
    return !node.isTextblock;
  });
  titleSlots.set(doc, found);
  return found;
}

/**
 * Placeholder do documento vazio e dos títulos de caixa sem texto (spec 03c,
 * C2/C3). Só decoração e atributo do elemento editável: nada vai para o HTML
 * (C19). Plugin sem estado.
 */
export function createPlaceholderExtension(
  ctx: RteExtensionContext,
  source: RteEditorOptions['placeholder'],
): AnyExtension {
  return Extension.create({
    name: 'rtPlaceholder',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations(state) {
              const { doc } = state;
              if (isEmptyDoc(doc)) {
                const text = resolvePlaceholder(source);
                if (text === '') return null;
                const first = doc.child(0);
                return DecorationSet.create(doc, [
                  Decoration.node(0, first.nodeSize, {
                    class: CLASS_DOC,
                    'data-placeholder': text,
                  }),
                ]);
              }
              const slots = findEmptyTitles(doc);
              if (slots.length === 0) return null;
              const labels = ctx.labels();
              const decorations: Decoration[] = [];
              for (const { pos, node, parent } of slots) {
                const label = emptyTitleLabel(node, parent, labels);
                if (label === null || label === '') continue;
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: CLASS,
                    'data-placeholder': label,
                  }),
                );
              }
              return decorations.length === 0
                ? null
                : DecorationSet.create(doc, decorations);
            },
            attributes(state) {
              if (!isEmptyDoc(state.doc)) return {};
              const text = resolvePlaceholder(source);
              return text === '' ? {} : { 'aria-placeholder': text };
            },
          },
        }),
      ];
    },
  });
}
