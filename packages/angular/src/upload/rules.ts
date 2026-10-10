import type { RteAttrRule, RteHtmlSchema } from '@comodeviaser/rte-core';
import { readMediaRules, type RteMediaRules } from '../dialogs/media-rules';

/** Regras da resposta do adaptador (E6): as de mídia mais `srcset`/`sizes`. */
export interface RteUploadRules {
  readonly media: RteMediaRules;
  readonly imageSrcset: RteAttrRule;
  readonly imageSizes: RteAttrRule;
}

/** Regras do esquema; `null` se faltar alguma (`media` desligado). */
export function readUploadRules(schema: RteHtmlSchema): RteUploadRules | null {
  const media = readMediaRules(schema);
  const img = schema.elements['img']?.attributes;
  const imageSrcset = img?.['srcset']?.rule ?? null;
  const imageSizes = img?.['sizes']?.rule ?? null;
  if (!media || !imageSrcset || !imageSizes) return null;
  return { media, imageSrcset, imageSizes };
}
