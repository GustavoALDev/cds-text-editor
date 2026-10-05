import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import {
  createRteUiExtension,
  RTE_UI_PLUGIN_KEY,
  setPendingSelection,
} from './dialogs/ui-extension';
import {
  createTestEditor,
  destroyTestEditors,
} from './testing-support/editors';

afterEach(() => {
  destroyTestEditors();
});

function make(html: string): Editor {
  return createTestEditor(html, {}, [
    createRteUiExtension({ openLink: () => true }),
  ]);
}

function pendingText(editor: Editor): string {
  return Array.from(
    editor.view.dom.querySelectorAll('.rte-pending-selection'),
    (el) => el.textContent,
  ).join('');
}

describe('seleção pendente (R8)', () => {
  it('decora o intervalo no DOM do editável e some com null', () => {
    const e = make('<p>abcd</p>');
    setPendingSelection(e, { from: 1, to: 3 });
    expect(pendingText(e)).toBe('ab');
    expect(RTE_UI_PLUGIN_KEY.getState(e.state)?.pending).toEqual({
      from: 1,
      to: 3,
    });
    setPendingSelection(e, null);
    expect(e.view.dom.querySelector('.rte-pending-selection')).toBeNull();
    expect(RTE_UI_PLUGIN_KEY.getState(e.state)?.pending).toBeNull();
  });

  it('usa transações só de meta, fora do histórico', () => {
    const e = make('<p>abcd</p>');
    const seen: Transaction[] = [];
    e.on('transaction', ({ transaction }) => {
      seen.push(transaction);
    });
    setPendingSelection(e, { from: 1, to: 3 });
    setPendingSelection(e, null);
    expect(seen).toHaveLength(2);
    for (const tr of seen) {
      expect(tr.docChanged).toBe(false);
      expect(tr.getMeta('addToHistory')).toBe(false);
    }
    expect(e.can().undo()).toBe(false);
  });

  it('não despacha nada quando o intervalo é igual ao atual', () => {
    const e = make('<p>abcd</p>');
    setPendingSelection(e, { from: 1, to: 3 });
    const seen: Transaction[] = [];
    e.on('transaction', ({ transaction }) => {
      seen.push(transaction);
    });
    setPendingSelection(e, { from: 1, to: 3 });
    expect(seen).toHaveLength(0);
    setPendingSelection(e, null);
    setPendingSelection(e, null);
    expect(seen).toHaveLength(1);
  });

  it('intervalo vazio não decora', () => {
    const e = make('<p>abcd</p>');
    setPendingSelection(e, { from: 2, to: 2 });
    expect(e.view.dom.querySelector('.rte-pending-selection')).toBeNull();
  });

  it('mapeia o intervalo quando o documento muda fora dele', () => {
    const e = make('<p>abcd</p>');
    setPendingSelection(e, { from: 2, to: 4 });
    e.commands.insertContentAt(1, 'xy');
    expect(RTE_UI_PLUGIN_KEY.getState(e.state)?.pending).toEqual({
      from: 4,
      to: 6,
    });
    expect(pendingText(e)).toBe('bc');
  });
});
