import { normalizeAttribute, type RteAttrRule } from '@comodeviaser/rte-core';
import type { RteUploadRules } from './rules';
import type { RteUploadType } from './types';

export interface RteUploadedAttrs {
  src: string;
  width?: number;
  height?: number;
  srcset?: string;
  sizes?: string;
  poster?: string;
}

/** Atributo opcional: ausente → `undefined`; presente e recusado → `null`. */
function optionalText(
  value: unknown,
  rule: RteAttrRule,
): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return null;
  return normalizeAttribute(rule, value);
}

function dimension(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10000
    ? value
    : undefined;
}

/**
 * Revalida a resposta do adaptador (E6, pré-voo 6): `url` e os textos
 * presentes passam pela regra do esquema (valor canônico); qualquer recusa →
 * `{ ok: false }` (`'response'`); `width`/`height` inválidos são omitidos.
 */
export function readUploadedMedia(
  type: RteUploadType,
  value: unknown,
  rules: RteUploadRules,
): { ok: true; attrs: RteUploadedAttrs } | { ok: false } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false };
  }
  const r = value as Record<string, unknown>;
  if (typeof r['url'] !== 'string') return { ok: false };
  const src = normalizeAttribute(
    type === 'image' ? rules.media.imageSrc : rules.media.videoSrc,
    r['url'],
  );
  if (src === null) return { ok: false };
  const attrs: RteUploadedAttrs = { src };
  const width = dimension(r['width']);
  const height = dimension(r['height']);
  if (width !== undefined) attrs.width = width;
  if (height !== undefined) attrs.height = height;
  if (type === 'image') {
    const srcset = optionalText(r['srcset'], rules.imageSrcset);
    const sizes = optionalText(r['sizes'], rules.imageSizes);
    if (srcset === null || sizes === null) return { ok: false };
    if (srcset !== undefined) attrs.srcset = srcset;
    if (sizes !== undefined) attrs.sizes = sizes;
  } else {
    const poster = optionalText(r['poster'], rules.media.videoPoster);
    if (poster === null) return { ok: false };
    if (poster !== undefined) attrs.poster = poster;
  }
  return { ok: true, attrs };
}
