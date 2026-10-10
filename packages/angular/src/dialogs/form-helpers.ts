// Só tipos de `@angular/forms/signals`: este módulo fica no *chunk*
// principal (âncora, `form-kit.ts`) e não pode puxar os Signal Forms para ele.
import type { FieldTree, ValidationError } from '@angular/forms/signals';
import { normalizeAttribute, type RteAttrRule } from '@comodeviaser/rte-core';
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
    case 'rteMediaUrl':
      return labels.errorMediaUrl;
    case 'rteEmbedUrl':
      return labels.errorEmbedUrl;
    case 'rteFileRequired':
      return labels.errorFileRequired;
    case 'rteFileType':
      return labels.errorFileType;
    case 'rteFileSize':
      return labels.errorFileSize(numberOf(error, 'maxMegabytes'));
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

/**
 * Erro de inteiro fora do intervalo (pré-voo 9): carrega `min` e `max` (o
 * mesmo `errorRange`). Quem chama o passa a `min`/`max` (que gravam os
 * atributos nativos pelo `[formField]`) e a {@link nonIntegerCheck}.
 */
export function integerError(lo: number, hi: number): ValidationError {
  return { kind: 'rteInteger', min: lo, max: hi } as ValidationError;
}

/**
 * Validador (para o `validate` do chamador) que recusa número não inteiro com
 * `error`; vazio (`null`) e `NaN` passam (o `required`/`min`/`max` cuidam).
 */
export function nonIntegerCheck(
  error: ValidationError,
): (ctx: { value: () => number | null }) => ValidationError | undefined {
  return ({ value }) => {
    const v = value();
    return v !== null && !Number.isNaN(v) && !Number.isInteger(v)
      ? error
      : undefined;
  };
}

/** Texto de um atributo do nó; `''` se não for texto. */
export function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Erro visível do campo: só depois de tocado (ou de um envio) (G8). */
export function fieldError<T>(
  field: FieldTree<T>,
  labels: RteDialogLabels,
): string | null {
  const state = field();
  return state.touched() && state.invalid()
    ? dialogErrorText(state.errors(), labels)
    : null;
}

/** Foca o primeiro campo inválido, na ordem fixa dos campos (G8). */
export function focusFirstInvalid(fields: readonly FieldTree<unknown>[]): void {
  fields
    .find((f) => f().invalid())?.()
    .focusBoundControl();
}

/**
 * Validador (para o `validate` do chamador) do código de idioma conforme a
 * regra `span[lang]` do esquema (G14), a mesma do `setLang`: vazio passa (o
 * `required` cuida disso); regra nula ou código recusado → `rteLangCode`.
 * `when` desliga a checagem (ex.: idioma da lista).
 */
export function langCodeCheck(
  rule: () => RteAttrRule | null,
  when?: () => boolean,
): (ctx: { value: () => string }) => ValidationError | undefined {
  return ({ value }) => {
    const code = value();
    if (code === '' || (when && !when())) return undefined;
    const r = rule();
    return r === null || normalizeAttribute(r, code) === null
      ? ({ kind: 'rteLangCode' } as ValidationError)
      : undefined;
  };
}
