import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { RteUploadPlaced, RteUploadPluginState } from './markers';

/** Onde inserir a mídia de um marcador (pré-voo 8). */
export interface RteUploadTarget {
  readonly at: number;
  /** Parágrafo vazio de origem a remover antes da inserção (E11). */
  readonly dropParagraph: { readonly from: number; readonly to: number } | null;
}

interface Located {
  readonly index: number;
  readonly from: number;
  readonly to: number;
}

/**
 * Posição do nó de tipo `typeName` e `src` mais perto de `near` (lição 14);
 * `null` se não houver.
 */
export function findInsertedNear(
  doc: ProseMirrorNode,
  typeName: string,
  src: string,
  near: number,
): number | null {
  let best: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return true;
    if (node.attrs['src'] === src) {
      if (best === null || Math.abs(pos - near) < Math.abs(best - near)) {
        best = pos;
      }
    }
    return false;
  });
  return best;
}

/** A faixa ainda contém o nó registrado (mesmo tipo, `src` e tamanho). */
function holds(doc: ProseMirrorNode, p: RteUploadPlaced): boolean {
  if (p.from >= p.to || p.to > doc.content.size) return false;
  const node = doc.nodeAt(p.from);
  return (
    !!node &&
    node.type.name === p.typeName &&
    node.attrs['src'] === p.src &&
    p.from + node.nodeSize === p.to
  );
}

/**
 * Mídias já inseridas do gesto, no documento atual: só as de faixa válida (o
 * *plugin* retoma a faixa quando o nó volta no mesmo ponto). Mídia apagada
 * não ordena nada.
 */
function locate(
  doc: ProseMirrorNode,
  placed: readonly RteUploadPlaced[],
): Located[] {
  return placed
    .filter((p) => holds(doc, p))
    .map((p) => ({ index: p.index, from: p.from, to: p.to }));
}

const isEmptyParagraph = (node: ProseMirrorNode) =>
  node.type.name === 'paragraph' && node.content.size === 0;

/**
 * Ponto de inserção do marcador `id` (E9, E11, pré-voo 8): logo depois da
 * mídia já inserida do arquivo anterior do gesto, senão logo antes da do
 * seguinte, senão o próprio marcador. Num parágrafo vazio com outro
 * marcador, a mídia entra antes dele (o parágrafo fica para os outros); o
 * parágrafo vazio de origem sem outro marcador sai com a chegada que cai
 * fora dele, se o pai o permitir. `null` sem o marcador.
 */
export function insertionTarget(
  state: RteUploadPluginState,
  id: string,
  doc: ProseMirrorNode,
): RteUploadTarget | null {
  const m = state.markers.find((x) => x.id === id);
  if (!m || m.pos > doc.content.size) return null;
  let prev: Located | null = null;
  let next: Located | null = null;
  const siblings = state.placed.filter((p) => p.gesture === m.gesture);
  for (const s of locate(doc, siblings)) {
    if (s.index < m.index && (!prev || s.index > prev.index)) prev = s;
    if (s.index > m.index && (!next || s.index < next.index)) next = s;
  }
  const $m = doc.resolve(m.pos);
  const inEmpty = $m.depth > 0 && isEmptyParagraph($m.parent);
  const crowded =
    inEmpty && state.markers.some((o) => o.id !== id && o.pos === m.pos);
  let at = prev ? prev.to : next ? next.from : m.pos;
  if (!prev && !next && crowded) at = $m.before();
  if (!inEmpty || crowded) return { at, dropParagraph: null };
  const from = $m.before();
  const to = $m.after();
  const index = $m.index(-1);
  const outside = at <= from || at >= to;
  const drop = outside && $m.node(-1).canReplace(index, index + 1);
  return { at, dropParagraph: drop ? { from, to } : null };
}
