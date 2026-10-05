import { InjectionToken } from '@angular/core';
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

/**
 * O que o `RteEditor` usa dos menus flutuantes. O componente fica num *chunk*
 * do `@defer` (M2, Tarefa 8b): o editor o consulta por este token, nunca pela
 * classe, para não puxá-la para o *chunk* principal. Antes da carga a consulta
 * é `undefined` (`focusFloatingMenu()` → `false`, `Escape` não consumido).
 */
export interface RteFloatingMenusApi {
  /** Foca o item ativo do menu visível; `false` sem menu visível. */
  focusActive(): boolean;
  /** Dispensa o menu visível; `false` sem menu visível. */
  dismiss(): boolean;
  /** Devolve o foco ao editável se ele estiver num tipo que sai de `kinds`. */
  releaseFocus(kinds: readonly RteFloatingMenuKind[]): void;
}

export const RTE_FLOATING_MENUS = new InjectionToken<RteFloatingMenusApi>(
  'RTE_FLOATING_MENUS',
);
