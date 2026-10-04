import type { ValidationError } from '@angular/forms/signals';
import type { RteLabels } from '@cds/rte-angular';

export interface RteRequiredError extends ValidationError {
  readonly kind: 'rteRequired';
}

export interface RteMaxCharsError extends ValidationError {
  readonly kind: 'rteMaxChars';
  readonly max: number;
  readonly actual: number;
}

export interface RteMaxWordsError extends ValidationError {
  readonly kind: 'rteMaxWords';
  readonly max: number;
  readonly actual: number;
}

export type RteValidationError =
  RteRequiredError | RteMaxCharsError | RteMaxWordsError;

/** Estreita um erro de Signal Forms para um dos erros do editor. */
export function isRteValidationError(
  error: ValidationError,
): error is RteValidationError {
  return (
    error.kind === 'rteRequired' ||
    error.kind === 'rteMaxChars' ||
    error.kind === 'rteMaxWords'
  );
}

/** Texto do erro nos rótulos dados (traduzido na hora de exibir). */
export function formatRteError(
  error: RteValidationError,
  labels: RteLabels,
): string {
  switch (error.kind) {
    case 'rteRequired':
      return labels.errors.rteRequired;
    case 'rteMaxChars':
      return labels.errors.rteMaxChars({
        max: error.max,
        actual: error.actual,
      });
    case 'rteMaxWords':
      return labels.errors.rteMaxWords({
        max: error.max,
        actual: error.actual,
      });
  }
}
