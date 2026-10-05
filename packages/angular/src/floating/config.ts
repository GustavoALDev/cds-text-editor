import { isDevMode } from '@angular/core';
import type { RteFeatureId } from '@cds/rte-core';
import type { RteToolbarItemId } from '../toolbar/items';
import {
  RTE_FLOATING_FEATURE,
  RTE_FLOATING_KINDS,
  type RteFloatingMenuKind,
  type RteFloatingMenusConfig,
} from './types';

/** Itens do menu de texto, na ordem de exibição. */
export const RTE_FLOATING_TEXT_ITEMS: readonly RteToolbarItemId[] =
  Object.freeze([
    'bold',
    'italic',
    'underline',
    'strike',
    'code',
    'link',
  ] as const);

type Layer = Partial<Record<RteFloatingMenuKind, boolean>>;

const INVALID = Symbol('invalid');

/** `undefined` (ausente), mapa parcial ou `INVALID`. */
function toLayer(config: unknown): Layer | undefined | typeof INVALID {
  if (config === undefined) return undefined;
  if (typeof config === 'boolean') {
    const layer: Layer = {};
    for (const kind of RTE_FLOATING_KINDS) layer[kind] = config;
    return layer;
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config))
    return INVALID;
  const layer: Layer = {};
  for (const kind of RTE_FLOATING_KINDS) {
    let value: unknown;
    try {
      value = Object.hasOwn(config, kind)
        ? (config as Record<string, unknown>)[kind]
        : undefined;
    } catch {
      value = undefined;
    }
    if (typeof value === 'boolean') layer[kind] = value;
  }
  return layer;
}

/**
 * Tipos de menu ligados (M17): a entrada vence o provider por chave; sem
 * nenhum dos dois, todos ligados. Chave não booleana é ignorada. Tipo cujo
 * recurso está desligado fica fora. Ordem de `RTE_FLOATING_KINDS`.
 */
export function resolveFloatingKinds(
  instance: RteFloatingMenusConfig | undefined,
  provider: RteFloatingMenusConfig | undefined,
  features: readonly RteFeatureId[],
  warned: Set<string>,
): readonly RteFloatingMenuKind[] {
  const inst = toLayer(instance);
  const prov = toLayer(provider);
  let layers: [Layer, Layer];
  if (inst === INVALID || prov === INVALID) {
    if (isDevMode() && !warned.has('floatingMenus')) {
      warned.add('floatingMenus');
      console.warn(
        '[rte-editor] floatingMenus inválido; usando todos ligados.',
      );
    }
    layers = [{}, {}];
  } else {
    layers = [inst ?? {}, prov ?? {}];
  }
  return RTE_FLOATING_KINDS.filter((kind) => {
    const feature = RTE_FLOATING_FEATURE[kind];
    if (feature !== null && !features.includes(feature)) return false;
    return layers[0][kind] ?? layers[1][kind] ?? true;
  });
}

export function sameKinds(
  a: readonly RteFloatingMenuKind[],
  b: readonly RteFloatingMenuKind[],
): boolean {
  return a.length === b.length && a.every((kind, i) => kind === b[i]);
}

/** Itens da barra que o menu flutuante reaproveita. */
export function floatingItemIds(
  kinds: readonly RteFloatingMenuKind[],
): readonly RteToolbarItemId[] {
  return kinds.includes('text') ? RTE_FLOATING_TEXT_ITEMS : [];
}
