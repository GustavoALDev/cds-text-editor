import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RteEditor, type RteEditorConfig } from '@comodeviaser/rte-angular';
import { RTE_CODE_LANGUAGES } from '@comodeviaser/rte-core/code-languages';
import { E2eBridge, NO_FORM_STATE } from '../e2e-bridge';

/** N5: um editor com todas as gramáticas, carregado pelo teste (`setValue`). */
@Component({
  selector: 'app-content',
  imports: [RteEditor],
  templateUrl: './content.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly options: RteEditorConfig = {
    codeLanguages: RTE_CODE_LANGUAGES,
  };
  protected readonly value = signal('');

  constructor() {
    this.bridge.register('content', {
      value: () => this.value(),
      setValue: (html) => this.value.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.value.set(''),
    });
  }
}
