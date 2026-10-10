import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  disabled,
  form,
  FormField,
  hidden,
  readonly,
} from '@angular/forms/signals';
import { RteEditor } from '@comodeviaser/rte-angular';
import {
  rteMaxChars,
  rteRequired,
  RteValidators,
} from '@comodeviaser/rte-angular/validators';
import { E2eBridge, NO_FORM_STATE } from '../e2e-bridge';

/** N1/N2: Signal Forms, Reactive Forms (caminho nativo, sem diretiva) e `[(value)]`. */
@Component({
  selector: 'app-forms',
  imports: [RteEditor, FormField, ReactiveFormsModule],
  templateUrl: './forms.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormsPage {
  protected readonly bridge = inject(E2eBridge);

  protected readonly model = signal({ body: '' });
  protected readonly f = form(this.model, (p) => {
    rteRequired(p.body);
    rteMaxChars(p.body, 50);
    disabled(p.body, () => this.bridge.disabled());
    readonly(p.body, () => this.bridge.readonly());
    hidden(p.body, () => this.bridge.hidden());
  });

  protected readonly group = new FormGroup({
    body: new FormControl('', {
      nonNullable: true,
      validators: RteValidators.required,
    }),
  });

  protected readonly plain = signal('');

  /** Campo comum, não signal: no build `zone` prova que a saída atualiza a tela (R14). */
  protected blurCount = 0;

  constructor() {
    const body = this.group.controls.body;
    this.bridge.register('signal', {
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
    this.bridge.register('reactive', {
      value: () => body.value,
      setValue: (html) => body.setValue(html),
      state: () => ({
        valid: body.valid,
        touched: body.touched,
        dirty: body.dirty,
        errors: Object.keys(body.errors ?? {}),
      }),
      reset: () => body.reset(''),
    });
    this.bridge.register('plain', {
      value: () => this.plain(),
      setValue: (html) => this.plain.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.plain.set(''),
    });
  }

  protected onBlur(): void {
    this.blurCount++;
  }
}
