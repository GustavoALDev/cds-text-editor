// #region troca
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { RteEditor, type RteLabels } from '@cds/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@cds/rte-angular/i18n';

type Lang = 'pt-BR' | 'en' | 'es';

const PACKS: Readonly<Record<Lang, RteLabels>> = {
  'pt-BR': RTE_LABELS_PT_BR,
  en: RTE_LABELS_EN,
  es: RTE_LABELS_ES,
};

@Component({
  selector: 'docs-idiomas-live',
  imports: [RteEditor],
  templateUrl: './live.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdiomasLive {
  protected readonly langs: readonly Lang[] = ['pt-BR', 'en', 'es'];
  protected readonly lang = signal<Lang>('pt-BR');
  // Um signal troca os rótulos do mesmo editor: nada é recriado.
  protected readonly labels = computed(() => PACKS[this.lang()]);
  protected readonly html = signal('');
}
// #endregion
