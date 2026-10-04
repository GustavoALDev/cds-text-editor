// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as ext from './index';
import * as langs from '../../code-languages/src/index';
import * as core from '../../src/index';
import * as html from '../../html/src/index';
import type {
  RteCalloutVariant,
  RteCharLimitState,
  RteContentLabels,
  RteEditorOptions,
  RteImageAlign,
  RteImageAttrs,
  RtePullquoteAttrs,
  RteSearchOptions,
  RteSearchState,
  RteSlashItem,
  RteSlashItemId,
  RteSlashLabels,
  RteSlashMenuState,
  RteSlashOptions,
  RteTextDirection,
  RteTextStats,
  RteVideoAttrs,
  RteVideoTrack,
} from './index';
import type { RteCodeLanguage } from '../../code-languages/src/index';

describe('API pública do /extensions (spec 03b, §6)', () => {
  it('exporta exatamente os valores previstos', () => {
    expect(Object.keys(ext).sort()).toEqual([
      'RTE_CONTENT_LABELS',
      'RTE_LABELS_META',
      'RTE_SLASH_ITEMS',
      'RTE_SLASH_LABELS',
      'createEditorExtensions',
      'getCharLimitState',
      'getRteHeadings',
      'getRteHtml',
      'getRteTextStats',
      'getSearchState',
      'getSlashMenuState',
      'serializeRteHtml',
    ]);
    expect(ext.RTE_LABELS_META).toBe('rtLabels');
    expect(typeof ext.createEditorExtensions).toBe('function');
    expect(typeof ext.getRteHtml).toBe('function');
    expect(typeof ext.serializeRteHtml).toBe('function');
    expect(typeof ext.getRteHeadings).toBe('function');
    expect(Object.keys(ext.RTE_CONTENT_LABELS).sort()).toEqual([
      'en',
      'es',
      'pt-BR',
    ]);
  });

  it('não vaza internos', () => {
    const names = Object.keys(ext);
    for (const internal of [
      'withRenderDocument',
      'createStringDocument',
      'createExtensionContext',
      'truncateText',
      'computeChangedRanges',
      'createEditor',
      'textStatsProbe',
      'searchProbe',
      'foldCase',
      'cutSlice',
      'resolveSlashItems',
      'searchKey',
      'slashKey',
      'charLimitKey',
    ]) {
      expect(names).not.toContain(internal);
    }
  });

  it('os tipos públicos são utilizáveis', () => {
    const variant: RteCalloutVariant = 'info';
    const align: RteImageAlign = 'full';
    const track: RteVideoTrack = {
      src: 'https://a.test/x.vtt',
      kind: 'captions',
      srclang: 'pt',
      label: 'pt',
    } as RteVideoTrack;
    const image = { src: 'https://a.test/a.png', alt: '' } as RteImageAttrs;
    const video = { src: 'https://a.test/v.mp4' } as RteVideoAttrs;
    const labels = ext.RTE_CONTENT_LABELS.en satisfies RteContentLabels;
    const options: RteEditorOptions = { image: { minWidth: 48 } };
    // Usados nas assinaturas de setPullquote/updatePullquote e setLang.
    const quote: RtePullquoteAttrs = { author: 'A', role: 'Editora' };
    const dir: RteTextDirection = 'rtl';
    const stats: RteTextStats = { characters: 0, words: 0 };
    const limit = { ...stats, limit: null } as unknown as RteCharLimitState;
    const searchOptions: RteSearchOptions = { caseSensitive: true };
    const search = {} as RteSearchState;
    const itemId: RteSlashItemId = 'table';
    const item = {} as RteSlashItem;
    const slashLabels = {} as RteSlashLabels;
    const slashOptions: RteSlashOptions = {};
    const menu = {} as RteSlashMenuState;
    expect([
      stats,
      limit,
      searchOptions,
      search,
      itemId,
      item,
      slashLabels,
      slashOptions,
      menu,
      variant,
      align,
      track,
      image,
      video,
      labels,
      options,
      quote,
      dir,
    ]).toHaveLength(18);
  });
});

describe('API pública do /code-languages', () => {
  it('exporta o catálogo e defineCodeLanguage', () => {
    expect(Object.keys(langs).sort()).toEqual([
      'RTE_CODE_LANGUAGES',
      'defineCodeLanguage',
    ]);
    const sample: RteCodeLanguage | undefined = langs.RTE_CODE_LANGUAGES[0];
    expect(sample).toBeDefined();
  });
});

describe('API herdada da 03a usada pela 03b', () => {
  it('isAllowedClass (entry .) e validateHtml (/html) estão exportados', () => {
    expect(typeof core.isAllowedClass).toBe('function');
    expect(typeof html.validateHtml).toBe('function');
  });
});
