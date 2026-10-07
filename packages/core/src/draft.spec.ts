import { afterEach, describe, expect, it } from 'vitest';
import {
  clearLocalDrafts,
  createDraftStore,
  createLocalDraftStorage,
  createMemoryDraftStorage,
  type DraftStorage,
} from './draft';

const DAY = 24 * 60 * 60 * 1000;

function setup(opts: { now?: number; maxAgeMs?: number } = {}) {
  const storage = createMemoryDraftStorage();
  let t = opts.now ?? 1_000_000;
  const store = createDraftStore({
    storage,
    key: 'k',
    maxAgeMs: opts.maxAgeMs,
    now: () => t,
  });
  return {
    storage,
    store,
    setNow: (n: number) => {
      t = n;
    },
  };
}

describe('createDraftStore', () => {
  it('salva e carrega o mesmo html com o savedAt do now; clear apaga', () => {
    const { store, storage } = setup();
    expect(store.save('<p>oi</p>')).toBe(true);
    expect(store.load()).toEqual({ html: '<p>oi</p>', savedAt: 1_000_000 });
    store.clear();
    expect(store.load()).toBeNull();
    expect(storage.get('k')).toBeNull();
  });

  it('load sem nada salvo devolve null', () => {
    expect(setup().store.load()).toBeNull();
  });

  const invalid: [string, string][] = [
    ['JSON inválido', '{nope'],
    [
      'v diferente de 1',
      JSON.stringify({ v: 2, savedAt: 1_000_000, html: 'x' }),
    ],
    ['html não string', JSON.stringify({ v: 1, savedAt: 1_000_000, html: 5 })],
    ['savedAt não finito', JSON.stringify({ v: 1, savedAt: 'x', html: 'x' })],
    ['savedAt nulo', JSON.stringify({ v: 1, savedAt: null, html: 'x' })],
    ['JSON null', 'null'],
    ['JSON array', '[]'],
    [
      'no futuro (> 60 s)',
      JSON.stringify({ v: 1, savedAt: 1_000_000 + 60_001, html: 'x' }),
    ],
    [
      'expirado',
      JSON.stringify({ v: 1, savedAt: 1_000_000 - 7 * DAY - 1, html: 'x' }),
    ],
  ];
  it.each(invalid)('load devolve null e remove a chave: %s', (_n, raw) => {
    const { store, storage } = setup();
    storage.set('k', raw);
    expect(store.load()).toBeNull();
    expect(storage.get('k')).toBeNull();
  });

  it('aceita futuro até 60 s e idade exatamente maxAgeMs', () => {
    const { store, storage } = setup();
    storage.set(
      'k',
      JSON.stringify({ v: 1, savedAt: 1_000_000 + 60_000, html: 'a' }),
    );
    expect(store.load()?.html).toBe('a');
    storage.set(
      'k',
      JSON.stringify({ v: 1, savedAt: 1_000_000 - 7 * DAY, html: 'b' }),
    );
    expect(store.load()?.html).toBe('b');
  });

  it('respeita maxAgeMs customizado e expira com o passar do tempo', () => {
    const { store, setNow } = setup({ maxAgeMs: 1000 });
    store.save('x');
    setNow(1_001_000);
    expect(store.load()).not.toBeNull();
    setNow(1_001_001);
    expect(store.load()).toBeNull();
  });

  it('save devolve false se storage.set lança; load devolve null se get lança', () => {
    const bad: DraftStorage = {
      get() {
        throw new Error('x');
      },
      set() {
        throw new Error('quota');
      },
      remove() {
        throw new Error('x');
      },
    };
    const store = createDraftStore({ storage: bad, key: 'k' });
    expect(store.save('<p/>')).toBe(false);
    expect(store.load()).toBeNull();
    expect(() => store.clear()).not.toThrow();
  });

  it('load não lança se remove lançar ao descartar envelope inválido', () => {
    const storage: DraftStorage = {
      get: () => '{nope',
      set: () => undefined,
      remove() {
        throw new Error('x');
      },
    };
    expect(createDraftStore({ storage, key: 'k' }).load()).toBeNull();
  });

  it('valida key, maxAgeMs e html', () => {
    const storage = createMemoryDraftStorage();
    expect(() => createDraftStore({ storage, key: '' })).toThrow(TypeError);
    expect(() =>
      createDraftStore({ storage, key: 1 as unknown as string }),
    ).toThrow(TypeError);
    for (const m of [0, -1, NaN, Infinity]) {
      expect(() =>
        createDraftStore({ storage, key: 'k', maxAgeMs: m }),
      ).toThrow(RangeError);
    }
    const store = createDraftStore({ storage, key: 'k' });
    expect(() => store.save(undefined as unknown as string)).toThrow(TypeError);
    expect(storage.get('k')).toBeNull();
  });

  it('now padrão usa Date.now', () => {
    const store = createDraftStore({
      storage: createMemoryDraftStorage(),
      key: 'k',
    });
    const before = Date.now();
    store.save('x');
    const at = store.load()?.savedAt ?? 0;
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });
});

describe('createMemoryDraftStorage', () => {
  it('get/set/remove', () => {
    const s = createMemoryDraftStorage();
    expect(s.get('a')).toBeNull();
    s.set('a', '1');
    expect(s.get('a')).toBe('1');
    s.remove('a');
    expect(s.get('a')).toBeNull();
  });
});

describe('createLocalDraftStorage', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g['localStorage'];
  });

  function roundTrip(s: DraftStorage) {
    s.set('a', '1');
    expect(s.get('a')).toBe('1');
    s.remove('a');
    expect(s.get('a')).toBeNull();
  }

  it('sem localStorage (Node) funciona em memória', () => {
    delete g['localStorage'];
    roundTrip(createLocalDraftStorage());
  });

  it('getter que lança cai para memória', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    roundTrip(createLocalDraftStorage());
  });

  it('setItem que lança na sonda cai para memória', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem() {
          throw new Error('Quota');
        },
        removeItem: () => undefined,
      },
    });
    roundTrip(createLocalDraftStorage());
  });

  it('com localStorage falso funcional, grava nele (e limpa a sonda)', () => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    });
    const s = createLocalDraftStorage();
    expect(data.size).toBe(0);
    s.set('a', '1');
    expect(data.get('a')).toBe('1');
    expect(s.get('a')).toBe('1');
    s.remove('a');
    expect(data.size).toBe(0);
  });

  it('erros em tempo de chamada viram false/null no store', () => {
    let fail = false;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem() {
          if (fail) throw new Error('x');
          return null;
        },
        setItem() {
          if (fail) throw new Error('QuotaExceededError');
        },
        removeItem() {
          if (fail) throw new Error('x');
        },
      },
    });
    const store = createDraftStore({
      storage: createLocalDraftStorage(),
      key: 'k',
    });
    fail = true;
    expect(store.save('x')).toBe(false);
    expect(store.load()).toBeNull();
    expect(() => store.clear()).not.toThrow();
  });
});

describe('clearLocalDrafts', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g['localStorage'];
  });

  function fakeStorage(entries: Record<string, string>) {
    const data = new Map(Object.entries(entries));
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        get length() {
          return data.size;
        },
        key: (i: number) => [...data.keys()][i] ?? null,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    });
    return data;
  }

  it('apaga só as chaves com o prefixo e devolve a contagem', () => {
    const data = fakeStorage({
      'rte-draft:a': '1',
      'rte-draft:b': '2',
      'rte-draft:c': '3',
      outra: '4',
    });
    expect(clearLocalDrafts()).toBe(3);
    expect([...data.keys()]).toEqual(['outra']);
  });

  it('aceita prefixo customizado', () => {
    const data = fakeStorage({ 'x:a': '1', 'rte-draft:b': '2' });
    expect(clearLocalDrafts('x:')).toBe(1);
    expect([...data.keys()]).toEqual(['rte-draft:b']);
  });

  it('sem localStorage ou com getter que lança devolve 0', () => {
    expect(clearLocalDrafts()).toBe(0);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqueado');
      },
    });
    expect(clearLocalDrafts()).toBe(0);
  });

  it('erro durante a varredura devolve o que apagou sem lançar', () => {
    fakeStorage({ 'rte-draft:a': '1' });
    const ls = g['localStorage'] as Storage;
    ls.removeItem = () => {
      throw new Error('x');
    };
    expect(() => clearLocalDrafts()).not.toThrow();
  });
});
