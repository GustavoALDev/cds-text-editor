import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Plugin do `Escape` que dispensa o menu flutuante visível (M6). */
export const RTE_FLOATING_ESCAPE_KEY = new PluginKey('rteFloatingEscape');

/**
 * `Escape` no editável dispensa o menu flutuante visível (M6). Com prioridade
 * mínima, o plugin vem por último na lista do ProseMirror: o `someProp` para
 * no primeiro `handleKeyDown` que devolve `true`, então só chega aqui o
 * `Escape` que nenhum atalho tratou (o do menu `/` fecha só o `/`). Eventos
 * já consumidos antes do ProseMirror (`defaultPrevented`, inclusive por
 * ouvintes de captura do consumidor) nem chegam aos plugins
 * (`eventBelongsToView`). `dismiss` devolve `true` só quando havia menu
 * visível; então o ProseMirror chama `preventDefault()` (que faria de
 * qualquer jeito: `captureKeyDown` consome todo `Escape` do editável).
 */
export function createFloatingEscapeExtension(
  dismiss: () => boolean,
): Extension {
  return Extension.create({
    name: 'rteFloatingEscape',
    priority: -1000,

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: RTE_FLOATING_ESCAPE_KEY,
          props: {
            handleKeyDown: (_view, event) =>
              event.key === 'Escape' &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              dismiss(),
          },
        }),
      ];
    },
  });
}
