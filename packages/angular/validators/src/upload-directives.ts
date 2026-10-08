import {
  DestroyRef,
  Directive,
  effect,
  forwardRef,
  inject,
  Injector,
  untracked,
  type Signal,
} from '@angular/core';
import {
  NG_VALIDATORS,
  NgControl,
  type AbstractControl,
  type ValidationErrors,
  type Validator,
  type ValidatorFn,
} from '@angular/forms';
import { RteEditor } from '@cds/rte-angular';

/**
 * Validador do Reactive/Template Forms sobre uma contagem do editor (E19):
 * um `effect` sobre o *signal* chama o `registerOnValidatorChange` quando a
 * contagem muda (não na primeira leitura), e o controle revalida sem que o
 * valor mude.
 *
 * O `@angular/forms` 22.2 liga o `rte-editor` pelo caminho de controle
 * customizado (`setupCustomControl`), que não junta os `NG_VALIDATORS` do
 * elemento ao controle nem chama `registerOnValidatorChange`. Sem esse
 * registro, a diretiva se acrescenta ao controle do `NgControl` do próprio
 * elemento (e se retira na destruição) e o revalida ela mesma.
 *
 * @internal Base compartilhada; exportada como valor só para o .d.ts bater com o JS.
 */
export abstract class RteCountValidator implements Validator {
  private readonly injector = inject(Injector);
  private onChange: (() => void) | undefined;
  private control: AbstractControl | null = null;
  private readonly fn: ValidatorFn = () => this.validate();

  constructor(
    private readonly key: 'rteUploadsPending' | 'rteImagesMissingAlt',
    private readonly count: Signal<number>,
  ) {
    let first = true;
    effect(() => {
      const now = count();
      untracked(() => {
        const fresh = this.attach();
        if (first) {
          first = false;
          if (!fresh || now === 0) return;
        }
        if (this.onChange) this.onChange();
        else this.control?.updateValueAndValidity();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.control?.removeValidators(this.fn);
      this.control = null;
    });
  }

  validate(): ValidationErrors | null {
    const count = untracked(this.count);
    return count > 0 ? { [this.key]: { count } } : null;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onChange = fn;
  }

  /** Entra no controle do elemento se o `@angular/forms` não o fez. */
  private attach(): boolean {
    if (this.onChange) return false;
    const control =
      this.injector.get(NgControl, null, { self: true })?.control ?? null;
    if (!control || control.hasValidator(this.fn)) return false;
    this.control?.removeValidators(this.fn);
    control.addValidators(this.fn);
    this.control = control;
    return true;
  }
}

/** `{ rteUploadsPending: { count } }` enquanto há envios em curso (E19). */
@Directive({
  selector: 'rte-editor[rteUploadsFinished]',
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => RteUploadsFinishedValidator),
      multi: true,
    },
  ],
})
export class RteUploadsFinishedValidator extends RteCountValidator {
  constructor() {
    super('rteUploadsPending', inject(RteEditor).pendingUploads);
  }
}

/** `{ rteImagesMissingAlt: { count } }` com imagens de `alt: null` (E19). */
@Directive({
  selector: 'rte-editor[rteImagesHaveAlt]',
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => RteImagesHaveAltValidator),
      multi: true,
    },
  ],
})
export class RteImagesHaveAltValidator extends RteCountValidator {
  constructor() {
    super('rteImagesMissingAlt', inject(RteEditor).imagesMissingAlt);
  }
}
