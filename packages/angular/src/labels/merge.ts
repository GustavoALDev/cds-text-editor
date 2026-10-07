import type {
  RteContentLabels,
  RteSlashLabels,
} from '@cds/rte-core/extensions';
import { RTE_DIALOG_LANGUAGES } from '../dialogs/types';
import type {
  RteDialogLabels,
  RteFloatingMenuLabels,
  RteLabels,
  RteLabelsInput,
  RteLabelsSource,
  RteToolbarLabels,
  RteUploadLabels,
} from './types';

type Bag = Record<string, unknown>;

function isBag(value: unknown): value is Bag {
  return value !== null && typeof value === 'object';
}

/**
 * Chave própria de `bag`, ou `undefined`. Getter ou armadilha de Proxy do
 * consumidor que lança vale como ausente (cai no rótulo da base, R8).
 */
function own(bag: unknown, key: string): unknown {
  try {
    return isBag(bag) && Object.hasOwn(bag, key) ? bag[key] : undefined;
  } catch {
    return undefined;
  }
}

/** Mescla de uma seção; qualquer exceção restante devolve a seção da base. */
function safely<T>(merge: () => T, fallback: T): T {
  try {
    return merge();
  } catch {
    return fallback;
  }
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
  const pending = own(given, 'rteUploadsPending');
  const missingAlt = own(given, 'rteImagesMissingAlt');
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
    rteUploadsPending:
      typeof pending === 'function'
        ? guard(pending as (count: number) => unknown, base.rteUploadsPending)
        : base.rteUploadsPending,
    rteImagesMissingAlt:
      typeof missingAlt === 'function'
        ? guard(
            missingAlt as (count: number) => unknown,
            base.rteImagesMissingAlt,
          )
        : base.rteImagesMissingAlt,
  };
}

function mergeToolbar(
  base: RteToolbarLabels,
  given: unknown,
): RteToolbarLabels {
  if (!isBag(given)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    if (key === 'heading' || key === 'colorNames') continue;
    const value = own(given, key);
    if (typeof value === 'string') out[key] = value;
  }
  const heading = own(given, 'heading');
  if (typeof heading === 'function')
    out['heading'] = guard(
      heading as (level: 2 | 3 | 4) => unknown,
      base.heading,
    );
  const names: Record<string, string> = { ...base.colorNames };
  const givenNames = own(given, 'colorNames');
  for (const name of Object.keys(base.colorNames)) {
    const value = own(givenNames, name);
    if (typeof value === 'string') names[name] = value;
  }
  out['colorNames'] = names;
  return out as unknown as RteToolbarLabels;
}

/** Funções de `dialogs`, cada uma com `guard` (valor não função → o da base). */
const DIALOG_FUNCTIONS = [
  'errorRange',
  'errorMaxLength',
  'videoTrack',
  'videoTrackRemove',
  'embedUrlHint',
  'fileHint',
  'errorFileSize',
] as const;

function mergeDialogs(base: RteDialogLabels, given: unknown): RteDialogLabels {
  if (!isBag(given)) return base;
  const out: Record<string, unknown> = { ...base };
  const functions: readonly string[] = DIALOG_FUNCTIONS;
  for (const key of Object.keys(base)) {
    if (key === 'languageNames' || functions.includes(key)) continue;
    const value = own(given, key);
    if (typeof value === 'string') out[key] = value;
  }
  for (const key of DIALOG_FUNCTIONS) {
    const value = own(given, key);
    if (typeof value === 'function')
      out[key] = guard(
        value as (...args: never[]) => unknown,
        base[key] as (...args: never[]) => string,
      );
  }
  const names: Record<string, string> = { ...base.languageNames };
  const givenNames = own(given, 'languageNames');
  for (const code of RTE_DIALOG_LANGUAGES) {
    const value = own(givenNames, code);
    if (typeof value === 'string') names[code] = value;
  }
  out['languageNames'] = names;
  return out as unknown as RteDialogLabels;
}

function mergeFloating(
  base: RteFloatingMenuLabels,
  given: unknown,
): RteFloatingMenuLabels {
  if (!isBag(given)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    const value = own(given, key);
    if (typeof value === 'string') out[key] = value;
  }
  return out as unknown as RteFloatingMenuLabels;
}

/** Funções de `upload`, cada uma com `guard`; `region` é texto. */
const UPLOAD_FUNCTIONS = [
  'progress',
  'queued',
  'cancel',
  'announceStart',
  'announceDone',
  'announceCancelled',
  'announceError',
] as const;

function mergeUpload(base: RteUploadLabels, given: unknown): RteUploadLabels {
  if (!isBag(given)) return base;
  const out: Record<string, unknown> = { ...base };
  const region = own(given, 'region');
  if (typeof region === 'string') out['region'] = region;
  for (const key of UPLOAD_FUNCTIONS) {
    const value = own(given, key);
    if (typeof value === 'function')
      out[key] = guard(
        value as (...args: never[]) => unknown,
        base[key] as (...args: never[]) => string,
      );
  }
  return out as unknown as RteUploadLabels;
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
    content: safely(
      () => mergeContent(base.content, own(input, 'content')),
      base.content,
    ),
    slash: safely(
      () => mergeSlash(base.slash, own(input, 'slash')),
      base.slash,
    ),
    editor: safely(
      () => mergeEditor(base.editor, own(input, 'editor')),
      base.editor,
    ),
    errors: safely(
      () => mergeErrors(base.errors, own(input, 'errors')),
      base.errors,
    ),
    toolbar: safely(
      () => mergeToolbar(base.toolbar, own(input, 'toolbar')),
      base.toolbar,
    ),
    dialogs: safely(
      () => mergeDialogs(base.dialogs, own(input, 'dialogs')),
      base.dialogs,
    ),
    floating: safely(
      () => mergeFloating(base.floating, own(input, 'floating')),
      base.floating,
    ),
    upload: safely(
      () => mergeUpload(base.upload, own(input, 'upload')),
      base.upload,
    ),
  };
}
