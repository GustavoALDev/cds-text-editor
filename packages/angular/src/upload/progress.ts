import type { NgZone } from '@angular/core';

/** Mudança mínima de progresso publicada (E23). */
const STEP = 0.01;

/** `NaN`/não número → `null`; senão preso a `[0, 1]` (Review Focus 2). */
export function clampProgress(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/** Mudou o bastante para publicar: ≥ 0,01 ou entre `null` e número. */
export function moved(shown: number | null, next: number | null): boolean {
  if (shown === null || next === null) return shown !== next;
  return Math.abs(next - shown) >= STEP;
}

/**
 * Publicação por quadro (E23): no máximo um `requestAnimationFrame` pendente,
 * pedido fora da zona; `paint` decide o que publicar. Sem `view` (fora do
 * navegador), publica na hora.
 */
export class RteFramePublisher {
  private frame: number | null = null;

  constructor(
    private readonly o: {
      readonly view: Window | null;
      readonly zone: NgZone;
      readonly paint: () => void;
    },
  ) {}

  request(): void {
    if (this.frame !== null) return;
    const view = this.o.view;
    if (!view?.requestAnimationFrame) {
      this.o.paint();
      return;
    }
    this.frame = this.o.zone.runOutsideAngular(() =>
      view.requestAnimationFrame(() => {
        this.frame = null;
        this.o.paint();
      }),
    );
  }

  cancel(): void {
    if (this.frame !== null) this.o.view?.cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
