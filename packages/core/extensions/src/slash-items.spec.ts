import { describe, expect, it } from 'vitest';
import { createExtensionContext } from './context';
import {
  RTE_SLASH_ITEMS,
  RTE_SLASH_LABELS,
  filterSlashItems,
  normalizeForFilter,
  resolveSlashItems,
  resolveSlashLabels,
  slashKeywords,
  slashTitle,
} from './slash-items';
import type { RteSlashItem } from './slash-items';

const IDS = [
  'paragraph',
  'heading2',
  'heading3',
  'heading4',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'table',
  'horizontalRule',
  'callout',
  'pullquote',
  'readAlso',
  'image',
  'video',
  'embed',
];

function ids(items: readonly RteSlashItem[]): string[] {
  return items.map((i) => i.id);
}

function frozenDeep(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return (
    Object.isFrozen(value) && Object.values(value).every((v) => frozenDeep(v))
  );
}

describe('RTE_SLASH_LABELS', () => {
  for (const lang of ['pt-BR', 'en', 'es'] as const) {
    it(`${lang} tem os 17 ids completos`, () => {
      const labels: Record<string, { title: string; keywords: unknown }> =
        RTE_SLASH_LABELS[lang];
      expect(Object.keys(labels)).toEqual(IDS);
      for (const id of IDS) {
        expect(labels[id]?.title?.length).toBeGreaterThan(0);
        expect(Array.isArray(labels[id]?.keywords)).toBe(true);
      }
    });
  }

  it('é congelado em profundidade', () => {
    expect(frozenDeep(RTE_SLASH_LABELS)).toBe(true);
  });
});

describe('RTE_SLASH_ITEMS', () => {
  it('17 itens congelados na ordem do tipo, com grupo e comando', () => {
    expect(ids(RTE_SLASH_ITEMS)).toEqual(IDS);
    expect(Object.isFrozen(RTE_SLASH_ITEMS)).toBe(true);
    expect(RTE_SLASH_ITEMS.every((i) => Object.isFrozen(i))).toBe(true);
    const groups = Object.fromEntries(
      RTE_SLASH_ITEMS.map((i) => [i.id, i.group]),
    );
    expect(groups).toEqual({
      paragraph: 'text',
      heading2: 'text',
      heading3: 'text',
      heading4: 'text',
      bulletList: 'lists',
      orderedList: 'lists',
      taskList: 'lists',
      blockquote: 'blocks',
      codeBlock: 'blocks',
      table: 'blocks',
      horizontalRule: 'blocks',
      callout: 'news',
      pullquote: 'news',
      readAlso: 'news',
      image: 'media',
      video: 'media',
      embed: 'media',
    });
    for (const i of RTE_SLASH_ITEMS) {
      const ui = ['image', 'video', 'embed'].includes(i.id);
      expect(typeof i.command).toBe(ui ? 'undefined' : 'function');
    }
  });
});

describe('resolveSlashItems', () => {
  const resolve = (options = {}) =>
    ids(resolveSlashItems(createExtensionContext(options), undefined));

  it('padrão devolve os 17', () => {
    expect(resolve()).toEqual(IDS);
  });

  it('filtra por recurso', () => {
    expect(resolve({ features: { tables: false } })).not.toContain('table');
    expect(resolve({ embedProviders: [] })).not.toContain('embed');
    const noMedia = resolve({ features: { media: false } });
    expect(noMedia).not.toContain('image');
    expect(noMedia).not.toContain('video');
    expect(noMedia).toContain('embed');
    const noNews = resolve({ features: { newsBlocks: false } });
    for (const id of ['callout', 'pullquote', 'readAlso']) {
      expect(noNews).not.toContain(id);
    }
    expect(resolve({ features: { code: false } })).not.toContain('codeBlock');
    expect(resolve({ features: { tasks: false } })).not.toContain('taskList');
  });

  it('a função items recebe a lista já filtrada', () => {
    const ctx = createExtensionContext({ features: { tables: false } });
    let received: readonly RteSlashItem[] = [];
    const out = resolveSlashItems(ctx, (defaults) => {
      received = defaults;
      return defaults.slice(0, 2);
    });
    expect(ids(received)).not.toContain('table');
    expect(received).toHaveLength(16);
    expect(ids(out)).toEqual(['paragraph', 'heading2']);
  });

  it('array estático substitui os embutidos', () => {
    const ctx = createExtensionContext();
    expect(ids(resolveSlashItems(ctx, [{ id: 'mine' }]))).toEqual(['mine']);
  });

  it('id inválido ou repetido lança TypeError citando o id', () => {
    const ctx = createExtensionContext();
    for (const id of ['Bad', '1a', '', 'a'.repeat(41)]) {
      expect(() => resolveSlashItems(ctx, [{ id }])).toThrow(TypeError);
    }
    expect(() => resolveSlashItems(ctx, [{ id: 'Bad' }])).toThrow(/Bad/);
    expect(() =>
      resolveSlashItems(ctx, [{ id: 'dup' }, { id: 'dup' }]),
    ).toThrow(/dup/);
  });

  it('constructor é aceito e o título é o próprio id', () => {
    const ctx = createExtensionContext();
    const item: RteSlashItem = { id: 'constructor' };
    resolveSlashItems(ctx, [item]);
    const labels = resolveSlashLabels(undefined);
    expect(slashTitle(item, labels)).toBe('constructor');
    expect(slashKeywords(item, labels)).toEqual([]);
  });
});

describe('slashTitle / resolveSlashLabels', () => {
  const en = resolveSlashLabels(undefined);

  it('título do item vence; função inválida vale como ausente', () => {
    expect(slashTitle({ id: 'table', title: 'X' }, en)).toBe('X');
    expect(slashTitle({ id: 'table', title: () => 'Y' }, en)).toBe('Y');
    const throwing = () => {
      throw new Error('x');
    };
    expect(slashTitle({ id: 'table', title: throwing }, en)).toBe('Table');
    const wrong = (() => 1) as unknown as () => string;
    expect(slashTitle({ id: 'table', title: wrong }, en)).toBe('Table');
  });

  it('sobreposição por id; título não string é ignorado', () => {
    const labels = resolveSlashLabels({
      table: { title: 'Grade', keywords: [] },
      callout: { title: 1 as unknown as string, keywords: ['x'] },
    });
    expect(labels.table.title).toBe('Grade');
    expect(labels.callout.title).toBe('Callout');
    expect(labels.callout.keywords).toEqual(['x']);
  });

  it('função é chamada a cada resolução e erros valem como ausentes', () => {
    let n = 0;
    const source = () => {
      n++;
      return { table: { title: `T${n}`, keywords: [] } };
    };
    expect(resolveSlashLabels(source).table.title).toBe('T1');
    expect(resolveSlashLabels(source).table.title).toBe('T2');
    const throwing = () => {
      throw new Error('x');
    };
    expect(resolveSlashLabels(throwing).table.title).toBe('Table');
    expect(resolveSlashLabels((() => 5) as never).table.title).toBe('Table');
  });
});

describe('filterSlashItems', () => {
  const ptBR = resolveSlashLabels(RTE_SLASH_LABELS['pt-BR']);
  const f = (q: string, labels = ptBR) =>
    ids(filterSlashItems(RTE_SLASH_ITEMS, q, labels));

  it('normaliza sem acentos e caixa', () => {
    expect(normalizeForFilter('TÍTulo')).toBe('titulo');
  });

  it('consulta vazia devolve todos na ordem', () => {
    expect(f('')).toEqual(IDS);
  });

  it('pt-BR', () => {
    expect(f('tab')).toEqual(['table']);
    const titles = ['heading2', 'heading3', 'heading4'];
    for (const q of ['tit', 'tít', 'TÍT']) expect(f(q)).toEqual(titles);
    const lists = ['bulletList', 'orderedList', 'taskList'];
    expect(f('lista')).toEqual(lists);
    expect(f('list')).toEqual(lists);
    expect(f('h2')).toEqual(['heading2']);
    expect(f('xyz')).toEqual([]);
  });

  it('en: quote casa blockquote e pullquote; partes do id casam', () => {
    expect(f('quote', resolveSlashLabels(undefined))).toEqual([
      'blockquote',
      'pullquote',
    ]);
    expect(f('horizontal')).toEqual(['horizontalRule']);
    expect(f('also')).toEqual(['readAlso']);
  });

  it('rótulo do consumidor entra no filtro', () => {
    const labels = resolveSlashLabels({
      table: { title: 'Grade', keywords: [] },
    });
    expect(f('gra', labels)).toEqual(['table']);
  });
});
