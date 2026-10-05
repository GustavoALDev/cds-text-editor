import {
  max,
  min,
  required,
  validate,
  type SchemaPath,
  type ValidationError,
} from '@angular/forms/signals';
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

/** Erro de inteiro fora do intervalo (pré-voo 9): carrega `min` e `max`. */
function integerError(lo: number, hi: number): ValidationError {
  return { kind: 'rteInteger', min: lo, max: hi } as ValidationError;
}

/**
 * Inteiro obrigatório em `[lo, hi]` (pré-voo 9): vazio → `required`; fora do
 * intervalo ou não inteiro → `rteInteger` com os dois limites. `min`/`max`
 * gravam os atributos nativos pelo `[formField]` e trocam o erro padrão
 * (que só carrega um dos limites) pelo `rteInteger`.
 */
export function integerInRange(
  path: SchemaPath<number | null>,
  lo: number,
  hi: number,
): void {
  const error = integerError(lo, hi);
  required(path);
  min(path, lo, { error });
  max(path, hi, { error });
  validate(path, ({ value }) => {
    const v = value();
    return v !== null && !Number.isNaN(v) && !Number.isInteger(v)
      ? error
      : undefined;
  });
}
