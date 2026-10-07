/**
 * Rascunho: persistência do HTML em edição com armazenamento injetável.
 * Em computadores compartilhados, chame `clear()` no logout.
 */

export interface DraftStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface DraftStoreOptions {
  storage: DraftStorage;
  key: string;
  /** Idade máxima do rascunho em ms (padrão: 7 dias). */
  maxAgeMs?: number | undefined;
  /** Relógio injetável (padrão: `Date.now`). */
  now?: (() => number) | undefined;
}

export interface DraftStore {
  /** Devolve `false` se o armazenamento falhar (cota, bloqueio). */
  save(html: string): boolean;
  load(): { html: string; savedAt: number } | null;
  clear(): void;
}

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerância a relógio adiantado. */
const FUTURE_SKEW_MS = 60_000;
const PROBE_KEY = '__rte_draft_probe__';

export function createMemoryDraftStorage(): DraftStorage {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

type WebStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * `localStorage` quando disponível e gravável; senão, memória. O acesso a
 * `globalThis.localStorage` só acontece aqui (nunca no topo do módulo).
 * Erros em tempo de chamada propagam; `createDraftStore` os converte.
 */
export function createLocalDraftStorage(): DraftStorage {
  try {
    const ls = (globalThis as { localStorage?: WebStorageLike }).localStorage;
    if (ls) {
      ls.setItem(PROBE_KEY, '1');
      ls.removeItem(PROBE_KEY);
      return {
        get: (key) => ls.getItem(key),
        set: (key, value) => ls.setItem(key, value),
        remove: (key) => ls.removeItem(key),
      };
    }
  } catch {
    // indisponível ou bloqueado: cai para memória
  }
  return createMemoryDraftStorage();
}

export function createDraftStore(options: DraftStoreOptions): DraftStore {
  const { storage, key } = options;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = options.now ?? Date.now;
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError(
      'createDraftStore: "key" deve ser uma string não vazia',
    );
  }
  if (
    typeof maxAgeMs !== 'number' ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs <= 0
  ) {
    throw new RangeError(
      'createDraftStore: "maxAgeMs" deve ser um número finito positivo',
    );
  }

  const discard = (): void => {
    try {
      storage.remove(key);
    } catch {
      // nada a fazer
    }
  };

  return {
    save(html) {
      if (typeof html !== 'string') {
        throw new TypeError(
          'createDraftStore.save: "html" deve ser uma string',
        );
      }
      try {
        storage.set(key, JSON.stringify({ v: 1, savedAt: now(), html }));
        return true;
      } catch {
        return false;
      }
    },
    load() {
      let raw: string | null;
      try {
        raw = storage.get(key);
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        const env: unknown = JSON.parse(raw);
        if (typeof env === 'object' && env !== null && !Array.isArray(env)) {
          const { v, savedAt, html } = env as Record<string, unknown>;
          if (
            v === 1 &&
            typeof html === 'string' &&
            typeof savedAt === 'number' &&
            Number.isFinite(savedAt)
          ) {
            const age = now() - savedAt;
            if (age <= maxAgeMs && age >= -FUTURE_SKEW_MS)
              return { html, savedAt };
          }
        }
      } catch {
        // JSON inválido: descarta abaixo
      }
      discard();
      return null;
    },
    clear() {
      discard();
    },
  };
}

/**
 * Apaga do `localStorage` todo rascunho cuja chave começa por `prefix`
 * (padrão `rte-draft:`) e devolve quantos. Para o logout em computadores
 * compartilhados. Seguro sem `localStorage` (SSR, bloqueado): devolve `0`.
 */
export function clearLocalDrafts(prefix = 'rte-draft:'): number {
  let removed = 0;
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return 0;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) {
      ls.removeItem(key);
      removed += 1;
    }
  } catch {
    // indisponível ou bloqueado
  }
  return removed;
}
