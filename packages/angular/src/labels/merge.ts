import type {
  RteContentLabels,
  RteSlashLabels,
} from '@cds/rte-core/extensions';
import type { RteLabels, RteLabelsInput, RteLabelsSource } from './types';

type Bag = Record<string, unknown>;

function isBag(value: unknown): value is Bag {
  return value !== null && typeof value === 'object';
}

function own(bag: unknown, key: string): unknown {
  return isBag(bag) && Object.hasOwn(bag, key) ? bag[key] : undefined;
}

/** Lê a fonte; função que lança ou valor que não é objeto vale como ausente. */
export function readLabelsSource(
  source: RteLabelsSource | undefined,
): RteLabelsInput | undefined {
  let value: unknown = source;
  if (typeof source === 'function') {
    try {
      value = source();
    } catch {
      return undefined;
    }
  }
  return isBag(value) ? (value as RteLabelsInput) : undefined;
}

function guard<A extends unknown[]>(
  fn: (...args: A) => unknown,
  fallback: (...args: A) => string,
): (...args: A) => string {
  return (...args: A) => {
    try {
      const out = fn(...args);
      if (typeof out === 'string') return out;
    } catch {
      // cai no rótulo da base
    }
    return fallback(...args);
  };
}

const VARIANTS = ['info', 'success', 'warning', 'danger'] as const;

function mergeContent(
  base: RteContentLabels,
  given: unknown,
): RteContentLabels {
  if (!isBag(given)) return base;
  const titles = { ...base.calloutTitles };
  const givenTitles = own(given, 'calloutTitles');
  for (const variant of VARIANTS) {
    const value = own(givenTitles, variant);
    if (typeof value === 'string') titles[variant] = value;
  }
  const readAlso = own(given, 'readAlsoTitle');
  const task = own(given, 'taskCheckbox');
  return {
    calloutTitles: titles,
    readAlsoTitle: typeof readAlso === 'string' ? readAlso : base.readAlsoTitle,
    taskCheckbox:
      typeof task === 'function'
        ? guard(task as (text: string) => unknown, base.taskCheckbox)
        : base.taskCheckbox,
  };
}

function mergeSlash(base: RteSlashLabels, given: unknown): RteSlashLabels {
  if (!isBag(given)) return base;
  const out: Record<string, { title: string; keywords: readonly string[] }> = {
    ...base,
  };
  for (const id of Object.keys(base)) {
    const item = own(given, id);
    const title = own(item, 'title');
    const keywords = own(item, 'keywords');
    if (
      typeof title === 'string' &&
      Array.isArray(keywords) &&
      keywords.every((word) => typeof word === 'string')
    ) {
      out[id] = { title, keywords: [...(keywords as string[])] };
    }
  }
  return out as RteSlashLabels;
}

function mergeEditor(base: RteLabels['editor'], given: unknown) {
  const ariaLabel = own(given, 'ariaLabel');
  return typeof ariaLabel === 'string' ? { ariaLabel } : base;
}

function mergeErrors(base: RteLabels['errors'], given: unknown) {
  const required = own(given, 'rteRequired');
  const maxChars = own(given, 'rteMaxChars');
  const maxWords = own(given, 'rteMaxWords');
  return {
    rteRequired: typeof required === 'string' ? required : base.rteRequired,
    rteMaxChars:
      typeof maxChars === 'function'
        ? guard(
            maxChars as (error: { max: number; actual: number }) => unknown,
            base.rteMaxChars,
          )
        : base.rteMaxChars,
    rteMaxWords:
      typeof maxWords === 'function'
        ? guard(
            maxWords as (error: { max: number; actual: number }) => unknown,
            base.rteMaxWords,
          )
        : base.rteMaxWords,
  };
}

/**
 * Mescla a entrada sobre `base` por seção e por chave: só chaves próprias com
 * o tipo esperado. Sem entrada, devolve `base` (o mesmo objeto).
 */
export function mergeLabels(
  base: RteLabels,
  input: RteLabelsInput | undefined,
): RteLabels {
  if (!isBag(input)) return base;
  return {
    content: mergeContent(base.content, own(input, 'content')),
    slash: mergeSlash(base.slash, own(input, 'slash')),
    editor: mergeEditor(base.editor, own(input, 'editor')),
    errors: mergeErrors(base.errors, own(input, 'errors')),
  };
}
