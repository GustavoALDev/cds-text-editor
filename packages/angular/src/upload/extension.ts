import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { RteUploadManager } from './manager';
import { createUploadMarkersPlugin, RTE_UPLOAD_KEY } from './markers';

const COMPOSITION_KEY = new PluginKey('rteUploadComposition');

/** Chaves dos *plugins* do envio (para `unregisterPlugin`). */
export const RTE_UPLOAD_PLUGIN_KEYS: readonly PluginKey[] = [
  RTE_UPLOAD_KEY,
  COMPOSITION_KEY,
];

/**
 * *Plugins* do envio (E7, pré-voo 12): os marcadores e o `compositionend`
 * (Ruling 9); colar e soltar ficam no principal (`input.ts`, Ruling 29).
 * Registrados quando o *chunk* `rte-upload` chega (Ruling 28) **no começo**
 * da lista (acima do `charLimit` e do bloco de código).
 */
export function createUploadPlugins(manager: RteUploadManager): Plugin[] {
  return [
    createUploadMarkersPlugin((id) => manager.elementOf(id)),
    new Plugin({
      key: COMPOSITION_KEY,
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
  ];
}
