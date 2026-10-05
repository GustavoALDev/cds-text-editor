import type { RteFeatureId } from '@cds/rte-core';

/** Tipos de menu flutuante (a 05c acrescenta os de mídia). */
export type RteFloatingMenuKind = 'text' | 'link' | 'table' | 'image';

/** `true`/`false` para todos, ou chave a chave (M17). */
export type RteFloatingMenusConfig =
  boolean | Partial<Record<RteFloatingMenuKind, boolean>>;

/** Ordem de prioridade: `image > link > text > table`. */
export const RTE_FLOATING_KINDS: readonly RteFloatingMenuKind[] = Object.freeze(
  ['image', 'link', 'text', 'table'] as const,
);

/** Recurso do core de que cada tipo depende (`null`: sempre disponível). */
export const RTE_FLOATING_FEATURE: Readonly<
  Record<RteFloatingMenuKind, RteFeatureId | null>
> = Object.freeze({
  image: 'media',
  link: null,
  text: null,
  table: 'tables',
});
