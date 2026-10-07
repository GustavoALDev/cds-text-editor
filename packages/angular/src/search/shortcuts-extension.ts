import { Extension } from '@tiptap/core';

/**
 * Atalhos da busca (K7, K8) no editável: `Mod-F` abre a barra (ou foca o
 * campo, se já aberta) e `F3`/`Shift-F3` andam pelos resultados com a barra
 * aberta. Cada função devolve `false` quando a busca não está disponível
 * (recurso desligado, `disabled`, *chunk* com falha, barra fechada no caso do
 * `F3`) e então a tecla é do navegador. Nada acontece durante composição de
 * IME.
 */
export function createSearchShortcutsExtension(o: {
  open: () => boolean;
  step: (direction: 1 | -1) => boolean;
}): Extension {
  return Extension.create({
    name: 'rteSearchShortcuts',

    addKeyboardShortcuts() {
      return {
        'Mod-f': ({ editor }) => (editor.view.composing ? false : o.open()),
        F3: ({ editor }) => (editor.view.composing ? false : o.step(1)),
        'Shift-F3': ({ editor }) => (editor.view.composing ? false : o.step(-1)),
      };
    },
  });
}
