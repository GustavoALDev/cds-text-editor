import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

type PendingRange = { from: number; to: number } | null;

interface RteUiState {
  pending: PendingRange;
}

/** Estado da `RteUiExtension`: o intervalo alvo do diálogo aberto (G13). */
export const RTE_UI_PLUGIN_KEY = new PluginKey<RteUiState>('rteUi');

/**
 * Extensão de interface do pacote Angular (G12/G13): o atalho `Mod-K` (abre o
 * diálogo de link; `openLink` devolve `true` só quando o link é aplicável, e
 * então a tecla é consumida) e a decoração `rte-pending-selection` sobre o
 * intervalo pendente, ligada e desligada por `setPendingSelection`.
 */
export function createRteUiExtension(o: {
  openLink: () => boolean;
}): Extension {
  return Extension.create({
    name: 'rteUi',

    addKeyboardShortcuts() {
      return {
        'Mod-k': ({ editor }) => (editor.view.composing ? false : o.openLink()),
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin<RteUiState>({
          key: RTE_UI_PLUGIN_KEY,
          state: {
            init: () => ({ pending: null }),
            apply(tr, value) {
              const meta = tr.getMeta(RTE_UI_PLUGIN_KEY) as
                PendingRange | undefined;
              if (meta !== undefined) return { pending: meta };
              const pending = value.pending;
              if (!pending || !tr.docChanged) return value;
              const from = tr.mapping.map(pending.from, 1);
              const to = Math.max(from, tr.mapping.map(pending.to, -1));
              return { pending: { from, to } };
            },
          },
          props: {
            decorations(state) {
              const pending = RTE_UI_PLUGIN_KEY.getState(state)?.pending;
              if (!pending || pending.from >= pending.to) return null;
              return DecorationSet.create(state.doc, [
                Decoration.inline(pending.from, pending.to, {
                  class: 'rte-pending-selection',
                }),
              ]);
            },
          },
        }),
      ];
    },
  });
}

/**
 * Liga (`range`) ou desliga (`null`) a seleção pendente por uma transação só
 * de *meta*, fora do histórico: não muda o `doc` (G5) nem emite valor (D8).
 * Sem efeito se o intervalo for igual ao atual (ou a extensão faltar).
 */
export function setPendingSelection(
  editor: Editor,
  range: { from: number; to: number } | null,
): void {
  const current = RTE_UI_PLUGIN_KEY.getState(editor.state);
  if (!current) return;
  const pending = current.pending;
  if (
    pending === range ||
    (pending && range && pending.from === range.from && pending.to === range.to)
  ) {
    return;
  }
  editor.view.dispatch(
    editor.state.tr
      .setMeta(RTE_UI_PLUGIN_KEY, range && { from: range.from, to: range.to })
      .setMeta('addToHistory', false),
  );
}
