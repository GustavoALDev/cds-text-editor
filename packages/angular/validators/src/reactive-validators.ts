import type {
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { measureRteText, resolveMax } from './measure';

function textOf(control: AbstractControl): string | null {
  const value: unknown = control.value;
  return typeof value === 'string' ? value : null;
}

/** Validadores de texto para Reactive Forms (mesma medida dos de Signal Forms). */
export const RteValidators: {
  readonly required: ValidatorFn;
  maxChars(max: number): ValidatorFn;
  maxWords(max: number): ValidatorFn;
} = {
  required(control: AbstractControl): ValidationErrors | null {
    const m = measureRteText(textOf(control));
    return m.hasText || m.hasMedia ? null : { rteRequired: true };
  },
  maxChars(max: number): ValidatorFn {
    const limit = resolveMax(max);
    return (control) => {
      if (limit === undefined) return null;
      const { characters } = measureRteText(textOf(control));
      return characters > limit
        ? { rteMaxChars: { max: limit, actual: characters } }
        : null;
    };
  },
  maxWords(max: number): ValidatorFn {
    const limit = resolveMax(max);
    return (control) => {
      if (limit === undefined) return null;
      const { words } = measureRteText(textOf(control));
      return words > limit
        ? { rteMaxWords: { max: limit, actual: words } }
        : null;
    };
  },
};
