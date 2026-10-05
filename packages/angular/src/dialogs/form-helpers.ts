import {
  max,
  min,
  required,
  validate,
  type FieldTree,
  type SchemaPath,
  type ValidationError,
} from '@angular/forms/signals';
import { normalizeAttribute, type RteAttrRule } from '@cds/rte-core';
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
  required(path);
  rangeChecks(path, lo, hi);
}

/**
 * Inteiro opcional em `[lo, hi]` (pré-voo 7): vazio passa; fora do intervalo
 * ou não inteiro → `rteInteger` com os dois limites (o mesmo `errorRange`).
 */
export function optionalIntegerInRange(
  path: SchemaPath<number | null>,
  lo: number,
  hi: number,
): void {
  rangeChecks(path, lo, hi);
}

function rangeChecks(
  path: SchemaPath<number | null>,
  lo: number,
  hi: number,
): void {
  const error = integerError(lo, hi);
  min(path, lo, { error });
  max(path, hi, { error });
  validate(path, ({ value }) => {
    const v = value();
    return v !== null && !Number.isNaN(v) && !Number.isInteger(v)
      ? error
      : undefined;
  });
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
 * Código de idioma conforme a regra `span[lang]` do esquema (G14), a mesma do
 * `setLang`: vazio passa (o `required` cuida disso); regra nula ou código
 * recusado → `rteLangCode`. `when` desliga a checagem (ex.: idioma da lista).
 */
export function langCodeValidator(
  path: SchemaPath<string>,
  rule: () => RteAttrRule | null,
  when?: () => boolean,
): void {
  validate(path, ({ value }) => {
    const code = value();
    if (code === '' || (when && !when())) return undefined;
    const r = rule();
    return r === null || normalizeAttribute(r, code) === null
      ? { kind: 'rteLangCode' }
      : undefined;
  });
}
