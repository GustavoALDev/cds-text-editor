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

const SIX: RteFloatingMenuKind[] = [
  'image',
  'video',
  'embed',
  'link',
  'text',
  'table',
];
const without = (...out: RteFloatingMenuKind[]) =>
  SIX.filter((k) => !out.includes(k));

describe('tipos dos menus flutuantes', () => {
  it('RTE_FLOATING_KINDS e RTE_FLOATING_FEATURE', () => {
    expect([...RTE_FLOATING_KINDS]).toEqual(SIX);
    expect(Object.isFrozen(RTE_FLOATING_KINDS)).toBe(true);
    expect(RTE_FLOATING_FEATURE).toEqual({
      image: 'media',
      video: 'media',
      embed: 'embeds',
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
    expect(run(undefined, undefined)).toEqual(SIX);
    expect(run(false, undefined)).toEqual([]);
    expect(run(true, { table: false })).toEqual(SIX);
    expect(run({ table: false }, undefined)).toEqual(without('table'));
    expect(run({ text: true }, { text: false, link: false })).toEqual(
      without('link'),
    );
    expect(run({ link: true }, false)).toEqual(['link']);
    expect(run({ table: 'x' }, { table: false })).not.toContain('table');
    expect(run(undefined, false)).toEqual([]);
    expect(run(undefined, { image: false })).toEqual(without('image'));
  });

  it('vídeo e embed desligam só o próprio tipo (R8)', () => {
    expect(run({ video: false }, undefined)).toEqual(without('video'));
    expect(run(undefined, { embed: false })).toEqual(without('embed'));
    expect(run({ video: true }, { video: false, embed: false })).toEqual(
      without('embed'),
    );
  });

  it('tipo com recurso desligado fica fora', () => {
    expect(
      run(
        undefined,
        undefined,
        ALL.filter((f) => f !== 'media'),
      ),
    ).toEqual(['embed', 'link', 'text', 'table']);
    expect(
      run(
        undefined,
        undefined,
        ALL.filter((f) => f !== 'embeds'),
      ),
    ).toEqual(without('embed'));
    expect(
      run(
        undefined,
        undefined,
        ALL.filter((f) => f !== 'tables'),
      ),
    ).toEqual(without('table'));
    expect(run(true, undefined, ['base'])).toEqual(['link', 'text']);
  });

  it('configuração inválida liga todos e avisa uma vez', () => {
    const warned = new Set<string>();
    expect(run('x', undefined, ALL, warned)).toEqual(SIX);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[rte-editor] floatingMenus inválido; usando todos ligados.',
    );
    run('x', undefined, ALL, warned);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('camada inválida é ignorada sozinha; a válida vale (m2)', () => {
    expect(run('x', { table: false })).toEqual(without('table'));
    expect(run({ link: false }, null)).toEqual(without('link'));
    expect(warn).toHaveBeenCalledTimes(2);
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
