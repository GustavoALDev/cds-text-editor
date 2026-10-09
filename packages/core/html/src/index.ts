/**
 * Leitura do HTML gravado sem DOM: texto simples, sumário e validação contra o esquema.
 *
 * @packageDocumentation
 */

export { htmlToText } from './html-to-text';
export type { RteHtmlToTextOptions } from './html-to-text';
export { extractToc } from './extract-toc';
export type { RteTocEntry, RteExtractTocOptions } from './extract-toc';
export { validateHtml } from './validate-html';
export type { RteHtmlViolation, RteValidateHtmlOptions } from './validate-html';
export { inspectRteHtml } from './inspect-rte-html';
export type { RteHtmlInspection } from './inspect-rte-html';
export type { RteHeadingLevel } from '../../src/headings';
export type {
  RteAttrRule,
  RteAttrSpec,
  RteElementSpec,
  RteFeatureId,
  RteHtmlSchema,
  RtePaletteColor,
  RteUrlRule,
} from '../../src/schema/types';
