import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RteEditor, type RteLabelsInput } from '@cds/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@cds/rte-angular/i18n';
import { E2eBridge, NO_FORM_STATE, type RteE2eLang } from '../e2e-bridge';

const LABELS: Record<RteE2eLang, RteLabelsInput> = {
  en: RTE_LABELS_EN,
  'pt-BR': RTE_LABELS_PT_BR,
  es: RTE_LABELS_ES,
};

const PLACEHOLDERS: Record<RteE2eLang, string> = {
  en: 'Write here',
  'pt-BR': 'Escreva aqui',
  es: 'Escribe aquí',
};

/** Tarefa e caixa `warning` de título vazio (N3). */
const DOC =
  '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">Task</label></li></ul>' +
  '<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title"></p><p>Text</p></aside>';

/** N3: rótulos por função do idioma corrente, trocados em tempo de execução. */
@Component({
  selector: 'app-labels',
  imports: [RteEditor],
  templateUrl: './labels.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelsPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly labels = (): RteLabelsInput => LABELS[this.bridge.lang()];
  protected readonly placeholder = computed(
    () => PLACEHOLDERS[this.bridge.lang()],
  );
  protected readonly value = signal(DOC);

  constructor() {
    this.bridge.register('labels', {
      value: () => this.value(),
      setValue: (html) => this.value.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.value.set(DOC),
    });
  }
}
