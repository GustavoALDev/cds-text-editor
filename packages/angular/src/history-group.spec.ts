import { getRteHtml } from '@comodeviaser/rte-core/extensions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core, só teste
import { typeText } from '../../core/extensions/src/testing/type-text';
import { createTestEditor, destroyTestEditors } from './testing-support/editors';

// Spec 05d1, K14 (R7): o `newGroupDelay` de 500 ms do `UndoRedo` agrupa o que
// se digita logo depois de um item `/`. Comportamento, não opção.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  destroyTestEditors();
});

function afterSlashItem(delay: number) {
  const editor = createTestEditor('<p></p>');
  editor.commands.setTextSelection(1);
  typeText(editor, '/');
  vi.advanceTimersByTime(2000);
  expect(editor.commands.runSlashItem(0)).toBe(true);
  vi.advanceTimersByTime(delay);
  typeText(editor, 'abc');
  return editor;
}

describe('histórico do menu / (K14)', () => {
  it('digitação em menos de 500 ms do item entra no mesmo passo', () => {
    const editor = afterSlashItem(100);
    expect(getRteHtml(editor)).toMatch(/^<h\d[^>]*>abc<\/h\d>$/);
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe('<p>/</p>');
  });

  it('digitação depois de 500 ms é outro passo', () => {
    const editor = afterSlashItem(600);
    editor.commands.undo();
    expect(getRteHtml(editor)).toMatch(/^<h\d[^>]*><\/h\d>$/);
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe('<p>/</p>');
  });
});

describe('histórico da busca (K14, C10)', () => {
  it('substituir tudo é um passo só de desfazer', () => {
    const editor = createTestEditor('<p>alpha beta alpha</p><p>alpha</p>');
    editor.commands.setSearchQuery('alpha');
    expect(editor.commands.replaceAllSearchMatches('x')).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>x beta x</p><p>x</p>');
    expect(editor.commands.undo()).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>alpha beta alpha</p><p>alpha</p>');
  });
});
