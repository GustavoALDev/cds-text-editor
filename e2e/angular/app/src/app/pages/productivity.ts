import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RteEditor, type RteEditorConfig } from '@cds/rte-angular';
import { E2eBridge, NO_FORM_STATE } from '../e2e-bridge';

/** Documento inicial do editor `productivity` (N42, N43). */
export const PRODUCTIVITY_FIXTURE =
  '<p>Primeiro parágrafo com banana e maçã.</p>' +
  '<p>Segundo parágrafo com banana.</p>';

const FREE_FIXTURE = '<p>vazio</p>';

const OPTIONS: RteEditorConfig = {
  features: { tables: true, media: true, embeds: true },
};

/**
 * N42–N44 (spec 05d1): menu `/`, busca e contadores. `productivity` tem barra
 * `full`, contadores e `maxLength` 200; `productivity-free` não tem limite
 * (documentos grandes da busca).
 */
@Component({
  selector: 'app-productivity',
  imports: [RteEditor],
  templateUrl: './productivity.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductivityPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly options = OPTIONS;
  protected readonly value = signal(PRODUCTIVITY_FIXTURE);
  protected readonly freeValue = signal(FREE_FIXTURE);

  constructor() {
    this.bridge.register('productivity', {
      value: () => this.value(),
      setValue: (html) => this.value.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.value.set(PRODUCTIVITY_FIXTURE),
    });
    this.bridge.register('productivity-free', {
      value: () => this.freeValue(),
      setValue: (html) => this.freeValue.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.freeValue.set(FREE_FIXTURE),
    });
  }
}
