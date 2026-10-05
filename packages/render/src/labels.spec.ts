import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  RTE_RENDER_LABELS_ES,
  RTE_RENDER_LABELS_PT_BR,
} from '@cds/rte-render/i18n';
import { describe, expect, it } from 'vitest';
import {
  mergeRenderLabels,
  RTE_RENDER_LABELS,
  RTE_RENDER_LABELS_EN,
} from './labels';
import { provideRteRender } from './provide';

describe('rótulos (R12)', () => {
  it.each([
    ['en', RTE_RENDER_LABELS_EN, 'Table of contents', 'Scrollable table'],
    [
      'pt-BR',
      RTE_RENDER_LABELS_PT_BR,
      'Sumário',
      'Tabela com rolagem horizontal',
    ],
    [
      'es',
      RTE_RENDER_LABELS_ES,
      'Índice',
      'Tabla con desplazamiento horizontal',
    ],
  ])('%s tem exatamente toc e tableScroller', (_n, labels, toc, scroller) => {
    expect(Object.keys(labels).sort()).toEqual(['tableScroller', 'toc']);
    expect(labels).toEqual({ toc, tableScroller: scroller });
    expect(Object.isFrozen(labels)).toBe(true);
  });

  it('mergeRenderLabels ignora valores que não são string', () => {
    expect(
      mergeRenderLabels(RTE_RENDER_LABELS_EN, {
        toc: 'X',
        tableScroller: 1 as never,
      }),
    ).toEqual({ toc: 'X', tableScroller: 'Scrollable table' });
  });

  it('string vazia cai na base e undefined é aceito', () => {
    expect(
      mergeRenderLabels(RTE_RENDER_LABELS_EN, undefined, { toc: '' }),
    ).toEqual({ ...RTE_RENDER_LABELS_EN });
  });

  it('provideRteRender mescla os rótulos sobre o inglês', () => {
    TestBed.configureTestingModule({
      providers: [provideRteRender({ labels: { toc: 'Y' } })],
    });
    const labels = TestBed.runInInjectionContext(() =>
      inject(RTE_RENDER_LABELS),
    );
    expect(labels).toEqual({ toc: 'Y', tableScroller: 'Scrollable table' });
  });

  it('sem provider vale o inglês', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(RTE_RENDER_LABELS)).toBe(RTE_RENDER_LABELS_EN);
  });
});
