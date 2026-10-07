// Ajudante de testes (fora do build): entrega um `keydown` com modificadores
// aos `handleKeyDown` dos plugins, como o navegador faz (com `keyCode`, que o
// keymap do ProseMirror usa para achar a tecla base com Shift).
import type { Editor } from '@tiptap/core';

export interface Chord {
  key: string;
  keyCode: number;
  shift?: boolean;
}

export function pressChord(editor: Editor, chord: Chord): boolean {
  const event = new KeyboardEvent('keydown', {
    key: chord.key,
    keyCode: chord.keyCode,
    ctrlKey: true,
    shiftKey: chord.shift ?? false,
    bubbles: true,
    cancelable: true,
  });
  return (
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, event)) === true
  );
}
