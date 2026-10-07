import type { RteAttrRule, RteHtmlSchema } from '@cds/rte-core';

/**
 * Regras de URL e de idioma das mídias, lidas do esquema do editor (V4,
 * pré-voo 3): os diálogos validam com a mesma regra que o editor e o
 * sanitizador aplicam. Fica no *chunk* principal e chega ao `RteDialogs` por
 * entrada.
 */
export interface RteMediaRules {
  readonly imageSrc: RteAttrRule;
  readonly videoSrc: RteAttrRule;
  readonly videoPoster: RteAttrRule;
  readonly trackSrc: RteAttrRule;
  readonly trackLang: RteAttrRule;
}

/** Regras das mídias do esquema; `null` se faltar alguma (`media` desligado). */
export function readMediaRules(schema: RteHtmlSchema): RteMediaRules | null {
  const rule = (tag: string, attr: string): RteAttrRule | null =>
    schema.elements[tag]?.attributes[attr]?.rule ?? null;
  const imageSrc = rule('img', 'src');
  const videoSrc = rule('video', 'src');
  const videoPoster = rule('video', 'poster');
  const trackSrc = rule('track', 'src');
  const trackLang = rule('track', 'srclang');
  if (!imageSrc || !videoSrc || !videoPoster || !trackSrc || !trackLang) {
    return null;
  }
  return { imageSrc, videoSrc, videoPoster, trackSrc, trackLang };
}
