export const CORE_VERSION = '0.0.0';

export { getHtmlSchema, DEFAULT_ID_PREFIX } from './schema/get-html-schema';
export {
  normalizeAttribute,
  matchesRule,
  serializeTokens,
} from './schema/rules';
export { isAllowedUrl } from './schema/url';
export { isAllowedClass } from './schema/classes';
export { sanitizeStyle, applyStyleFrom } from './schema/style';
export { RTE_TEXT_COLORS, RTE_HIGHLIGHT_COLORS } from './schema/palette';
export type {
  RteHtmlSchema,
  RteHtmlSchemaOptions,
  RteElementSpec,
  RteAttrSpec,
  RteAttrRule,
  RteUrlRule,
  RteFeatureId,
  RteFeatures,
  RtePaletteColor,
  RteEmbedProvider,
} from './schema/types';

export { normalizeHref, getLinkAttributes, DEFAULT_LINK_POLICY } from './links';
export type { RteLinkPolicy } from './links';

export { slugify, createHeadingIds } from './headings';
export { countCharacters, countWords, readingTime } from './text';

export { computeResize, parseSrcset, formatSrcset } from './image';
export type { RteResizeCorner, RteResizeInput, SrcsetCandidate } from './image';

export {
  clearLocalDrafts,
  createDraftStore,
  createLocalDraftStorage,
  createMemoryDraftStorage,
} from './draft';
export type { DraftStorage, DraftStoreOptions, DraftStore } from './draft';
