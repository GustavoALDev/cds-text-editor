// Ajudante de testes (fora do build): digita texto como o `prosemirror-view`
// faz na entrada direta, um ponto de código por vez, passando pelos
// `handleTextInput` dos plugins antes da transação padrão.
import type { Editor } from '@tiptap/core';

export function typeText(editor: Editor, text: string): void {
  const { view } = editor;
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const deflt = () => view.state.tr.insertText(ch, from, to);
    if (
      !view.someProp('handleTextInput', (f) => f(view, from, to, ch, deflt))
    ) {
      view.dispatch(deflt());
    }
  }
}
