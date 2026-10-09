/**
 * Esquema do HTML gravado, política de links, títulos, texto, imagem, rascunho e paleta do editor de texto rico, sem dependência de DOM nem de framework.
 *
 * @packageDocumentation
 */

export { getHtmlSchema, RTE_DEFAULT_ID_PREFIX } from './schema/get-html-schema';
export {
  normalizeAttribute,
  matchesRule,
  serializeTokens,
} from './schema/rules';
export type { RteTokensRule } from './schema/rules';
export { isAllowedUrl } from './schema/url';
export { isAllowedClass } from './schema/classes';
export { sanitizeStyle, applyStyleFrom } from './schema/style';
export { RTE_STYLE_PROPERTIES } from './schema/style-properties';
export {
  getElementSpec,
  sanitizeClass,
  sanitizeAttributes,
  hasRequiredChild,
} from './schema/interpret';
export type { RteSanitizedAttributes } from './schema/interpret';
export { escapeHtmlText, escapeHtmlAttribute } from './schema/escape';
export { RTE_TEXT_COLORS, RTE_HIGHLIGHT_COLORS } from './schema/palette';
export type {
  RteHtmlSchema,
  RteHtmlSchemaOptions,
  RteSchemaLinkPolicy,
  RteElementSpec,
  RteAttrSpec,
  RteAttrRule,
  RteUrlRule,
  RteFeatureId,
  RteFeatures,
  RtePaletteColor,
  RteEmbedProvider,
} from './schema/types';

export {
  normalizeHref,
  getLinkAttributes,
  RTE_DEFAULT_LINK_POLICY,
} from './links';
export type { RteLinkPolicy } from './links';

export { slugify, createHeadingIds } from './headings';
export type { RteHeadingLevel } from './headings';
export { countCharacters, countWords, readingTime } from './text';

export { computeResize, parseSrcset, formatSrcset } from './image';

export {
  getTableSizing,
  parseColWidth,
  RTE_TABLE_CELL_MIN_WIDTH,
} from './table-sizing';
export type { RteTableSizing } from './table-sizing';
export type {
  RteResizeCorner,
  RteResizeInput,
  RteSrcsetCandidate,
} from './image';

export {
  clearLocalDrafts,
  createDraftStore,
  createLocalDraftStorage,
  createMemoryDraftStorage,
} from './draft';
export type {
  RteDraftStorage,
  RteDraftStoreOptions,
  RteDraftStore,
} from './draft';
