import {
  createDraftStore,
  createLocalDraftStorage,
  type DraftStorage,
  type DraftStore,
} from '@cds/rte-core';
import {
  DRAFT_KEY_PREFIX,
  type RteDraftHost,
  type RteDraftRuntime,
} from './facade';

/**
 * O aviso (S6) vem no mesmo *chunk*: o `@defer` do `RteEditor` o importa
 * daqui, o mesmo módulo do `RTE_DRAFT_LOADER` (um *chunk* só).
 */
export { RteDraftPrompt } from './draft-prompt';

/** Adiamento da gravação depois da última emissão de `value` (S4). */
const SAVE_DELAY_MS = 1000;

/** O mesmo teste do `createLocalDraftStorage` do core (recuo silencioso). */
function localStorageWorks(view: Window | null): boolean {
  try {
    const ls = view?.localStorage;
    if (!ls) return false;
    ls.setItem('__rte_draft_probe__', '1');
    ls.removeItem('__rte_draft_probe__');
    return true;
  } catch {
    return false;
  }
}

/**
 * Entrada do *chunk* `rte-draft` (S2), carregado por `import()` só com
 * `draftKey` válido: o agendador da gravação (1000 ms, fora da zona),
 * a descarga em `pagehide`/`visibilitychange`, o ouvinte `storage` entre abas
 * (só no armazenamento padrão) e a verificação do rascunho existente.
 */
export function createDraftRuntime(host: RteDraftHost): RteDraftRuntime {
  const view = host.view;
  const doc = view?.document ?? null;
  const custom: DraftStorage | undefined = host.config?.storage;
  const storage: DraftStorage = custom ?? createLocalDraftStorage();
  const native = custom === undefined && localStorageWorks(view);
  let store: DraftStore | null = null;
  let storageKey: string | null = null;
  let timer: number | null = null;
  let writeFailed = false;
  let warnedUnavailable = false;
  let disposed = false;

  const stopTimer = (): void => {
    if (timer !== null) {
      view?.clearTimeout(timer);
      timer = null;
    }
  };

  /** Decisão pendente: o rascunho antigo não pode ser sobrescrito (S4). */
  const deciding = (): boolean => host.available() !== null;

  const flush = (): void => {
    stopTimer();
    if (!store || disposed || !host.editable() || deciding()) return;
    const html = host.current();
    if (html === host.base()) {
      store.clear();
      return;
    }
    if (store.save(html)) {
      writeFailed = false;
    } else if (!writeFailed) {
      writeFailed = true;
      host.emitError({ reason: 'write' });
    }
  };

  const schedule = (): void => {
    stopTimer();
    if (!store || !view || !host.editable() || deciding()) return;
    host.zone.runOutsideAngular(() => {
      timer = view.setTimeout(flush, SAVE_DELAY_MS);
    });
  };

  /** Lê o rascunho: igual ao valor atual apaga em silêncio; senão, decisão (S5). */
  const verify = (): void => {
    const draft = store?.load() ?? null;
    if (!draft) {
      host.setAvailable(null);
    } else if (host.canonical(draft.html) === host.current()) {
      store?.clear();
      host.setAvailable(null);
    } else {
      host.setAvailable({ savedAt: draft.savedAt });
    }
  };

  const onHide = (): void => {
    if (host.isDirty()) flush();
  };
  const onVisibility = (): void => {
    if (doc?.visibilityState === 'hidden') onHide();
  };
  const onStorage = (event: StorageEvent): void => {
    if (!store || !native) return;
    if (event.key !== null && event.key !== storageKey) return;
    if (event.key === null || event.newValue === null) {
      host.setAvailable(null);
    } else if (!host.isDirty()) {
      verify();
    }
  };

  host.zone.runOutsideAngular(() => {
    view?.addEventListener('pagehide', onHide);
    doc?.addEventListener('visibilitychange', onVisibility);
    if (native) view?.addEventListener('storage', onStorage);
  });

  return {
    setKey(key) {
      if (disposed) return;
      if (timer !== null) flush();
      stopTimer();
      writeFailed = false;
      if (key === null) {
        store = null;
        storageKey = null;
        host.setAvailable(null);
        return;
      }
      storageKey = DRAFT_KEY_PREFIX + key;
      if (custom === undefined && !native && !warnedUnavailable) {
        warnedUnavailable = true;
        host.emitError({ reason: 'unavailable' });
      }
      store = createDraftStore({
        storage,
        key: storageKey,
        ...(host.config?.maxAgeMs === undefined
          ? {}
          : { maxAgeMs: host.config.maxAgeMs }),
      });
      verify();
      // Digitado antes de o *chunk* chegar e sem rascunho antigo: grava.
      if (host.isDirty() && !deciding()) schedule();
    },
    onValue: schedule,
    onLoaded() {
      stopTimer();
      if (store) verify();
    },
    restore() {
      if (!store || disposed) return false;
      if (!host.editable() || host.pendingUploads() > 0) return false;
      const draft = store.load();
      if (!draft) {
        host.setAvailable(null);
        return false;
      }
      stopTimer();
      if (!host.apply(draft.html)) return false;
      host.setAvailable(null);
      return true;
    },
    discard() {
      if (!store || disposed) return;
      stopTimer();
      store.clear();
      host.setAvailable(null);
      if (host.isDirty()) schedule();
    },
    clear() {
      stopTimer();
      store?.clear();
      host.setAvailable(null);
    },
    dispose() {
      disposed = true;
      stopTimer();
      view?.removeEventListener('pagehide', onHide);
      doc?.removeEventListener('visibilitychange', onVisibility);
      view?.removeEventListener('storage', onStorage);
      store = null;
    },
  };
}
