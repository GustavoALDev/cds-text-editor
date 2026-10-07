import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { pasteEmbedUrl } from './paste-embed';

/** O que colar e soltar pedem à fachada (`RteUploads`). */
export interface RteUploadInput {
  /** Configuração, mídia no esquema, editável e visível. */
  accepts(): boolean;
  start(files: readonly File[], at: number): number;
}

/**
 * `setEmbed` do core, sem importar o tipo (o aumento de `Commands` vive em
 * `@cds/rte-core/extensions`; a validação é do comando, S11).
 */
function embedCommand(commands: object): (url: string) => boolean {
  const run = (commands as { setEmbed?: (url: string) => boolean }).setEmbed;
  return (url) => (typeof run === 'function' ? run(url) : false);
}

/** Arrasto vindo de fora com arquivos (o interno é do ProseMirror). */
function outsideFiles(view: EditorView, event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return !view.dragging && !!types && Array.from(types).includes('Files');
}

function allowDrop(view: EditorView, event: DragEvent): boolean {
  if (outsideFiles(view, event)) event.preventDefault();
  // Com `preventDefault`, o ProseMirror pula o seu próprio tratamento de
  // dragover/dragenter; só o `Dropcursor` segue funcionando (usa
  // `addEventListener`). Retorna `false` para não encerrar a cadeia.
  return false;
}

/**
 * Colar e soltar arquivos (E12, E13; pré-voo 12; Ruling 29), no *chunk*
 * principal e sempre presente: vale antes de o *chunk* `rte-upload` chegar
 * (a fachada guarda o gesto) e depois de a carga falhar (`'unavailable'`).
 * Prioridade 1100: acima do `charLimit` e do bloco de código. Soltar
 * arquivos de fora sempre cancela o padrão (o navegador abriria o arquivo),
 * por `handleDOMEvents.drop`: o `handleDrop` nem roda quando `posAtCoords`
 * é `null`. Colar só toma os arquivos com `text/plain` vazio (texto do
 * Word/Excel vence).
 */
export function createUploadInputExtension(
  uploads: RteUploadInput,
  /** `pasteEmbeds` resolvido (S11); ausente = desligado. */
  pasteEmbeds: () => boolean = () => false,
) {
  return Extension.create({
    name: 'rteUploadInput',
    priority: 1100,
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
      new Plugin({
        key: new PluginKey('rteUploadInput'),
        props: {
          handlePaste(view, event) {
            const data = event.clipboardData;
            const files = data ? Array.from(data.files) : [];
            if (!files.length && pasteEmbeds()) {
              // URL colada num parágrafo vazio (S11): depois do caso de arquivos.
              const url = pasteEmbedUrl(
                data?.getData('text/plain') ?? '',
                view.state,
              );
              if (url && embedCommand(editor.can())(url)) {
                event.preventDefault();
                return embedCommand(editor.commands)(url);
              }
              return false;
            }
            if (
              !files.length ||
              data?.getData('text/plain').trim() ||
              !uploads.accepts()
            ) {
              return false;
            }
            uploads.start(files, view.state.selection.to);
            return true;
          },
          handleDOMEvents: {
            dragenter: allowDrop,
            dragover: allowDrop,
            drop(view, event) {
              if (!outsideFiles(view, event)) return false;
              event.preventDefault();
              if (uploads.accepts()) {
                const at = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });
                uploads.start(
                  Array.from(event.dataTransfer?.files ?? []),
                  at?.pos ?? view.state.selection.to,
                );
              }
              return true;
            },
          },
        },
      }),
      ];
    },
  });
}
