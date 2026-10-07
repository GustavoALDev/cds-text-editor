import type { NgZone } from '@angular/core';

/**
 * `scroll` (captura, passivo) e `resize` do `window`, coalescidos num
 * `requestAnimationFrame` (M10), fora da zona do Angular. Ligado só enquanto
 * há candidato a menu (pré-voo 8); `stop()` cancela o quadro pendente.
 */
export class RteViewportWatch {
  private listening = false;
  private frame: number | null = null;

  constructor(
    private readonly view: Window | null,
    private readonly ngZone: NgZone,
    /** Chamado no próprio evento de `resize` (antes do quadro). */
    private readonly onResize: () => void,
    /** Chamado no quadro seguinte a um ou mais eventos. */
    private readonly onFrame: () => void,
  ) {}

  private readonly onEvent = (event: Event): void => {
    if (event.type === 'resize') this.onResize();
    const view = this.view;
    if (!view || this.frame !== null) return;
    this.frame = view.requestAnimationFrame(() => {
      this.frame = null;
      this.onFrame();
    });
  };

  start(): void {
    const view = this.view;
    if (!view || this.listening) return;
    this.listening = true;
    this.ngZone.runOutsideAngular(() => {
      view.addEventListener('scroll', this.onEvent, {
        capture: true,
        passive: true,
      });
      view.addEventListener('resize', this.onEvent, { passive: true });
    });
  }

  stop(): void {
    const view = this.view;
    if (view && this.frame !== null) view.cancelAnimationFrame(this.frame);
    this.frame = null;
    if (!view || !this.listening) return;
    this.listening = false;
    view.removeEventListener('scroll', this.onEvent, { capture: true });
    view.removeEventListener('resize', this.onEvent);
  }
}
