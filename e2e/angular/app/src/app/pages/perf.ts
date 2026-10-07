import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { form, FormField } from '@angular/forms/signals';
import {
  RteEditor,
  type RteEditorConfig,
  type RteToolbarConfig,
} from '@cds/rte-angular';
import { rteMaxChars } from '@cds/rte-angular/validators';
import { E2eBridge } from '../e2e-bridge';

/**
 * N8 e N15 (informativos): documento grande num `[formField]` com
 * `rteMaxChars`; a barra (`full` por padrão) troca ao vivo pela ponte. Com
 * `?media` na URL o editor liga `features.media` (N32, spec 05c1: 200 imagens
 * no documento); sem ela a página é a de sempre (N8, N15, N26).
 */
@Component({
  selector: 'app-perf',
  imports: [RteEditor, FormField],
  templateUrl: './perf.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly model = signal({ body: '' });
  protected readonly options: RteEditorConfig = new URLSearchParams(
    inject(DOCUMENT).location?.search ?? '',
  ).has('media')
    ? { features: { media: true }, allowRelativeMedia: true }
    : {};
  protected readonly toolbar = signal<RteToolbarConfig>('full');
  protected readonly f = form(this.model, (p) => {
    rteMaxChars(p.body, 1_000_000);
  });

  constructor() {
    this.bridge.register('perf', {
      value: () => this.model().body,
      setValue: (html) => this.model.update((m) => ({ ...m, body: html })),
      state: () => {
        const field = this.f.body();
        return {
          valid: field.valid(),
          touched: field.touched(),
          dirty: field.dirty(),
          errors: field.errors().map((e) => e.kind),
        };
      },
      reset: () => this.f().reset({ body: '' }),
      setToolbar: (config) => this.toolbar.set(config),
    });
  }
}
