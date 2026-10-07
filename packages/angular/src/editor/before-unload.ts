import { effect, untracked, type NgZone, type Signal } from '@angular/core';

export interface RteBeforeUnloadDeps {
  readonly zone: NgZone;
  /** `window` do documento do host; `null` no SSR (nada é registrado). */
  readonly view: Window | null;
  /** `warnOnUnsaved` resolvido (entrada > provider). */
  readonly enabled: Signal<boolean>;
  readonly isDirty: Signal<boolean>;
  readonly pendingUploads: Signal<number>;
}

/**
 * Aviso ao sair (S10, R8): o ouvinte de `beforeunload` existe, fora da zona,
 * só enquanto `warnOnUnsaved` está ligado e há alterações não salvas ou
 * envios em curso. Num contexto de injeção (cria um `effect`).
 */
export class RteBeforeUnload {
  private attached = false;

  private readonly handler = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
    event.returnValue = '';
  };

  constructor(private readonly deps: RteBeforeUnloadDeps) {
    if (!deps.view) return;
    effect(() => {
      const wanted =
        deps.enabled() && (deps.isDirty() || deps.pendingUploads() > 0);
      untracked(() => (wanted ? this.attach() : this.detach()));
    });
  }

  dispose(): void {
    this.detach();
  }

  private attach(): void {
    const view = this.deps.view;
    if (this.attached || !view) return;
    this.attached = true;
    this.deps.zone.runOutsideAngular(() =>
      view.addEventListener('beforeunload', this.handler),
    );
  }

  private detach(): void {
    const view = this.deps.view;
    if (!this.attached || !view) return;
    this.attached = false;
    view.removeEventListener('beforeunload', this.handler);
  }
}
