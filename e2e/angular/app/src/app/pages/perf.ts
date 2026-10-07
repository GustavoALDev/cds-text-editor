import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { RteEditor } from '@cds/rte-angular';
import { rteMaxChars } from '@cds/rte-angular/validators';
import { E2eBridge } from '../e2e-bridge';

/** N8 (informativo): documento grande num `[formField]` com `rteMaxChars`. */
@Component({
  selector: 'app-perf',
  imports: [RteEditor, FormField],
  templateUrl: './perf.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly model = signal({ body: '' });
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
    });
  }
}
