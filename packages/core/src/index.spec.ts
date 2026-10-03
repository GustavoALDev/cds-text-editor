import { describe, expect, it } from 'vitest';
import * as main from './index';
import * as embeds from '../embeds/src/index';
import * as html from '../html/src/index';

const MAIN = [
  'CORE_VERSION',
  'getHtmlSchema',
  'DEFAULT_ID_PREFIX',
  'normalizeAttribute',
  'matchesRule',
  'isAllowedUrl',
  'serializeTokens',
  'sanitizeStyle',
  'applyStyleFrom',
  'RTE_TEXT_COLORS',
  'RTE_HIGHLIGHT_COLORS',
  'normalizeHref',
  'getLinkAttributes',
  'DEFAULT_LINK_POLICY',
  'slugify',
  'createHeadingIds',
  'countWords',
  'readingTime',
  'computeResize',
  'parseSrcset',
  'formatSrcset',
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
    expect(CORE_VERSION_OK()).toBe(true);
  });

  it('não exporta internos', () => {
    for (const n of INTERNAL) {
      expect((main as Record<string, unknown>)[n], n).toBeUndefined();
    }
  });

  it('/embeds exporta toEmbed e provedores, sem internos', () => {
    for (const n of [
      'toEmbed',
      'DEFAULT_EMBED_PROVIDERS',
      'YOUTUBE_PROVIDER',
      'VIMEO_PROVIDER',
      'SPOTIFY_PROVIDER',
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

function CORE_VERSION_OK(): boolean {
  return main.CORE_VERSION === '0.0.0';
}
