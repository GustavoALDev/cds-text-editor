import type { ValidationErrors } from '@angular/forms';
import type { ValidationError } from '@angular/forms/signals';
import { RTE_LABELS_EN, type RteLabels } from '@cds/rte-angular';

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

/**
 * Erro como o Reactive/Template Forms o entrega ao controle customizado
 * (`ReactiveValidationError`): o objeto do validador fica em `context`.
 */
export interface RteReactiveValidationError {
  readonly kind: string;
  readonly context?: unknown;
}

/**
 * O que `formatRteError` aceita: o erro de Signal Forms, o
 * `ReactiveValidationError` (`{ kind, context }`) ou o `control.errors` do
 * Reactive Forms (`{ rteMaxChars: { max, actual } }`, o primeiro erro do editor
 * presente vence).
 */
export type RteFormattableError =
  | RteValidationError
  | RteReactiveValidationError
  | ValidationErrors
  | null
  | undefined;

type RteKind = RteValidationError['kind'];

const KINDS: readonly RteKind[] = ['rteRequired', 'rteMaxChars', 'rteMaxWords'];

function isKind(value: unknown): value is RteKind {
  return KINDS.includes(value as RteKind);
}

/** Estreita um erro de Signal Forms para um dos erros do editor. */
export function isRteValidationError(
  error: ValidationError,
): error is RteValidationError {
  return isKind(error.kind);
}

function read(bag: unknown, key: string): unknown {
  try {
    return bag !== null && typeof bag === 'object'
      ? (bag as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
}

/** `kind` e o objeto com `max`/`actual` em qualquer uma das três formas. */
function normalize(
  error: unknown,
): { kind: RteKind; detail: unknown } | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  const kind = read(error, 'kind');
  if (typeof kind === 'string') {
    if (!isKind(kind)) return undefined;
    // Signal Forms: max/actual no próprio erro; Reactive: em `context`.
    const context = read(error, 'context');
    return {
      kind,
      detail: typeof read(error, 'max') === 'number' ? error : context,
    };
  }
  for (const key of KINDS) {
    const detail = read(error, key);
    if (detail !== undefined && detail !== null && detail !== false)
      return { kind: key, detail };
  }
  return undefined;
}

function size(detail: unknown): { max: number; actual: number } | undefined {
  const max = read(detail, 'max');
  const actual = read(detail, 'actual');
  return typeof max === 'number' && typeof actual === 'number'
    ? { max, actual }
    : undefined;
}

/** Rótulo do consumidor; ausente, de tipo errado ou que lança cai no inglês. */
function label<A extends unknown[]>(
  labels: RteLabels,
  kind: RteKind,
  args: A,
): string {
  const given = read(read(labels, 'errors'), kind);
  const fallback = RTE_LABELS_EN.errors[kind];
  for (const candidate of [given, fallback]) {
    try {
      // `rteRequired` é texto; os limites são funções de `{ max, actual }`.
      const out: unknown =
        kind === 'rteRequired'
          ? candidate
          : typeof candidate === 'function'
            ? (candidate as (...a: A) => unknown)(...args)
            : undefined;
      if (typeof out === 'string') return out;
    } catch {
      // tenta o inglês
    }
  }
  return '';
}

/**
 * Texto do erro nos rótulos dados (traduzido na hora de exibir). Aceita o
 * erro de Signal Forms, o `ReactiveValidationError` e o `control.errors`.
 * Nunca lança: erro desconhecido ou malformado devolve `''`; rótulo ausente ou
 * que lança cai no `RTE_LABELS_EN`.
 */
export function formatRteError(
  error: RteFormattableError,
  labels: RteLabels,
): string {
  const found = normalize(error);
  if (!found) return '';
  switch (found.kind) {
    case 'rteRequired':
      return label(labels, 'rteRequired', []);
    case 'rteMaxChars':
    case 'rteMaxWords': {
      const detail = size(found.detail);
      return detail ? label(labels, found.kind, [detail]) : '';
    }
    default:
      return '';
  }
}
