import {
  MAX_LENGTH,
  REQUIRED,
  createMetadataKey,
  metadata,
  validate,
  type LogicFn,
  type PathKind,
  type SchemaPath,
  type SchemaPathRules,
} from '@angular/forms/signals';
import { measureRteText, resolveMax } from './measure';

export type RtePath<K extends PathKind> = SchemaPath<
  string,
  SchemaPathRules.Supported,
  K
>;

/**
 * Exige texto ou mídia (`img`, `video`, `iframe`). Publica `REQUIRED`, então o
 * editor recebe `required` pelo `[formField]` sem ligação manual.
 */
export function rteRequired<K extends PathKind = PathKind.Root>(
  path: RtePath<K>,
  config?: { when?: LogicFn<string, boolean, K> },
): void {
  const required = createMetadataKey<boolean>();
  const when = config?.when;
  metadata(path, required, (ctx) => (when ? Boolean(when(ctx)) : true));
  metadata(
    path,
    REQUIRED,
    ({ state }) => state.metadata(required)?.() ?? false,
  );
  validate(path, ({ value, state }) => {
    if (!(state.metadata(required)?.() ?? false)) return undefined;
    const m = measureRteText(value());
    return m.hasText || m.hasMedia ? undefined : { kind: 'rteRequired' };
  });
}

function limitKey<K extends PathKind>(
  path: RtePath<K>,
  max: number | LogicFn<string, number | undefined, K>,
) {
  const key = createMetadataKey<number | undefined>();
  metadata(path, key, (ctx) =>
    resolveMax(typeof max === 'function' ? max(ctx) : max),
  );
  return key;
}

/** Limite de caracteres do texto. Publica `MAX_LENGTH` (o editor recusa digitar além). */
export function rteMaxChars<K extends PathKind = PathKind.Root>(
  path: RtePath<K>,
  max: number | LogicFn<string, number | undefined, K>,
): void {
  const key = limitKey(path, max);
  metadata(path, MAX_LENGTH, ({ state }) => state.metadata(key)?.());
  validate(path, ({ value, state }) => {
    const limit = state.metadata(key)?.();
    if (limit === undefined) return undefined;
    const { characters } = measureRteText(value());
    return characters > limit
      ? { kind: 'rteMaxChars', max: limit, actual: characters }
      : undefined;
  });
}

/** Limite de palavras do texto (sem metadado: o editor não limita palavras). */
export function rteMaxWords<K extends PathKind = PathKind.Root>(
  path: RtePath<K>,
  max: number | LogicFn<string, number | undefined, K>,
): void {
  const key = limitKey(path, max);
  validate(path, ({ value, state }) => {
    const limit = state.metadata(key)?.();
    if (limit === undefined) return undefined;
    const { words } = measureRteText(value());
    return words > limit
      ? { kind: 'rteMaxWords', max: limit, actual: words }
      : undefined;
  });
}
