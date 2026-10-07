import type { Editor } from '@tiptap/core';
import type { RteRect } from '../toolbar/position';
import type { RteFloatingContext } from './visibility';

/** Menor retângulo que contém os dois. */
export function unionRect(a: RteRect, b: RteRect): RteRect {
  return {
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
    left: Math.min(a.left, b.left),
  };
}

/** Interseção dos retângulos; `null` se for vazia. */
export function intersectRect(a: RteRect, b: RteRect): RteRect | null {
  const r = {
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
  };
  return r.top < r.bottom && r.left < r.right ? r : null;
}

/** Vazio (jsdom sem valor computado) conta como `visible`. */
const clips = (v: string) => v !== '' && v !== 'visible';

/**
 * Ancestrais com `overflow-x` ou `overflow-y` diferente de `visible`. O
 * `overflow` de `<html>` (e o de `<body>` quando o de `<html>` é `visible`) é
 * propagado à viewport: o elemento não corta nada e o seu retângulo rola com a
 * página, então fica fora (a viewport já entra em `readVisibleArea`).
 */
export function clipAncestors(el: HTMLElement): HTMLElement[] {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  const out: HTMLElement[] = [];
  if (!view) return out;
  const root = view.getComputedStyle(doc.documentElement);
  const bodyPropagates = !clips(root.overflowX) && !clips(root.overflowY);
  for (
    let p = el.parentElement;
    p && p !== doc.documentElement;
    p = p.parentElement
  ) {
    if (p === doc.body && bodyPropagates) continue;
    const s = view.getComputedStyle(p);
    if (clips(s.overflowX) || clips(s.overflowY)) out.push(p);
  }
  return out;
}

const toRect = (r: RteRect): RteRect => ({
  top: r.top,
  right: r.right,
  bottom: r.bottom,
  left: r.left,
});

/** Viewport ∩ editável ∩ cada ancestral que corta; `null` se vazia (M8). */
export function readVisibleArea(
  editable: HTMLElement,
  ancestors: readonly HTMLElement[],
  viewport: { width: number; height: number },
): RteRect | null {
  let area: RteRect | null = {
    top: 0,
    right: viewport.width,
    bottom: viewport.height,
    left: 0,
  };
  for (const el of [editable, ...ancestors]) {
    area = intersectRect(area, toRect(el.getBoundingClientRect()));
    if (!area) return null;
  }
  return area;
}

/** Âncora do menu em coordenadas da viewport (M7); `null` sem DOM. */
export function readFloatingAnchor(
  editor: Editor,
  ctx: RteFloatingContext,
): RteRect | null {
  const { view } = editor;
  const { kind, identity } = ctx;
  if (kind === 'text' || kind === 'link') {
    const { from, to } = kind === 'link' ? identity : view.state.selection;
    const a = view.coordsAtPos(Math.min(from, to));
    const b = view.coordsAtPos(Math.max(from, to), -1);
    return unionRect(toRect(a), toRect(b));
  }
  const dom: unknown = view.nodeDOM(identity.from);
  if (
    !dom ||
    typeof (dom as Element).getBoundingClientRect !== 'function' ||
    (dom as Node).nodeType !== 1
  ) {
    return null;
  }
  const el = dom as Element;
  const target = kind === 'image' ? (el.closest('figure') ?? el) : el;
  return toRect(target.getBoundingClientRect());
}
