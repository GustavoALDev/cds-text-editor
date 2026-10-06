import type { Editor } from '@tiptap/core';
import { createUploadPlugins, RTE_UPLOAD_PLUGIN_KEYS } from './extension';
import type { RteUploadHost } from './host';
import { RteUploadManager } from './manager';

/** Envio montado num editor: o gerenciador e os *plugins* registrados. */
export interface RteUploadRuntime {
  readonly manager: RteUploadManager;
  /** Aborta sem anunciar e tira os *plugins* (editor vivo). */
  dispose(): void;
}

/**
 * Entrada do *chunk* `rte-upload` (Ruling 28, ADR 0013), carregado por
 * `import()` só com configuração de envio. O editor já existe: os *plugins*
 * entram com `registerPlugin`, numa só reconfiguração (`view.updateState`,
 * sem transação: nem histórico, nem `value`, nem seleção mudam).
 */
export function createUploadRuntime(
  host: RteUploadHost,
  editor: Editor,
): RteUploadRuntime {
  const manager = new RteUploadManager(host);
  const plugins = createUploadPlugins(manager);
  host.zone.runOutsideAngular(() =>
    editor.registerPlugin(plugins[0] as (typeof plugins)[0], (_, current) => [
      ...plugins,
      ...current,
    ]),
  );
  return {
    manager,
    dispose: () => {
      manager.dispose();
      if (editor.isDestroyed) return;
      host.zone.runOutsideAngular(() =>
        editor.unregisterPlugin([...RTE_UPLOAD_PLUGIN_KEYS]),
      );
    },
  };
}
