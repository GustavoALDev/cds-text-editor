import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim } from './testing-support/dialog';
import { installPopoverShim } from './testing-support/popover';
import { setupDraft } from './testing-support/draft';

// Spec 05c2b, Tarefa 2 (R1; S2): o *chunk* `rte-draft` só chega com `draftKey` válido.

let restoreDialog: () => void;
let restorePopover: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
});
afterEach(() => {
  TestBed.resetTestingModule();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

describe('carregamento do rascunho (S2)', () => {
  it('sem draftKey o carregador não é chamado', async () => {
    const s = await setupDraft({ key: null });
    expect(s.loader).not.toHaveBeenCalled();
    expect(s.cmp.draftAvailable()).toBeNull();
  });

  it.each(['', 'x'.repeat(201)])(
    'draftKey inválido (%#) é ignorado com aviso',
    async (key) => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const s = await setupDraft({ key });
      expect(s.loader).not.toHaveBeenCalled();
      expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
        expect.stringContaining('[rte-editor] draftKey'),
      ]);
    },
  );

  it('com draftKey válido chama o carregador depois de editorReady, uma vez', async () => {
    const s = await setupDraft({ key: 'a'.repeat(200) });
    expect(s.loader).toHaveBeenCalledTimes(1);
    s.host.key.set('outra');
    await s.fixture.whenStable();
    expect(s.loader).toHaveBeenCalledTimes(1);
  });

  it('falha de carga: sem rascunho, aviso e sem nova tentativa', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await setupDraft({
      loader: () => Promise.reject(new Error('rede')),
      seed: '<p>velho</p>',
    });
    expect(s.cmp.draftAvailable()).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('rascunho'))).toBe(
      true,
    );
    s.host.key.set('nova');
    await s.fixture.whenStable();
    expect(s.loader).toHaveBeenCalledTimes(1);
    s.editor.commands.insertContent('x');
    await s.fixture.whenStable();
    expect(s.cmp.isDirty()).toBe(true);
  });
});
