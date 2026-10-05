/** Diálogos que o editor sabe abrir (`RteEditor.openDialog`). */
export type RteDialogKind = 'link' | 'lang' | 'quoteAuthor' | 'table';

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
