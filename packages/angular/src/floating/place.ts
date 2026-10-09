import type { Editor } from '@tiptap/core';
import { positionFloating, type RteRect } from '../toolbar/position';
import { readFloatingAnchor, readVisibleArea } from './anchor';
import { readViewport } from './visual-viewport';
import type { RteFloatingContext } from './visibility';

/** Classe transitória enquanto o menu é medido (M10). */
export const RTE_FLOATING_MEASURING = 'rte-floating--measuring';

/** Âncora encosta na área (intervalos fechados: cursor tem largura 0). */
export function touches(a: RteRect, b: RteRect): boolean {
  return (
    a.top <= b.bottom &&
    a.bottom >= b.top &&
    a.left <= b.right &&
    a.right >= b.left
  );
}

/**
 * Posiciona o menu `el` junto à âncora do contexto (M7–M10): lê a área
 * visível e a âncora; fora da área → `'clipped'` sem tocar no menu. Senão
 * chama `show()` (que abre o *popover* com `--measuring`), mede, calcula por
 * `positionFloating` (`below` para texto/link com `pointer: coarse`) e grava
 * `left`/`top` arredondados por CSSOM só quando mudam (`placed`), tirando
 * `--measuring` no fim.
 */
export function placeFloatingMenu(o: {
  editor: Editor;
  ctx: RteFloatingContext;
  el: HTMLElement;
  view: Window;
  ancestors: () => readonly HTMLElement[];
  placed: WeakMap<HTMLElement, string>;
  show: () => void;
}): 'placed' | 'clipped' {
  const { editor, ctx, el, view } = o;
  const viewport = readViewport(view);
  const visible = readVisibleArea(editor.view.dom, o.ancestors(), viewport);
  const anchor = readFloatingAnchor(editor, ctx);
  if (!visible || !anchor || !touches(anchor, visible)) return 'clipped';
  o.show();
  const coarse =
    (ctx.kind === 'text' || ctx.kind === 'link') &&
    view.matchMedia?.('(pointer: coarse)').matches === true;
  const p = positionFloating({
    anchor,
    visible,
    menu: { width: el.offsetWidth, height: el.offsetHeight },
    viewport,
    prefer: coarse ? 'below' : 'above',
  });
  const left = Math.round(p.left);
  const top = Math.round(p.top);
  const key = `${left},${top}`;
  if (o.placed.get(el) !== key) {
    o.placed.set(el, key);
    el.style.setProperty('left', `${left}px`);
    el.style.setProperty('top', `${top}px`);
  }
  // `remove` de uma classe ausente ainda grava o atributo (registro de mutação, R12).
  if (el.classList.contains(RTE_FLOATING_MEASURING))
    el.classList.remove(RTE_FLOATING_MEASURING);
  return 'placed';
}
