import type { EditorView } from '@tiptap/pm/view';

type Direction = 'backward' | 'forward';
type Granularity = 'character' | 'word' | 'line' | 'lineboundary';

/** Tecla → direção e granularidade; com `Ctrl`, a da segunda coluna. */
const KEYS: Readonly<
  Record<
    string,
    readonly [Direction, Granularity, Granularity | 'documentboundary']
  >
> = {
  ArrowLeft: ['backward', 'character', 'word'],
  ArrowRight: ['forward', 'character', 'word'],
  ArrowUp: ['backward', 'line', 'line'],
  ArrowDown: ['forward', 'line', 'line'],
  Home: ['backward', 'lineboundary', 'documentboundary'],
  End: ['forward', 'lineboundary', 'documentboundary'],
};

/**
 * `readonly` seleciona pelo teclado como um `input` somente leitura (D10):
 * com o editável em `contenteditable="false"`, Chromium e WebKit não estendem
 * a seleção com `Shift`+setas (o Firefox sim). Com a vista não editável, as
 * teclas de seleção estendem a seleção do documento por `Selection.modify`; o
 * ProseMirror lê a seleção do DOM como sempre (sem transação de documento).
 * Ligado em `editorProps.handleDOMEvents.keydown`, que o ProseMirror chama
 * também com a vista não editável.
 */
export function readonlySelectionKeydown(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (view.editable || !event.shiftKey || event.altKey || event.metaKey) {
    return false;
  }
  const entry = KEYS[event.key];
  const selection = view.dom.ownerDocument.getSelection();
  // `Selection.modify` não é padronizado (está nos 3 motores; não no jsdom).
  if (!entry || !selection || typeof selection.modify !== 'function') {
    return false;
  }
  // Sem seleção dentro do editável (foco por `Tab`): parte da seleção do
  // documento.
  if (!selection.anchorNode || !view.dom.contains(selection.anchorNode)) {
    const { node, offset } = view.domAtPos(view.state.selection.head);
    selection.collapse(node, offset);
  }
  const [direction, plain, withCtrl] = entry;
  selection.modify('extend', direction, event.ctrlKey ? withCtrl : plain);
  event.preventDefault();
  return true;
}
