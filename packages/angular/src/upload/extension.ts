import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { RteUploadManager } from './manager';
import { createUploadMarkersPlugin } from './markers';

/**
 * `RteUploadExtension` (E7, pré-voo 12): registrada sempre, inerte sem
 * adaptador. Nesta parte só os marcadores e o `compositionend` (Ruling 9);
 * colar e soltar entram na Tarefa 9.
 */
export function createRteUploadExtension(manager: RteUploadManager): Extension {
  return Extension.create({
    name: 'rteUpload',
    // acima do `charLimit` (1000) e do bloco de código do core (E12)
    priority: 1100,
    addProseMirrorPlugins: () => [
      createUploadMarkersPlugin((id) => manager.elementOf(id)),
      new Plugin({
        props: {
          handleDOMEvents: {
            // Inserção adiada pela composição (E10). Duas microtarefas: o
            // `compositionend` do ProseMirror roda depois deste e agenda numa
            // microtarefa a leitura das últimas mudanças do DOM; a inserção
            // vem depois dela, senão o redesenho apagaria o texto composto.
            compositionend: () => {
              queueMicrotask(() => queueMicrotask(() => manager.flush()));
              return false;
            },
          },
        },
      }),
    ],
  });
}
