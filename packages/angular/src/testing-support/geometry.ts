import type { Editor } from '@tiptap/core';
import type { RteRect } from '../toolbar/position';

type Size = { width: number; height: number };

const ZERO: RteRect = { top: 0, right: 0, bottom: 0, left: 0 };

function domRect(r: RteRect): DOMRect {
  const width = r.right - r.left;
  const height = r.bottom - r.top;
  return {
    ...r,
    x: r.left,
    y: r.top,
    width,
    height,
    toJSON: () => ({ ...r }),
  } as DOMRect;
}

/**
 * Finge a geometria no jsdom: `getBoundingClientRect`, `offsetWidth`/
 * `offsetHeight` e `clientWidth`/`clientHeight` do `documentElement`.
 * Devolve a função que restaura.
 */
export function installGeometry(o: {
  viewport: Size;
  rects: Map<Element, RteRect> | ((el: Element) => RteRect | null);
  size?: (el: Element) => Size;
}): () => void {
  const lookup = (el: Element): RteRect | null =>
    typeof o.rects === 'function' ? o.rects(el) : (o.rects.get(el) ?? null);
  const sizeOf = (el: Element): Size => {
    if (o.size) return o.size(el);
    const r = lookup(el) ?? ZERO;
    return { width: r.right - r.left, height: r.bottom - r.top };
  };
  const E = Element.prototype;
  const H = HTMLElement.prototype;
  const saved = {
    rect: E.getBoundingClientRect,
    cw: Object.getOwnPropertyDescriptor(E, 'clientWidth'),
    ch: Object.getOwnPropertyDescriptor(E, 'clientHeight'),
    ow: Object.getOwnPropertyDescriptor(H, 'offsetWidth'),
    oh: Object.getOwnPropertyDescriptor(H, 'offsetHeight'),
  };
  E.getBoundingClientRect = function (this: Element) {
    return domRect(lookup(this) ?? ZERO);
  };
  const isRoot = (el: Element) => el === el.ownerDocument.documentElement;
  Object.defineProperty(E, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      return isRoot(this)
        ? o.viewport.width
        : ((saved.cw?.get?.call(this) as number | undefined) ?? 0);
    },
  });
  Object.defineProperty(E, 'clientHeight', {
    configurable: true,
    get(this: Element) {
      return isRoot(this)
        ? o.viewport.height
        : ((saved.ch?.get?.call(this) as number | undefined) ?? 0);
    },
  });
  Object.defineProperty(H, 'offsetWidth', {
    configurable: true,
    get(this: Element) {
      return sizeOf(this).width;
    },
  });
  Object.defineProperty(H, 'offsetHeight', {
    configurable: true,
    get(this: Element) {
      return sizeOf(this).height;
    },
  });
  return () => {
    E.getBoundingClientRect = saved.rect;
    const put = (t: object, k: string, d?: PropertyDescriptor) =>
      d ? Object.defineProperty(t, k, d) : Reflect.deleteProperty(t, k);
    put(E, 'clientWidth', saved.cw);
    put(E, 'clientHeight', saved.ch);
    put(H, 'offsetWidth', saved.ow);
    put(H, 'offsetHeight', saved.oh);
  };
}

/** Troca `editor.view.coordsAtPos` (o jsdom não mede texto). */
export function fakeCoords(
  editor: Editor,
  at: (pos: number) => RteRect,
): () => void {
  const view = editor.view;
  const original = Object.getOwnPropertyDescriptor(view, 'coordsAtPos');
  Object.defineProperty(view, 'coordsAtPos', {
    configurable: true,
    writable: true,
    value: (pos: number) => at(pos),
  });
  return () => {
    if (original) Object.defineProperty(view, 'coordsAtPos', original);
    else Reflect.deleteProperty(view, 'coordsAtPos');
  };
}
