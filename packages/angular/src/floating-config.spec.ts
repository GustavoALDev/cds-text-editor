import type { RteFeatureId } from '@cds/rte-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  floatingItemIds,
  RTE_FLOATING_TEXT_ITEMS,
  resolveFloatingKinds,
  sameKinds,
} from './floating/config';
import {
  RTE_FLOATING_FEATURE,
  RTE_FLOATING_KINDS,
  type RteFloatingMenuKind,
  type RteFloatingMenusConfig,
} from './floating/types';

const ALL: readonly RteFeatureId[] = [
  'base',
  'links',
  'colors',
  'code',
  'tables',
  'tasks',
  'media',
  'embeds',
  'newsBlocks',
];

const FOUR: RteFloatingMenuKind[] = ['image', 'link', 'text', 'table'];

describe('tipos dos menus flutuantes', () => {
  it('RTE_FLOATING_KINDS e RTE_FLOATING_FEATURE', () => {
    expect([...RTE_FLOATING_KINDS]).toEqual(FOUR);
    expect(Object.isFrozen(RTE_FLOATING_KINDS)).toBe(true);
    expect(RTE_FLOATING_FEATURE).toEqual({
      image: 'media',
      link: null,
      text: null,
      table: 'tables',
    });
    expect(Object.isFrozen(RTE_FLOATING_FEATURE)).toBe(true);
  });
});

describe('resolveFloatingKinds', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const run = (
    instance: unknown,
    provider: unknown,
    features: readonly RteFeatureId[] = ALL,
    warned = new Set<string>(),
  ) =>
    resolveFloatingKinds(
      instance as RteFloatingMenusConfig | undefined,
      provider as RteFloatingMenusConfig | undefined,
      features,
      warned,
    );

  it('tabela de casos', () => {
    expect(run(undefined, undefined)).toEqual(FOUR);
    expect(run(false, undefined)).toEqual([]);
    expect(run(true, { table: false })).toEqual(FOUR);
    expect(run({ table: false }, undefined)).toEqual(['image', 'link', 'text']);
    expect(run({ text: true }, { text: false, link: false })).toEqual([
      'image',
      'text',
      'table',
    ]);
    expect(run({ link: true }, false)).toEqual(['link']);
    expect(run({ table: 'x' }, { table: false })).not.toContain('table');
    expect(run(undefined, false)).toEqual([]);
    expect(run(undefined, { image: false })).toEqual(['link', 'text', 'table']);
  });

  it('tipo com recurso desligado fica fora', () => {
    expect(
      run(
        undefined,
        undefined,
        ALL.filter((f) => f !== 'media'),
      ),
    ).toEqual(['link', 'text', 'table']);
    expect(
      run(
        undefined,
        undefined,
        ALL.filter((f) => f !== 'tables'),
      ),
    ).toEqual(['image', 'link', 'text']);
    expect(run(true, undefined, ['base'])).toEqual(['link', 'text']);
  });

  it('configuração inválida liga todos e avisa uma vez', () => {
    const warned = new Set<string>();
    expect(run('x', undefined, ALL, warned)).toEqual(FOUR);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[rte-editor] floatingMenus inválido; usando todos ligados.',
    );
    run('x', undefined, ALL, warned);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('sameKinds', () => {
  it('compara por conteúdo e ordem', () => {
    expect(sameKinds(['link', 'text'], ['link', 'text'])).toBe(true);
    expect(sameKinds(['link', 'text'], ['text', 'link'])).toBe(false);
    expect(sameKinds(['link'], ['link', 'text'])).toBe(false);
    expect(sameKinds([], [])).toBe(true);
  });
});

describe('floatingItemIds', () => {
  it('os itens do menu de texto', () => {
    expect([...RTE_FLOATING_TEXT_ITEMS]).toEqual([
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'link',
    ]);
    expect(floatingItemIds(['text'])).toEqual(RTE_FLOATING_TEXT_ITEMS);
    expect(floatingItemIds(['link', 'table'])).toEqual([]);
  });
});
