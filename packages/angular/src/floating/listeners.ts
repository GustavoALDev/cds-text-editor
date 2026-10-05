import type { NgZone } from '@angular/core';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';

/** Para onde vão os eventos lidos pelos menus flutuantes (M5, M6). */
export interface RteFloatingListenerSink {
  /** O foco entrou (`true`) ou saiu (`false`) de um `.rte-floating` do host. */
  focusInMenu(inside: boolean): void;
  /** Arrasto do ponteiro primário iniciado no editável. */
  dragging(on: boolean): void;
  /** Composição de IME em curso. */
  composing(on: boolean): void;
  /** Cada transação do editor (mapeia a identidade dispensada). */
  transaction(tr: Transaction): void;
}

/**
 * Ouvintes do host, do editável e do documento, registrados fora da zona do
 * Angular (M20); quem recebe decide se a escrita entra nela. Devolve a
 * função que remove todos.
 */
export function bindFloatingListeners(o: {
  editor: Editor;
  host: HTMLElement;
  document: Document;
  ngZone: NgZone;
  sink: RteFloatingListenerSink;
}): () => void {
  const { editor, host, document: doc, sink } = o;
  const dom = editor.view.dom;
  const inMenu = (target: EventTarget | null) =>
    target instanceof Element &&
    host.contains(target) &&
    target.closest('.rte-floating') !== null;
  const onFocusIn = (e: Event) => sink.focusInMenu(inMenu(e.target));
  // destino dentro do host: o `focusin` seguinte decide (sem piscar)
  const onFocusOut = (e: Event) => {
    const next = (e as FocusEvent).relatedTarget;
    if (next instanceof Node && host.contains(next)) return;
    sink.focusInMenu(false);
  };
  const onPointerDown = (e: Event) => {
    const p = e as PointerEvent;
    if (p.button === 0 && p.isPrimary !== false) sink.dragging(true);
  };
  const onPointerUp = () => sink.dragging(false);
  const onCompositionStart = () => sink.composing(true);
  const onCompositionEnd = () => sink.composing(false);
  const onTransaction = ({ transaction }: { transaction: Transaction }) =>
    sink.transaction(transaction);
  o.ngZone.runOutsideAngular(() => {
    host.addEventListener('focusin', onFocusIn);
    host.addEventListener('focusout', onFocusOut);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('compositionstart', onCompositionStart);
    dom.addEventListener('compositionend', onCompositionEnd);
    doc.addEventListener('pointerup', onPointerUp, true);
    doc.addEventListener('pointercancel', onPointerUp, true);
  });
  editor.on('transaction', onTransaction);
  return () => {
    host.removeEventListener('focusin', onFocusIn);
    host.removeEventListener('focusout', onFocusOut);
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('compositionstart', onCompositionStart);
    dom.removeEventListener('compositionend', onCompositionEnd);
    doc.removeEventListener('pointerup', onPointerUp, true);
    doc.removeEventListener('pointercancel', onPointerUp, true);
    editor.off('transaction', onTransaction);
  };
}
