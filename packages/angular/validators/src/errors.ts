import type { ValidationErrors } from '@angular/forms';
import type { ValidationError } from '@angular/forms/signals';
import { RTE_LABELS_EN, type RteLabels } from '@comodeviaser/rte-angular';

/** Erro do validador `rteRequired`: sem texto e sem mídia. */
export interface RteRequiredError extends ValidationError {
  /** Identifica o erro `rteRequired`. */
  readonly kind: 'rteRequired';
}

/** Erro do validador `rteMaxChars`: texto acima do limite de caracteres. */
export interface RteMaxCharsError extends ValidationError {
  /** Identifica o erro `rteMaxChars`. */
  readonly kind: 'rteMaxChars';
  /** Limite configurado. */
  readonly max: number;
  /** Quantidade de caracteres do valor. */
  readonly actual: number;
}

/** Erro do validador `rteMaxWords`: texto acima do limite de palavras. */
export interface RteMaxWordsError extends ValidationError {
  /** Identifica o erro `rteMaxWords`. */
  readonly kind: 'rteMaxWords';
  /** Limite configurado. */
  readonly max: number;
  /** Quantidade de palavras do valor. */
  readonly actual: number;
}

/** Envios em curso no editor (`rteUploadsFinished`, E19). */
export interface RteUploadsPendingError extends ValidationError {
  /** Identifica o erro `rteUploadsPending`. */
  readonly kind: 'rteUploadsPending';
  /** Quantidade de envios em curso. */
  readonly count: number;
}

/** Imagens com `alt: null` no editor (`rteImagesHaveAlt`, E19). */
export interface RteImagesMissingAltError extends ValidationError {
  /** Identifica o erro `rteImagesMissingAlt`. */
  readonly kind: 'rteImagesMissingAlt';
  /** Quantidade de imagens sem texto alternativo. */
  readonly count: number;
}

/** Links fora da política no valor (`rteSafeLinks`, K13); até 5 endereços em `hrefs`. */
export interface RteUnsafeLinksError extends ValidationError {
  /** Identifica o erro `rteUnsafeLinks`. */
  readonly kind: 'rteUnsafeLinks';
  /** Quantidade de links fora da política. */
  readonly count: number;
  /** Até 5 endereços fora da política, para exibir ao autor. */
  readonly hrefs: readonly string[];
}

/** Títulos `h2`–`h4` vazios no valor (`rteNoEmptyHeadings`, K13). */
export interface RteEmptyHeadingsError extends ValidationError {
  /** Identifica o erro `rteEmptyHeadings`. */
  readonly kind: 'rteEmptyHeadings';
  /** Quantidade de títulos vazios. */
  readonly count: number;
}

/**
 * União dos erros que os validadores do editor produzem; o campo `kind` distingue cada um.
 */
export type RteValidationError =
  | RteRequiredError
  | RteMaxCharsError
  | RteMaxWordsError
  | RteUploadsPendingError
  | RteImagesMissingAltError
  | RteUnsafeLinksError
  | RteEmptyHeadingsError;

/**
 * Erro como o Reactive/Template Forms o entrega ao controle customizado
 * (`ReactiveValidationError`): o objeto do validador fica em `context`.
 */
export interface RteReactiveValidationError {
  /** Identificador do erro (`rteMaxChars`, `rteRequired`...). */
  readonly kind: string;
  /** Objeto do validador (`max`, `actual`, `count`...). */
  readonly context?: unknown;
}

/**
 * O que `formatRteError` aceita: o erro de Signal Forms, o
 * `ReactiveValidationError` (`{ kind, context }`) ou o `control.errors` do
 * Reactive Forms (`{ rteMaxChars: { max, actual } }`, o primeiro erro do editor
 * presente vence). Os erros de contagem (`rteUploadsPending`,
 * `rteImagesMissingAlt`, `rteEmptyHeadings`, `rteUnsafeLinks`) levam `count` nas três formas.
 */
export type RteFormattableError =
  | RteValidationError
  | RteReactiveValidationError
  | ValidationErrors
  | null
  | undefined;

type RteKind = RteValidationError['kind'];

const KINDS: readonly RteKind[] = [
  'rteRequired',
  'rteMaxChars',
  'rteMaxWords',
  'rteUploadsPending',
  'rteImagesMissingAlt',
  'rteUnsafeLinks',
  'rteEmptyHeadings',
];

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

/** `kind` e o objeto com `max`/`actual`/`count` em qualquer uma das três formas. */
function normalize(
  error: unknown,
): { kind: RteKind; detail: unknown } | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  const kind = read(error, 'kind');
  if (typeof kind === 'string') {
    if (!isKind(kind)) return undefined;
    // Signal Forms: max/actual/count no próprio erro; Reactive: em `context`.
    const own =
      typeof read(error, 'max') === 'number' ||
      typeof read(error, 'count') === 'number';
    return { kind, detail: own ? error : read(error, 'context') };
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

function countOf(detail: unknown): number | undefined {
  const count = read(detail, 'count');
  return typeof count === 'number' ? count : undefined;
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
      // `rteRequired` é texto; os limites são funções de `{ max, actual }`
      // e as contagens, de `count`.
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
    case 'rteUnsafeLinks': {
      const count = countOf(found.detail);
      if (count === undefined) return '';
      const raw = read(found.detail, 'hrefs');
      const hrefs = Array.isArray(raw)
        ? raw.filter((h): h is string => typeof h === 'string')
        : [];
      return label(labels, 'rteUnsafeLinks', [{ count, hrefs }]);
    }
    case 'rteUploadsPending':
    case 'rteImagesMissingAlt':
    case 'rteEmptyHeadings': {
      const count = countOf(found.detail);
      return count === undefined ? '' : label(labels, found.kind, [count]);
    }
    default:
      return '';
  }
}
