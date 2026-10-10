// #region live
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RteEditor } from '@comodeviaser/rte-angular';
import { RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';
import type { RteTheme } from '@comodeviaser/rte-theme';

@Component({
  selector: 'docs-tema-live',
  imports: [RteEditor],
  templateUrl: './live.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemaLive {
  protected readonly labels = RTE_LABELS_PT_BR;
  protected readonly aplicar = signal(true);
  protected readonly escuro = signal(false);
  protected readonly html = signal('<p>Texto com o tema do site.</p>');
  // `inherit` segue o `color-scheme` do ancestral: aqui, o do contêiner do exemplo.
  protected readonly theme: RteTheme = { mode: 'inherit' };

  protected setAplicar(event: Event): void {
    this.aplicar.set((event.target as HTMLInputElement).checked);
  }

  protected setEscuro(event: Event): void {
    this.escuro.set((event.target as HTMLInputElement).checked);
  }
}
// #endregion
