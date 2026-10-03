// Ajudante de testes do editor (fora do build). Ao importar, supre no jsdom só
// o que falta para o prosemirror-view e o NodeView de imagem (spec 03b, §7.1).
import { Editor } from '@tiptap/core';
import type { Content, EditorOptions } from '@tiptap/core';
import { createEditorExtensions } from '../factory';
import type { RteEditorOptions } from '../types';

type RectLike = Omit<DOMRect, 'toJSON'> & { toJSON(): unknown };

function emptyRect(): RectLike {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {
      return {};
    },
  };
}

if (typeof document !== 'undefined') {
  const range = globalThis.Range?.prototype as Partial<Range> | undefined;
  if (range && typeof range.getClientRects !== 'function') {
    range.getClientRects = function getClientRects() {
      return Object.assign([] as RectLike[], {
        item: () => null,
      }) as unknown as DOMRectList;
    };
  }
  if (range && typeof range.getBoundingClientRect !== 'function') {
    range.getBoundingClientRect = function getBoundingClientRect() {
      return emptyRect() as DOMRect;
    };
  }
  if (typeof document.elementFromPoint !== 'function') {
    document.elementFromPoint = () => null;
  }
  if (
    typeof (globalThis as { PointerEvent?: unknown }).PointerEvent !==
      'function' &&
    typeof MouseEvent === 'function'
  ) {
    class PointerEventStub extends MouseEvent {
      readonly pointerId: number;

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    (globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventStub;
  }
}

const created: Editor[] = [];

/**
 * Editor da fábrica montado num `div` novo em `document.body`. Destrua com
 * `destroyTestEditors()` no `afterEach`.
 */
export function createTestEditor(
  options?: RteEditorOptions,
  content?: Content,
  editor?: Partial<EditorOptions>,
): Editor {
  const element = document.body.appendChild(document.createElement('div'));
  const instance = new Editor({
    element,
    extensions: createEditorExtensions(options),
    ...(content === undefined ? {} : { content }),
    ...editor,
  });
  created.push(instance);
  return instance;
}

/** Destrói os editores de `createTestEditor` e remove os seus `div`. */
export function destroyTestEditors(): void {
  for (const instance of created.splice(0)) {
    const element = instance.options.element;
    instance.destroy();
    if (element instanceof Element) element.remove();
  }
}
