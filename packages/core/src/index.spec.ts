import { describe, expect, it } from 'vitest';
import * as main from './index';
import * as embeds from '../embeds/src/index';
import * as html from '../html/src/index';

const MAIN = [
  'getHtmlSchema',
  'RTE_DEFAULT_ID_PREFIX',
  'normalizeAttribute',
  'matchesRule',
  'isAllowedUrl',
  'serializeTokens',
  'sanitizeStyle',
  'applyStyleFrom',
  'RTE_STYLE_PROPERTIES',
  'getElementSpec',
  'sanitizeClass',
  'sanitizeAttributes',
  'hasRequiredChild',
  'escapeHtmlText',
  'escapeHtmlAttribute',
  'getElementSpec',
  'sanitizeClass',
  'sanitizeAttributes',
  'hasRequiredChild',
  'escapeHtmlText',
  'escapeHtmlAttribute',
  'RTE_TEXT_COLORS',
  'RTE_HIGHLIGHT_COLORS',
  'normalizeHref',
  'getLinkAttributes',
  'RTE_DEFAULT_LINK_POLICY',
  'slugify',
  'createHeadingIds',
  'countCharacters',
  'countWords',
  'readingTime',
  'computeResize',
  'parseSrcset',
  'formatSrcset',
  'getTableSizing',
  'parseColWidth',
  'RTE_TABLE_CELL_MIN_WIDTH',
  'clearLocalDrafts',
  'createDraftStore',
  'createLocalDraftStorage',
  'createMemoryDraftStorage',
];
const INTERNAL = [
  'renderHtmlSchemaMarkdown',
  'mergeElements',
  'getFeatureElements',
  'REL_VALUES',
  'normalizeHosts',
  'normalizeRelTokens',
  'assertIdPrefix',
  'baseFeature',
  'linksFeature',
  'embedsFeature',
];

describe('API pública do @cds/rte-core', () => {
  it('exporta a lista pública', () => {
    for (const n of MAIN) {
      expect(typeof (main as Record<string, unknown>)[n], n).not.toBe(
        'undefined',
      );
    }
  });

  it('não exporta a constante de versão (a versão vem do package.json)', () => {
    expect(main).not.toHaveProperty('CORE_VERSION');
  });

  it('não exporta internos', () => {
    for (const n of INTERNAL) {
      expect((main as Record<string, unknown>)[n], n).toBeUndefined();
    }
  });

  it('/embeds exporta toEmbed e provedores, sem internos', () => {
    for (const n of [
      'toEmbed',
      'RTE_EMBED_PROVIDERS',
      'RTE_YOUTUBE_PROVIDER',
      'RTE_VIMEO_PROVIDER',
      'RTE_SPOTIFY_PROVIDER',
      'assertEmbedProvider',
    ]) {
      expect(typeof (embeds as Record<string, unknown>)[n], n).not.toBe(
        'undefined',
      );
    }
    expect(
      (embeds as Record<string, unknown>)['mergeElements'],
    ).toBeUndefined();
  });

  it('/html exporta htmlToText e extractToc, sem internos', () => {
    expect(typeof html.htmlToText).toBe('function');
    expect(typeof html.extractToc).toBe('function');
    for (const n of ['walkHtml', 'resolveMaxDepth', 'DEFAULT_MAX_DEPTH']) {
      expect((html as Record<string, unknown>)[n], n).toBeUndefined();
    }
  });
});
