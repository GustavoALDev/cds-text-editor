import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createMemoryDraftStorage, type DraftStorage } from '@cds/rte-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim } from './testing-support/dialog';
import {
  setupDraft,
  storedDraft,
  type DraftSetup,
} from './testing-support/draft';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05c2b, Tarefa 2 (R2; S4): quando e como o rascunho é gravado.

const KEY = 'rte-draft:doc';
const FAKE = {
  toFake: ['setTimeout', 'clearTimeout'] as ('setTimeout' | 'clearTimeout')[],
};

let restoreDialog: () => void;
let restorePopover: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
});
afterEach(() => {
  vi.useRealTimers();
  TestBed.resetTestingModule();
  localStorage.clear();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

function type(s: DraftSetup, text: string): void {
  s.editor.commands.insertContent(text);
}

/** Armazenamento que registra as gravações e se estavam dentro da zona. */
function spyStorage(): {
  storage: DraftStorage;
  sets: boolean[];
  inner: DraftStorage;
} {
  const inner = createMemoryDraftStorage();
  const sets: boolean[] = [];
  return {
    inner,
    sets,
    storage: {
      get: (k) => inner.get(k),
      set: (k, v) => {
        sets.push(NgZone.isInAngularZone());
        inner.set(k, v);
      },
      remove: (k) => inner.remove(k),
    },
  };
}

function visibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('gravação (S4)', () => {
  it('uma gravação 1000 ms depois da última emissão, fora da zona', async () => {
    const spy = spyStorage();
    const s = await setupDraft({ storage: spy.storage });
    await settle(s.fixture);
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(999);
    expect(spy.sets).toEqual([]);
    type(s, 'y');
    vi.advanceTimersByTime(999);
    expect(spy.sets).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(spy.sets).toEqual([false]);
    const html = storedDraft(spy.inner, 'doc') ?? '';
    expect(html).toContain('x');
    expect(html).toContain('y');
    vi.advanceTimersByTime(5000);
    expect(spy.sets).toHaveLength(1);
  });

  it('pagehide e visibilitychange oculto gravam se sujo, mesmo com adiamento pendente', async () => {
    const s = await setupDraft();
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    window.dispatchEvent(new Event('pagehide'));
    expect(storedDraft(s.storage, 'doc')).toContain('x');
    s.storage.remove(KEY);
    type(s, 'y');
    visibility('visible');
    expect(storedDraft(s.storage, 'doc')).toBeNull();
    visibility('hidden');
    expect(storedDraft(s.storage, 'doc')).toContain('y');
    visibility('visible');
  });

  it('pagehide limpo com adiamento pendente apaga o rascunho velho (revisão final)', async () => {
    const s = await setupDraft();
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(1000);
    expect(storedDraft(s.storage, 'doc')).toContain('x');
    s.editor.commands.undo();
    expect(s.cmp.isDirty()).toBe(false);
    window.dispatchEvent(new Event('pagehide'));
    expect(storedDraft(s.storage, 'doc')).toBeNull();
  });

  it('destruir com adiamento pendente grava o rascunho (revisão final)', async () => {
    const s = await setupDraft();
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    s.fixture.destroy();
    expect(storedDraft(s.storage, 'doc')).toContain('x');
    expect(s.host.errors).toEqual([]);
  });

  it('limpo: pagehide e visibilitychange não gravam', async () => {
    const spy = spyStorage();
    const s = await setupDraft({ storage: spy.storage });
    window.dispatchEvent(new Event('pagehide'));
    visibility('hidden');
    visibility('visible');
    expect(spy.sets).toEqual([]);
    expect(s.cmp.isDirty()).toBe(false);
  });

  it.each(['readonly', 'disabled'] as const)('nada em %s', async (mode) => {
    const spy = spyStorage();
    const s = await setupDraft({ storage: spy.storage });
    (mode === 'readonly' ? s.host.ro : s.host.off).set(true);
    await settle(s.fixture);
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new Event('pagehide'));
    expect(spy.sets).toEqual([]);
  });

  it('nada durante a decisão de restauração pendente', async () => {
    const s = await setupDraft({ seed: '<p>velho</p>' });
    expect(s.cmp.draftAvailable()).not.toBeNull();
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new Event('pagehide'));
    expect(storedDraft(s.storage, 'doc')).toBe('<p>velho</p>');
  });

  it('transação sem mudança de valor não agenda gravação', async () => {
    const spy = spyStorage();
    const s = await setupDraft({ storage: spy.storage });
    vi.useFakeTimers(FAKE);
    s.editor.view.dispatch(s.editor.state.tr.setMeta('qualquer', true));
    s.editor.commands.setTextSelection(2);
    vi.advanceTimersByTime(3000);
    expect(spy.sets).toEqual([]);
  });

  it('valor igual à base apaga o rascunho em vez de gravar', async () => {
    const s = await setupDraft();
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(1000);
    expect(storedDraft(s.storage, 'doc')).not.toBeNull();
    s.editor.commands.undo();
    vi.advanceTimersByTime(1000);
    expect(s.cmp.isDirty()).toBe(false);
    expect(storedDraft(s.storage, 'doc')).toBeNull();
  });

  it('trocar draftKey descarrega na chave antiga e verifica a nova', async () => {
    const s = await setupDraft();
    s.storage.set(
      'rte-draft:outra',
      JSON.stringify({ v: 1, savedAt: Date.now(), html: '<p>outra</p>' }),
    );
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    s.host.key.set('outra');
    s.fixture.detectChanges();
    expect(storedDraft(s.storage, 'doc')).toContain('x');
    expect(s.cmp.draftAvailable()).not.toBeNull();
  });

  it('draftKey = null para de gravar sem apagar', async () => {
    const s = await setupDraft();
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(1000);
    const saved = storedDraft(s.storage, 'doc');
    expect(saved).toContain('x');
    s.host.key.set(null);
    s.fixture.detectChanges();
    type(s, 'y');
    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new Event('pagehide'));
    expect(storedDraft(s.storage, 'doc')).toBe(saved);
  });

  it('save falso emite draftError write uma vez até um sucesso', async () => {
    let fail = true;
    const inner = createMemoryDraftStorage();
    const storage: DraftStorage = {
      get: (k) => inner.get(k),
      set: (k, v) => {
        if (fail) throw new Error('cota');
        inner.set(k, v);
      },
      remove: (k) => inner.remove(k),
    };
    const s = await setupDraft({ storage });
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(1000);
    type(s, 'y');
    vi.advanceTimersByTime(1000);
    expect(s.host.errors).toEqual([{ reason: 'write' }]);
    fail = false;
    type(s, 'z');
    vi.advanceTimersByTime(1000);
    expect(s.host.errors).toHaveLength(1);
    fail = true;
    type(s, 'w');
    vi.advanceTimersByTime(1000);
    expect(s.host.errors).toEqual([{ reason: 'write' }, { reason: 'write' }]);
  });

  it('armazenamento padrão indisponível emite unavailable uma vez por instância', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const s = await setupDraft({ defaultStorage: true });
    expect(s.host.errors).toEqual([{ reason: 'unavailable' }]);
    s.host.key.set('outra');
    s.fixture.detectChanges();
    s.host.key.set('doc');
    s.fixture.detectChanges();
    expect(s.host.errors).toEqual([{ reason: 'unavailable' }]);
  });

  it('o HTML gravado nunca tem marcador de envio, blob: nem data:', async () => {
    const s = await setupDraft({
      value: '<p>ab</p><p><a href="https://e.com/a">l</a></p>',
    });
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(1000);
    const html = storedDraft(s.storage, 'doc') ?? '';
    expect(html).not.toMatch(/rte-upload-marker|blob:|data:/);
  });

  it('markSaved apaga o rascunho', async () => {
    const s = await setupDraft();
    vi.useFakeTimers(FAKE);
    type(s, 'x');
    vi.advanceTimersByTime(1000);
    expect(storedDraft(s.storage, 'doc')).not.toBeNull();
    expect(s.cmp.markSaved()).toBe(true);
    expect(storedDraft(s.storage, 'doc')).toBeNull();
    expect(s.cmp.draftAvailable()).toBeNull();
  });
});
