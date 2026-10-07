import { createEditorExtensions } from '@cds/rte-core/extensions';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRteUiExtension } from './dialogs/ui-extension';
import {
  ariaKeyShortcuts,
  detectPlatform,
  formatShortcut,
  RTE_TOOLBAR_SHORTCUTS,
  shortcutTitle,
  type RteShortcutTarget,
} from './toolbar/shortcuts';

describe('formatShortcut', () => {
  it('formata por plataforma', () => {
    expect(formatShortcut('Mod-b', 'other')).toBe('Ctrl+B');
    expect(formatShortcut('Mod-Shift-z', 'other')).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('Mod-Alt-2', 'other')).toBe('Ctrl+Alt+2');
    expect(formatShortcut('Mod-.', 'other')).toBe('Ctrl+.');
    expect(formatShortcut('Mod-Shift-z', 'mac')).toBe('⇧⌘Z');
    expect(formatShortcut('Mod-Alt-2', 'mac')).toBe('⌥⌘2');
    expect(formatShortcut('Mod-b', 'mac')).toBe('⌘B');
    expect(formatShortcut('Ctrl-Alt-Shift-Meta-x', 'mac')).toBe('⌃⌥⇧⌘X');
    expect(formatShortcut('Mod-k', 'mac')).toBe('⌘K');
    expect(formatShortcut('Mod-k', 'other')).toBe('Ctrl+K');
  });
});

describe('shortcutTitle (pré-voo 13)', () => {
  it('rótulo com o atalho da plataforma, ou só o rótulo', () => {
    expect(shortcutTitle('Bold', 'bold', 'mac')).toBe('Bold (⌘B)');
    expect(shortcutTitle('Bold', 'bold', 'other')).toBe('Bold (Ctrl+B)');
    expect(shortcutTitle('X', null, 'other')).toBe('X');
    expect(shortcutTitle('Table', 'table', 'other')).toBe('Table');
  });
});

describe('ariaKeyShortcuts', () => {
  it('usa Control ou Meta', () => {
    expect(ariaKeyShortcuts('Mod-Shift-z', 'mac')).toBe('Meta+Shift+Z');
    expect(ariaKeyShortcuts('Mod-Shift-z', 'other')).toBe('Control+Shift+Z');
    expect(ariaKeyShortcuts('Mod-Alt-c', 'other')).toBe('Control+Alt+C');
    expect(ariaKeyShortcuts('Mod-k', 'other')).toBe('Control+K');
    expect(ariaKeyShortcuts('Mod-k', 'mac')).toBe('Meta+K');
  });
});

describe('detectPlatform', () => {
  it('detecta mac por userAgentData ou platform', () => {
    expect(detectPlatform({ platform: 'MacIntel' } as Navigator)).toBe('mac');
    expect(detectPlatform({ platform: 'iPhone' } as Navigator)).toBe('mac');
    expect(detectPlatform({ platform: 'Win32' } as Navigator)).toBe('other');
    expect(
      detectPlatform({
        platform: 'Win32',
        userAgentData: { platform: 'macOS' },
      } as unknown as Navigator),
    ).toBe('mac');
    expect(detectPlatform(undefined)).toBe('other');
  });
});

// --- contra o keymap real do core -------------------------------------------

const SHIFTED: Record<string, string> = { '7': '&', '8': '*', '9': '(' };
const KEYCODES: Record<string, number> = { '.': 190, ',': 188 };

function keyEvent(spec: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const parts = spec.split('-');
  const base = parts[parts.length - 1] as string;
  const mods = parts.slice(0, -1);
  const shiftKey = mods.includes('Shift');
  const isLetter = /^[a-z]$/.test(base);
  const key = shiftKey
    ? isLetter
      ? base.toUpperCase()
      : (SHIFTED[base] ?? base)
    : base;
  const keyCode = isLetter
    ? base.toUpperCase().charCodeAt(0)
    : (KEYCODES[base] ?? base.charCodeAt(0));
  // `Mod` é Ctrl fora do Mac (o jsdom tem `navigator.platform` vazio).
  return new KeyboardEvent('keydown', {
    key,
    keyCode,
    ctrlKey: mods.includes('Mod') || mods.includes('Ctrl'),
    shiftKey,
    altKey: mods.includes('Alt'),
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

const editors: Editor[] = [];
/** Resposta do `openLink` da `RteUiExtension` (o `Mod-K`). */
let linkApplicable = true;
const openLink = vi.fn(() => linkApplicable);
beforeEach(() => {
  linkApplicable = true;
  openLink.mockClear();
});
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function make(content: string): Editor {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: createEditorExtensions({
      features: {
        colors: true,
        code: true,
        tables: true,
        tasks: true,
        media: true,
        embeds: true,
        newsBlocks: true,
      },
    }).concat(createRteUiExtension({ openLink })),
    content,
  });
  editors.push(editor);
  return editor;
}

function press(
  editor: Editor,
  spec: string,
  init: KeyboardEventInit = {},
): boolean {
  const { view } = editor;
  return Boolean(
    view.someProp('handleKeyDown', (f) => f(view, keyEvent(spec, init))),
  );
}

interface Case {
  doc: string;
  select?: [number, number];
  prepare?: (editor: Editor) => void;
  expected: (editor: Editor) => boolean;
}

const mark = (name: string): Case => ({
  doc: '<p>hello</p>',
  select: [1, 6],
  expected: (e) => e.isActive(name),
});
const align = (value: string): Case => ({
  doc: '<p>hello</p>',
  select: [2, 2],
  expected: (e) => e.getAttributes('paragraph')['textAlign'] === value,
});
const block = (check: (e: Editor) => boolean): Case => ({
  doc: '<p>hello</p>',
  select: [2, 2],
  expected: check,
});

const CASES: Record<string, Case> = {
  undo: {
    doc: '<p>a</p>',
    prepare: (e) => {
      e.commands.insertContentAt(2, 'x');
    },
    expected: (e) => e.getText() === 'a',
  },
  redo: {
    doc: '<p>a</p>',
    prepare: (e) => {
      e.commands.insertContentAt(2, 'x');
      e.commands.undo();
    },
    expected: (e) => e.getText() === 'ax',
  },
  bold: mark('bold'),
  italic: mark('italic'),
  underline: mark('underline'),
  strike: mark('strike'),
  code: mark('code'),
  superscript: mark('superscript'),
  subscript: mark('subscript'),
  bulletList: block((e) => e.isActive('bulletList')),
  orderedList: block((e) => e.isActive('orderedList')),
  taskList: block((e) => e.isActive('rtTaskList')),
  blockquote: block((e) => e.isActive('blockquote') && !e.isActive('bold')),
  codeBlock: block((e) => e.isActive('codeBlock')),
  paragraph: {
    doc: '<h2>hello</h2>',
    select: [2, 2],
    expected: (e) => e.isActive('paragraph'),
  },
  heading2: block((e) => e.isActive('heading', { level: 2 })),
  heading3: block((e) => e.isActive('heading', { level: 3 })),
  heading4: block((e) => e.isActive('heading', { level: 4 })),
  alignLeft: {
    doc: '<p>hello</p>',
    select: [2, 2],
    prepare: (e) => {
      e.commands.setTextAlign('right');
    },
    expected: (e) => e.getAttributes('paragraph')['textAlign'] === 'left',
  },
  link: {
    doc: '<p>hello</p>',
    select: [2, 2],
    expected: () => openLink.mock.calls.length === 1,
  },
  alignCenter: align('center'),
  alignRight: align('right'),
  alignJustify: align('justify'),
};

describe('RTE_TOOLBAR_SHORTCUTS', () => {
  it('tem as teclas da especificação', () => {
    expect(RTE_TOOLBAR_SHORTCUTS).toMatchObject({
      undo: 'Mod-z',
      redo: 'Mod-Shift-z',
      bold: 'Mod-b',
      superscript: 'Mod-.',
      subscript: 'Mod-,',
      paragraph: 'Mod-Alt-0',
      heading4: 'Mod-Alt-4',
      link: 'Mod-k',
    });
  });

  it('é congelada', () => {
    expect(Object.isFrozen(RTE_TOOLBAR_SHORTCUTS)).toBe(true);
  });

  it('tem um caso de keymap para cada entrada', () => {
    expect(Object.keys(CASES).sort()).toEqual(
      Object.keys(RTE_TOOLBAR_SHORTCUTS).sort(),
    );
  });

  const entries = Object.entries(RTE_TOOLBAR_SHORTCUTS) as [
    RteShortcutTarget,
    string,
  ][];
  it.each(entries)(
    '%s (%s) é tratada pelo keymap do editor',
    (target, spec) => {
      const c = CASES[target] as Case;
      const editor = make(c.doc);
      if (c.select)
        editor.commands.setTextSelection({
          from: c.select[0],
          to: c.select[1],
        });
      c.prepare?.(editor);
      expect(press(editor, spec)).toBe(true);
      expect(c.expected(editor)).toBe(true);
    },
  );
});

describe('Mod-K (RteUiExtension)', () => {
  it('não consome a tecla quando o link é inaplicável', () => {
    linkApplicable = false;
    const editor = make('<p>hello</p>');
    expect(press(editor, 'Mod-k')).toBe(false);
    expect(openLink).toHaveBeenCalledTimes(1);
  });

  it('não age durante composição de IME', () => {
    const editor = make('<p>hello</p>');
    editor.view.dom.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true }),
    );
    expect(editor.view.composing).toBe(true);
    // Pelo DOM (o ProseMirror ignora) e direto no keymap (a guarda da extensão).
    editor.view.dom.dispatchEvent(keyEvent('Mod-k', { isComposing: true }));
    expect(press(editor, 'Mod-k', { isComposing: true })).toBe(false);
    expect(openLink).not.toHaveBeenCalled();
  });
});
