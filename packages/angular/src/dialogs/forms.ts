import type { ValidationError } from '@angular/forms/signals';
import type { RteDialogLabels } from '../labels/types';

function numberOf(error: ValidationError, key: string): number {
  const value = (error as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : Number.NaN;
}

/**
 * Texto do primeiro erro de um campo (G8), pelos rótulos; `null` sem erro
 * conhecido. `min`/`max`/`rteInteger` leem `min` e `max` do próprio erro.
 */
export function dialogErrorText(
  errors: readonly ValidationError[],
  labels: RteDialogLabels,
): string | null {
  const error = errors[0];
  if (!error) return null;
  switch (error.kind) {
    case 'required':
      return labels.errorRequired;
    case 'rteLinkUrl':
      return labels.errorLinkUrl;
    case 'rteLangCode':
      return labels.errorLangCode;
    case 'min':
    case 'max':
    case 'rteInteger':
      return labels.errorRange(numberOf(error, 'min'), numberOf(error, 'max'));
    case 'maxLength':
      return labels.errorMaxLength(numberOf(error, 'maxLength'));
    default:
      return null;
  }
}
