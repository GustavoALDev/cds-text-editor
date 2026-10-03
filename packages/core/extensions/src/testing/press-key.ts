// Ajudante de testes (fora do build): entrega um `keydown` aos `handleKeyDown`
// dos plugins e diz se algum o tratou. O `keyboardShortcut` do Tiptap sempre
// devolve `true` e não repete a seleção, por isso não serve para conferir se
// uma tecla foi deixada para o navegador (WCAG 2.1.2).
import type { Editor } from '@tiptap/core';

export function pressKey(editor: Editor, key: string, shift = false): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  return (
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, event)) === true
  );
}
