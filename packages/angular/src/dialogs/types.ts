/** Diálogos que o editor sabe abrir (`RteEditor.openDialog`). */
export type RteDialogKind =
  'link' | 'lang' | 'quoteAuthor' | 'table' | 'image' | 'video' | 'embed';

/** Diálogos de mídia (05c1) e o tipo de nó que cada um edita. */
export type RteMediaDialogKind = 'image' | 'video' | 'embed';

/** Nó do editor de cada diálogo de mídia (V2). */
export const RTE_MEDIA_NODES: Readonly<Record<RteMediaDialogKind, string>> =
  Object.freeze({ image: 'rtImage', video: 'rtVideo', embed: 'rtEmbed' });

/** Idiomas oferecidos no diálogo de idioma, antes de "Outro…" (códigos BCP 47). */
export const RTE_DIALOG_LANGUAGES = Object.freeze([
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'la',
  'ja',
  'zh',
  'ru',
  'ar',
  'he',
] as const);
