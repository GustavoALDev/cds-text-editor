// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público
import * as api from '@cds/rte-render';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público
import type {
  RteRenderLabels,
  RteRenderMode,
  RteRenderOptions,
  RteSanitizeErrorLike,
} from '@cds/rte-render';
import * as toc from '@cds/rte-render/toc';
import type { RteTocEntry } from '@cds/rte-render/toc';
import * as i18n from '@cds/rte-render/i18n';
import { describe, expect, it } from 'vitest';

describe('@cds/rte-render', () => {
  it('exporta só a API pública do entry .', () => {
    expect(Object.keys(api).sort()).toEqual([
      'RTE_RENDER_LABELS',
      'RTE_RENDER_LABELS_EN',
      'RteContent',
      'provideRteRender',
      'ɵinjectFragmentBase',
      'ɵmergeRenderLabels',
    ]);
  });

  it('o /toc exporta só o RteToc (Ruling 11)', () => {
    expect(Object.keys(toc)).toEqual(['RteToc']);
  });

  it('o /i18n exporta os rótulos pt-BR e es', () => {
    expect(Object.keys(i18n).sort()).toEqual([
      'RTE_RENDER_LABELS_ES',
      'RTE_RENDER_LABELS_PT_BR',
    ]);
  });

  it('os tipos da API compilam', () => {
    const mode: RteRenderMode = 'trusted';
    const labels: RteRenderLabels = { toc: 'a', tableScroller: 'b' };
    const options: RteRenderOptions = {
      sanitize: (html) => html,
      fragmentLinks: 'keep',
      labels: { toc: 'x' },
    };
    const error: RteSanitizeErrorLike = {
      name: 'RteSanitizeError',
      code: 'max-depth',
      limit: 1,
      message: 'm',
    };
    const entry: RteTocEntry = { id: 'rt-a', text: 'A', level: 2 };
    expect([
      mode,
      labels.toc,
      options.fragmentLinks,
      error.code,
      entry.id,
    ]).toEqual(['trusted', 'a', 'keep', 'max-depth', 'rt-a']);
  });
});
