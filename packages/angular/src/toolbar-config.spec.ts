// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RTE_TOOLBAR_PRESETS } from '@cds/rte-angular';
import type { RteFeatureId } from '@cds/rte-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickToolbarConfig, resolveToolbarGroups } from './toolbar/config';
import {
  RTE_TOOLBAR_ITEMS,
  type RteToolbarItemId,
  type RteToolbarConfig,
} from './toolbar/items';

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

function ctx(
  overrides: Partial<{
    features: readonly RteFeatureId[];
    hasCodeLanguages: boolean;
  }> = {},
) {
  return {
    features: ALL,
    hasCodeLanguages: true,
    warned: new Set<string>(),
    ...overrides,
  };
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return (
    Object.isFrozen(value) &&
    Object.values(value).every((child) => isDeepFrozen(child))
  );
}

describe('RTE_TOOLBAR_PRESETS', () => {
  it('tem os literais da U9', () => {
    expect(RTE_TOOLBAR_PRESETS).toEqual({
      minimal: [
        ['undo', 'redo'],
        ['bold', 'italic'],
        ['bulletList', 'orderedList'],
      ],
      article: [
        ['undo', 'redo'],
        ['blockType'],
        ['bold', 'italic', 'underline', 'strike'],
        ['textColor', 'highlight'],
        ['bulletList', 'orderedList', 'taskList'],
        ['align'],
        ['blockquote', 'codeBlock', 'horizontalRule'],
        ['table'],
        ['clearFormatting'],
      ],
      full: [
        ['undo', 'redo'],
        ['blockType'],
        [
          'bold',
          'italic',
          'underline',
          'strike',
          'code',
          'superscript',
          'subscript',
        ],
        ['textColor', 'highlight'],
        ['bulletList', 'orderedList', 'taskList', 'indent', 'outdent'],
        ['align'],
        ['blockquote', 'codeBlock', 'codeLanguage', 'horizontalRule'],
        ['table'],
        ['callout', 'pullquote', 'readAlso'],
        ['clearFormatting'],
      ],
    });
  });

  it('é congelado em todos os níveis', () => {
    expect(isDeepFrozen(RTE_TOOLBAR_PRESETS)).toBe(true);
  });

  it('todo item dos presets existe em RTE_TOOLBAR_ITEMS', () => {
    for (const groups of Object.values(RTE_TOOLBAR_PRESETS))
      for (const id of groups.flat())
        expect(RTE_TOOLBAR_ITEMS[id]).toBeDefined();
  });
});

describe('pickToolbarConfig', () => {
  it('prioridade entrada > provider > article', () => {
    expect(pickToolbarConfig(undefined, 'minimal')).toBe('minimal');
    expect(pickToolbarConfig('full', 'minimal')).toBe('full');
    expect(pickToolbarConfig(undefined, undefined)).toBe('article');
    expect(pickToolbarConfig(false, 'minimal')).toBe(false);
  });
});

describe('resolveToolbarGroups', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('full com todos os recursos devolve os grupos do preset', () => {
    expect(resolveToolbarGroups('full', ctx())).toEqual(
      RTE_TOOLBAR_PRESETS.full,
    );
    const article = resolveToolbarGroups('article', ctx());
    expect(article).toEqual(RTE_TOOLBAR_PRESETS.article);
    expect(warn).not.toHaveBeenCalled();
  });

  it('full acrescenta os itens ao article', () => {
    const full = resolveToolbarGroups('full', ctx());
    expect(full[2]).toEqual([
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'superscript',
      'subscript',
    ]);
    expect(full[4]).toEqual([
      'bulletList',
      'orderedList',
      'taskList',
      'indent',
      'outdent',
    ]);
    expect(full[6]).toContain('codeLanguage');
    expect(full[full.length - 2]).toEqual(['callout', 'pullquote', 'readAlso']);
    expect(full[full.length - 1]).toEqual(['clearFormatting']);
  });

  it('ignora desconhecido e repetido com um aviso por id', () => {
    const warned = new Set<string>();
    const input = [
      ['bold', 'x', 'bold'],
      ['italic', 'bold'],
    ] as unknown as RteToolbarConfig;
    const c = { features: ALL, hasCodeLanguages: true, warned };
    expect(resolveToolbarGroups(input, c)).toEqual([['bold'], ['italic']]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      '[rte-editor] item de barra desconhecido ignorado: "x".',
    );
    expect(warn).toHaveBeenCalledWith(
      '[rte-editor] item de barra repetido ignorado: "bold".',
    );
    warn.mockClear();
    resolveToolbarGroups(input, c);
    expect(warn).not.toHaveBeenCalled();
  });

  const gated: [string, RteFeatureId, RteToolbarItemId[]][] = [
    ['colors', 'colors', ['textColor', 'highlight']],
    ['tasks', 'tasks', ['taskList']],
    ['code', 'code', ['codeBlock', 'codeLanguage']],
    ['tables', 'tables', ['table']],
    ['newsBlocks', 'newsBlocks', ['callout', 'pullquote', 'readAlso']],
  ];
  it.each(gated)(
    'recurso %s desligado remove exatamente os seus itens',
    (_n, feature, items) => {
      const features = ALL.filter((f) => f !== feature);
      const before = RTE_TOOLBAR_PRESETS.full.flat();
      const after = resolveToolbarGroups('full', ctx({ features })).flat();
      expect(before.filter((id) => !after.includes(id)).sort()).toEqual(
        [...items].sort(),
      );
      expect(after.length).toBe(before.length - items.length);
    },
  );

  it('cada item de recurso na tabela declara o recurso certo', () => {
    for (const [, feature, items] of gated)
      for (const id of items)
        expect(RTE_TOOLBAR_ITEMS[id].feature).toBe(feature);
  });

  it('sem codeLanguages remove codeLanguage', () => {
    const out = resolveToolbarGroups(
      'full',
      ctx({ hasCodeLanguages: false }),
    ).flat();
    expect(out).not.toContain('codeLanguage');
    expect(out).toContain('codeBlock');
  });

  it('grupo que fica vazio some', () => {
    expect(
      resolveToolbarGroups([['table']], ctx({ features: ['base'] })),
    ).toEqual([]);
  });

  it('false devolve nada', () => {
    expect(resolveToolbarGroups(false, ctx())).toEqual([]);
  });

  it('entrada inválida cai em article com aviso', () => {
    const out = resolveToolbarGroups('xyz' as never, ctx());
    expect(out).toEqual(RTE_TOOLBAR_PRESETS.article);
    expect(warn).toHaveBeenCalledWith(
      "[rte-editor] toolbar inválido; usando 'article'.",
    );
  });
});
