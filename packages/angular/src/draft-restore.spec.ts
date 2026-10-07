import { TestBed } from '@angular/core/testing';
import { getHtmlSchema } from '@cds/rte-core';
import { validateHtml } from '@cds/rte-core/html';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim } from './testing-support/dialog';
import { setupDraft, storedDraft } from './testing-support/draft';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05c2b, Tarefa 2 (R3, R4; S5, S7): restauração só por ação e abas.

let restoreDialog: () => void;
let restorePopover: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
});
afterEach(() => {
  localStorage.clear();
  TestBed.resetTestingModule();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

const envelope = (html: string) =>
  JSON.stringify({ v: 1, savedAt: Date.now(), html });

describe('verificação (S5)', () => {
  it('rascunho igual ao valor é apagado em silêncio', async () => {
    const s = await setupDraft({ seed: '<p>ab</p>' });
    expect(s.cmp.draftAvailable()).toBeNull();
    expect(storedDraft(s.storage, 'doc')).toBeNull();
  });

  it('rascunho diferente vira draftAvailable só com a data', async () => {
    const before = Date.now();
    const s = await setupDraft({ seed: '<p>velho</p>' });
    const available = s.cmp.draftAvailable();
    expect(available?.savedAt).toBeGreaterThanOrEqual(before);
    expect(Object.keys(available ?? {})).toEqual(['savedAt']);
    expect(storedDraft(s.storage, 'doc')).toBe('<p>velho</p>');
  });

  it('carga externa: igual apaga; diferente avisa', async () => {
    const s = await setupDraft({ seed: '<p>velho</p>' });
    s.host.value.set('<p>velho</p>');
    await settle(s.fixture);
    expect(s.cmp.draftAvailable()).toBeNull();
    expect(storedDraft(s.storage, 'doc')).toBeNull();
    s.storage.set('rte-draft:doc', envelope('<p>x</p>'));
    s.host.value.set('<p>outro</p>');
    await settle(s.fixture);
    expect(s.cmp.draftAvailable()).not.toBeNull();
  });
});

describe('restoreDraft e discardDraft (S5)', () => {
  it('restaura: emite value uma vez, reinicia o histórico, segue sujo e apaga a decisão', async () => {
    const errors = vi.spyOn(console, 'error');
    const s = await setupDraft({ seed: '<p>rascunho</p>' });
    s.host.values.length = 0;
    expect(s.cmp.restoreDraft()).toBe(true);
    await settle(s.fixture);
    expect(s.host.values).toEqual(['<p>rascunho</p>']);
    expect(s.cmp.value()).toBe('<p>rascunho</p>');
    expect(s.editor.can().undo()).toBe(false);
    expect(s.cmp.isDirty()).toBe(true);
    expect(s.cmp.draftAvailable()).toBeNull();
    expect(storedDraft(s.storage, 'doc')).toBe('<p>rascunho</p>');
    const messages = errors.mock.calls.map((a) => a.map(String).join(' '));
    expect(messages.filter((m) => /NG010[01]/.test(m))).toEqual([]);
  });

  it('false sem rascunho e com o editor não editável', async () => {
    const s = await setupDraft();
    expect(s.cmp.restoreDraft()).toBe(false);
    TestBed.resetTestingModule();
    const t = await setupDraft({ seed: '<p>velho</p>', ro: true });
    expect(t.cmp.draftAvailable()).not.toBeNull();
    expect(t.cmp.restoreDraft()).toBe(false);
    expect(t.cmp.draftAvailable()).not.toBeNull();
  });

  it('discardDraft apaga e zera', async () => {
    const s = await setupDraft({ seed: '<p>velho</p>' });
    s.cmp.discardDraft();
    expect(s.cmp.draftAvailable()).toBeNull();
    expect(storedDraft(s.storage, 'doc')).toBeNull();
  });

  it('HTML hostil sai canônico', async () => {
    const hostile =
      '<p>ok</p><script>alert(1)</script><p><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">l</a></p>';
    const s = await setupDraft({ seed: hostile });
    expect(s.cmp.restoreDraft()).toBe(true);
    const value = s.cmp.value();
    expect(value).not.toMatch(/script|onerror|javascript:/i);
    expect(
      validateHtml(value, getHtmlSchema({}), { mode: 'canonical' }),
    ).toEqual([]);
  });
});

describe('várias abas (S7)', () => {
  const KEY = 'rte-draft:doc';
  const fire = (newValue: string | null, key = KEY) =>
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));

  it('gravação externa com aba limpa avisa; remoção zera; com aba suja ignora', async () => {
    const s = await setupDraft({ defaultStorage: true });
    expect(s.cmp.draftAvailable()).toBeNull();
    localStorage.setItem(KEY, envelope('<p>de outra aba</p>'));
    fire(envelope('<p>de outra aba</p>'));
    expect(s.cmp.draftAvailable()).not.toBeNull();
    localStorage.removeItem(KEY);
    fire(null);
    expect(s.cmp.draftAvailable()).toBeNull();
    s.editor.commands.insertContent('x');
    localStorage.setItem(KEY, envelope('<p>outra</p>'));
    fire(envelope('<p>outra</p>'));
    expect(s.cmp.draftAvailable()).toBeNull();
  });

  it('chave de outro rascunho é ignorada', async () => {
    const s = await setupDraft({ defaultStorage: true });
    fire(envelope('<p>x</p>'), 'rte-draft:outro');
    expect(s.cmp.draftAvailable()).toBeNull();
  });

  it('DraftStorage próprio não ouve storage', async () => {
    const s = await setupDraft({});
    localStorage.setItem(KEY, envelope('<p>y</p>'));
    fire(envelope('<p>y</p>'));
    expect(s.cmp.draftAvailable()).toBeNull();
  });
});
