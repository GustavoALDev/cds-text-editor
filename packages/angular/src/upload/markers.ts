import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Mapping } from '@tiptap/pm/transform';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { RteUploadType } from './types';

/**
 * Marcador de um envio em curso (E7): ponto do documento onde a mídia vai
 * cair. `gesture`/`index` dão a ordem dos arquivos do mesmo gesto (E11).
 */
export interface RteUploadMarker {
  readonly id: string;
  readonly gesture: number;
  readonly index: number;
  readonly pos: number;
  readonly type: RteUploadType;
}

/**
 * Mídia de um gesto já inserida (E11): faixa `[from, to)` do nó, mais o tipo
 * e o `src` para retomar a faixa quando o nó volta no mesmo ponto (desfazer e
 * refazer devolvem o nó sem que o mapeamento o acompanhe).
 */
export interface RteUploadPlaced {
  readonly gesture: number;
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly typeName: string;
  readonly src: string;
}

export interface RteUploadPluginState {
  readonly markers: readonly RteUploadMarker[];
  readonly placed: readonly RteUploadPlaced[];
  readonly decorations: DecorationSet;
}

/** *Meta* do *plugin*; a transação que só a carrega não muda o documento. */
export interface RteUploadMeta {
  readonly add?: readonly RteUploadMarker[];
  readonly remove?: readonly string[];
  readonly placed?: RteUploadPlaced;
}

export const RTE_UPLOAD_KEY = new PluginKey<RteUploadPluginState>('rteUpload');

const EMPTY: RteUploadPluginState = {
  markers: [],
  placed: [],
  decorations: DecorationSet.empty,
};

/**
 * Transação só de *meta* (E7): não muda o documento (nem o `value`), não
 * entra no histórico e não conta na sessão de mídia nem no `charLimit`.
 */
export function uploadMetaTransaction(
  state: EditorState,
  meta: RteUploadMeta,
): Transaction {
  return state.tr.setMeta(RTE_UPLOAD_KEY, meta).setMeta('addToHistory', false);
}

const isSame = (node: ProseMirrorNode | null | undefined, p: RteUploadPlaced) =>
  !!node && node.type.name === p.typeName && node.attrs['src'] === p.src;

/**
 * Faixa da mídia `p` no ponto `at` do documento: o nó que começa **ou**
 * termina exatamente ali, com o mesmo tipo e `src`; senão o ponto colapsado
 * (a mídia conta como apagada e não ordena nada).
 */
function reacquire(
  doc: ProseMirrorNode,
  p: RteUploadPlaced,
  at: number,
): RteUploadPlaced {
  const after = doc.nodeAt(at);
  if (after && isSame(after, p)) {
    return { ...p, from: at, to: at + after.nodeSize };
  }
  const before = doc.resolve(at).nodeBefore;
  if (before && isSame(before, p)) {
    return { ...p, from: at - before.nodeSize, to: at };
  }
  return { ...p, from: at, to: at };
}

/**
 * Marcadores e mídias inseridas: nunca descartados pelo mapeamento. A faixa
 * de uma mídia que deixa de conter o nó (apagado ou substituído) colapsa num
 * ponto; se um nó do mesmo tipo e `src` voltar **exatamente** nesse ponto
 * (refazer a chegada depois de desfazê-la, desfazer a substituição), a faixa
 * é retomada; qualquer outro nó com o mesmo `src` não conta.
 */
function mapState(
  prev: RteUploadPluginState,
  mapping: Mapping,
  doc: ProseMirrorNode,
): Pick<RteUploadPluginState, 'markers' | 'placed'> {
  const markers = prev.markers.map((m) => ({
    ...m,
    // apagar o trecho que contém o marcador o leva à borda (E7)
    pos: mapping.map(m.pos, 1),
  }));
  const placed = prev.placed.map((p) => {
    if (p.from >= p.to) return reacquire(doc, p, mapping.map(p.from, -1));
    const from = mapping.map(p.from, 1);
    const to = mapping.map(p.to, -1);
    const node = from < to ? doc.nodeAt(from) : null;
    if (node && isSame(node, p) && from + node.nodeSize === to) {
      return { ...p, from, to };
    }
    return reacquire(doc, p, mapping.map(p.from, -1));
  });
  return { markers, placed };
}

function applyMeta(
  mapped: Pick<RteUploadPluginState, 'markers' | 'placed'>,
  meta: RteUploadMeta | undefined,
): Pick<RteUploadPluginState, 'markers' | 'placed'> {
  if (!meta) return mapped;
  const removed = new Set(meta.remove ?? []);
  const markers = [
    ...mapped.markers.filter((m) => !removed.has(m.id)),
    ...(meta.add ?? []),
  ];
  const placed = meta.placed ? [...mapped.placed, meta.placed] : mapped.placed;
  // mídias de um gesto sem marcadores não ordenam mais nada (E11)
  const live = new Set(markers.map((m) => m.gesture));
  return { markers, placed: placed.filter((p) => live.has(p.gesture)) };
}

/**
 * *Plugin* dos marcadores de envio (E7, pré-voo 7): decorações de *widget*
 * cujos elementos são do gerenciador (`elementOf`), posições mapeadas por
 * toda transação (inclusive desfazer/refazer). Sem marcadores e sem *meta*,
 * o `apply` devolve o estado anterior (custo zero na digitação).
 */
export function createUploadMarkersPlugin(
  elementOf: (id: string) => HTMLElement,
): Plugin<RteUploadPluginState> {
  return new Plugin<RteUploadPluginState>({
    key: RTE_UPLOAD_KEY,
    state: {
      init: () => EMPTY,
      apply(tr, prev, _old, next) {
        const meta = tr.getMeta(RTE_UPLOAD_KEY) as RteUploadMeta | undefined;
        if (!meta && (!tr.docChanged || !prev.markers.length)) return prev;
        const { markers, placed } = applyMeta(
          tr.docChanged ? mapState(prev, tr.mapping, next.doc) : prev,
          meta,
        );
        if (!markers.length) return EMPTY;
        const decorations = DecorationSet.create(
          next.doc,
          markers.map((m) =>
            Decoration.widget(m.pos, () => elementOf(m.id), {
              key: m.id,
              side: m.index + 1,
              ignoreSelection: true,
            }),
          ),
        );
        return { markers, placed, decorations };
      },
    },
    props: {
      decorations: (state) => RTE_UPLOAD_KEY.getState(state)?.decorations,
    },
  });
}
