import type {
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { measureRteText, resolveMax } from './measure';
import {
  countEmptyHeadings,
  findUnsafeLinks,
  type RteSafeLinksOptions,
} from './content';

function textOf(control: AbstractControl): string | null {
  const value: unknown = control.value;
  return typeof value === 'string' ? value : null;
}

/** Validadores de texto para Reactive Forms (mesma medida dos de Signal Forms). */
export const RteValidators: {
  readonly required: ValidatorFn;
  maxChars(max: number): ValidatorFn;
  maxWords(max: number): ValidatorFn;
  safeLinks(options?: RteSafeLinksOptions): ValidatorFn;
  noEmptyHeadings(): ValidatorFn;
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
  safeLinks(options?: RteSafeLinksOptions): ValidatorFn {
    return (control) => {
      const bad = findUnsafeLinks(textOf(control), options?.policy);
      return bad.count > 0 ? { rteUnsafeLinks: bad } : null;
    };
  },
  noEmptyHeadings(): ValidatorFn {
    return (control) => {
      const emptyHeadings = countEmptyHeadings(textOf(control));
      return emptyHeadings > 0
        ? { rteEmptyHeadings: { count: emptyHeadings } }
        : null;
    };
  },
};
