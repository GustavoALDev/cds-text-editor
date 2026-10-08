// #region live
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { RteEditor, type RteToolbarPreset } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';

const PRESETS: readonly RteToolbarPreset[] = ['minimal', 'article', 'full'];

@Component({
  selector: 'docs-barra-live',
  imports: [RteEditor],
  templateUrl: './live.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarraLive {
  protected readonly labels = RTE_LABELS_PT_BR;
  protected readonly presets = PRESETS;
  protected readonly preset = signal<RteToolbarPreset>('article');
  protected readonly html = signal(
    '<p>Troque o preset: o editor é recriado.</p>',
  );

  // `options` é lido uma vez, então a configuração entra numa lista de um item e o `track`
  // pela chave recria o editor quando ela muda (o valor é mantido por `[(value)]`).
  protected readonly setups = computed(() => [
    {
      key: this.preset(),
      options: { features: { tables: this.preset() === 'full' } },
    },
  ]);
}
// #endregion
