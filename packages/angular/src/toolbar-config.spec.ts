import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RTE_TOOLBAR_PRESETS, RteEditor } from '@comodeviaser/rte-angular';
import type { Editor } from '@tiptap/core';
import type { RteFeatureId } from '@comodeviaser/rte-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHost, settle } from './testing-support/render';
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
    hasEmbedProviders: boolean;
    search: boolean;
  }> = {},
) {
  return {
    features: ALL,
    hasCodeLanguages: true,
    hasEmbedProviders: true,
    search: true,
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
        ['bold', 'italic', 'link'],
        ['bulletList', 'orderedList'],
      ],
      article: [
        ['undo', 'redo'],
        ['blockType'],
        ['bold', 'italic', 'underline', 'strike', 'link'],
        ['textColor', 'highlight'],
        ['bulletList', 'orderedList', 'taskList'],
        ['align'],
        ['blockquote', 'codeBlock', 'horizontalRule'],
        ['image', 'embed'],
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
          'link',
          'code',
          'superscript',
          'subscript',
          'lang',
        ],
        ['textColor', 'highlight'],
        ['bulletList', 'orderedList', 'taskList', 'indent', 'outdent'],
        ['align'],
        ['blockquote', 'codeBlock', 'codeLanguage', 'horizontalRule'],
        ['image', 'video', 'embed'],
        ['table'],
        ['callout', 'pullquote', 'quoteAuthor', 'readAlso'],
        ['clearFormatting', 'search'],
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
      'link',
      'code',
      'superscript',
      'subscript',
      'lang',
    ]);
    expect(full[4]).toEqual([
      'bulletList',
      'orderedList',
      'taskList',
      'indent',
      'outdent',
    ]);
    expect(full[6]).toContain('codeLanguage');
    expect(full[full.length - 2]).toEqual([
      'callout',
      'pullquote',
      'quoteAuthor',
      'readAlso',
    ]);
    expect(full[full.length - 1]).toEqual(['clearFormatting', 'search']);
  });

  it('ignora desconhecido e repetido com um aviso por id', () => {
    const warned = new Set<string>();
    const input = [
      ['bold', 'x', 'bold'],
      ['italic', 'bold'],
    ] as unknown as RteToolbarConfig;
    const c = {
      features: ALL,
      hasCodeLanguages: true,
      hasEmbedProviders: true,
      search: true,
      warned,
    };
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

  it('ids exóticos (sem protótipo, Symbol, null) avisam sem lançar', () => {
    const bare = Object.create(null) as object;
    const input = [
      ['bold', bare, Symbol('s'), null, 7],
    ] as unknown as RteToolbarConfig;
    expect(() => resolveToolbarGroups(input, ctx())).not.toThrow();
    expect(resolveToolbarGroups(input, ctx())).toEqual([['bold']]);
    const messages = warn.mock.calls.map((args: unknown[]) => String(args[0]));
    expect(messages).toContain(
      '[rte-editor] item de barra desconhecido ignorado: "[object Object]".',
    );
    expect(messages).toContain(
      '[rte-editor] item de barra desconhecido ignorado: "Symbol(s)".',
    );
    expect(messages).toContain(
      '[rte-editor] item de barra desconhecido ignorado: "null".',
    );
  });

  it('grupo que não é array é ignorado com aviso', () => {
    const input = [
      'bold',
      ['italic'],
      Object.create(null),
    ] as unknown as RteToolbarConfig;
    expect(resolveToolbarGroups(input, ctx())).toEqual([['italic']]);
    const messages = warn.mock.calls.map((args: unknown[]) => String(args[0]));
    expect(messages).toEqual([
      '[rte-editor] grupo de barra inválido ignorado (esperado um array): bold.',
      '[rte-editor] grupo de barra inválido ignorado (esperado um array): [object Object].',
    ]);
  });

  const gated: [string, RteFeatureId, RteToolbarItemId[]][] = [
    ['colors', 'colors', ['textColor', 'highlight']],
    ['tasks', 'tasks', ['taskList']],
    ['code', 'code', ['codeBlock', 'codeLanguage']],
    ['tables', 'tables', ['table']],
    ['media', 'media', ['image', 'video']],
    ['embeds', 'embeds', ['embed']],
    [
      'newsBlocks',
      'newsBlocks',
      ['callout', 'pullquote', 'quoteAuthor', 'readAlso', 'lang'],
    ],
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

  it('newsBlocks desligado remove lang e quoteAuthor e mantém link', () => {
    const features = ALL.filter((f) => f !== 'newsBlocks');
    const out = resolveToolbarGroups('full', ctx({ features })).flat();
    expect(out).not.toContain('lang');
    expect(out).not.toContain('quoteAuthor');
    expect(out).toContain('link');
    expect(RTE_TOOLBAR_ITEMS.link).toEqual({ kind: 'dialog', feature: null });
  });

  it('sem codeLanguages remove codeLanguage', () => {
    const out = resolveToolbarGroups(
      'full',
      ctx({ hasCodeLanguages: false }),
    ).flat();
    expect(out).not.toContain('codeLanguage');
    expect(out).toContain('codeBlock');
  });

  it('sem provedores de embed (hasEmbedProviders: false) remove só embed', () => {
    const before = RTE_TOOLBAR_PRESETS.full.flat();
    const after = resolveToolbarGroups(
      'full',
      ctx({ hasEmbedProviders: false }),
    ).flat();
    expect(before.filter((id) => !after.includes(id))).toEqual(['embed']);
    expect(after).toContain('image');
    expect(after).toContain('video');
  });

  it('search: só no full e removido com features.search desligado (K7)', () => {
    expect(RTE_TOOLBAR_ITEMS.search).toEqual({
      kind: 'button',
      feature: 'search',
    });
    expect(RTE_TOOLBAR_PRESETS.minimal.flat()).not.toContain('search');
    expect(RTE_TOOLBAR_PRESETS.article.flat()).not.toContain('search');
    expect(resolveToolbarGroups('full', ctx()).flat()).toContain('search');
    const off = resolveToolbarGroups('full', ctx({ search: false })).flat();
    expect(off).not.toContain('search');
    expect(off).toContain('clearFormatting');
    expect(resolveToolbarGroups([['search']], ctx({ search: false }))).toEqual(
      [],
    );
  });

  it('itens de mídia: diálogos dos recursos media/embeds', () => {
    expect(RTE_TOOLBAR_ITEMS.image).toEqual({
      kind: 'dialog',
      feature: 'media',
    });
    expect(RTE_TOOLBAR_ITEMS.video).toEqual({
      kind: 'dialog',
      feature: 'media',
    });
    expect(RTE_TOOLBAR_ITEMS.embed).toEqual({
      kind: 'dialog',
      feature: 'embeds',
    });
  });

  it('article: media e embeds desligados tiram o grupo de mídia inteiro', () => {
    const features = ALL.filter((f) => f !== 'media' && f !== 'embeds');
    const out = resolveToolbarGroups('article', ctx({ features }));
    expect(out).toEqual(
      RTE_TOOLBAR_PRESETS.article.filter(
        (g) => !(g.includes('image') || g.includes('embed')),
      ),
    );
  });

  it('minimal não muda com mídia ligada ou desligada', () => {
    const on = resolveToolbarGroups('minimal', ctx());
    const off = resolveToolbarGroups(
      'minimal',
      ctx({ features: ['base', 'links'], hasEmbedProviders: false }),
    );
    expect(on).toEqual(RTE_TOOLBAR_PRESETS.minimal);
    expect(off).toEqual(RTE_TOOLBAR_PRESETS.minimal);
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

@Component({
  selector: 'rte-test-live-toolbar',
  imports: [RteEditor],
  template: `<rte-editor
    [toolbar]="toolbar()"
    (valueChange)="changes = changes + 1"
    (editorReady)="ready.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LiveHost {
  readonly toolbar = signal<RteToolbarConfig | undefined>([
    ['bold', 'nope' as RteToolbarItemId],
  ]);
  readonly ready: Editor[] = [];
  changes = 0;
}

describe('toolbar ao vivo no rte-editor (R2)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('trocar toolbar 3× não recria o editor nem emite valor; aviso de id desconhecido sai 1×', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = await renderHost(LiveHost);
    const host = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelectorAll('.rte-toolbar .rte-toolbar__button'),
    ).toHaveLength(1);
    for (const next of [
      'minimal',
      [['italic'], ['bold', 'nope' as RteToolbarItemId]],
      'full',
    ] as const) {
      host.toolbar.set(next);
      await settle(fixture);
    }
    expect(
      el.querySelectorAll('.rte-toolbar .rte-toolbar__button').length,
    ).toBeGreaterThan(20);
    expect(host.ready).toHaveLength(1);
    expect(host.changes).toBe(0);
    const unknown = warn.mock.calls.filter(([message]) =>
      String(message).includes('"nope"'),
    );
    expect(unknown).toHaveLength(1);
  });
});
