import type { RteImageAttrs, RteVideoAttrs } from '@cds/rte-core/extensions';
import type { CommandProps, Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { NodeSelection } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import type { MediaChain } from '../dialogs/apply-media';
import { RTE_UPLOAD_KEY, type RteUploadMeta } from './markers';
import { findInsertedNear, insertionTarget } from './order';
import type { RteUploadType } from './types';

export { findInsertedNear } from './order';

export type RteUploadArrival =
  | {
      readonly id: string;
      readonly type: 'image';
      readonly attrs: RteImageAttrs;
      readonly select: boolean;
    }
  | {
      readonly id: string;
      readonly type: 'video';
      readonly attrs: RteVideoAttrs;
      readonly select: boolean;
    };

const TYPE_NAMES: Readonly<Record<RteUploadType, string>> = {
  image: 'rtImage',
  video: 'rtVideo',
};

/**
 * A chegada seleciona o nó (E9) sse o editável tem foco e a seleção está
 * vazia na posição do marcador.
 */
export function selectOnArrival(editor: Editor, id: string): boolean {
  const marker = RTE_UPLOAD_KEY.getState(editor.state)?.markers.find(
    (m) => m.id === id,
  );
  const { selection } = editor.state;
  return (
    !!marker &&
    editor.view.hasFocus() &&
    selection.empty &&
    selection.from === marker.pos
  );
}

/** Tipo e `src` do nó que o comando do core inseriu, e onde (o último passo). */
function insertedBy(
  props: CommandProps,
  fallback: { typeName: string; src: string; near: number },
): { typeName: string; src: string; near: number } {
  const last = props.tr.steps[props.tr.steps.length - 1];
  const node =
    last instanceof ReplaceStep ? last.slice.content.firstChild : null;
  if (!node || !(last instanceof ReplaceStep)) return fallback;
  return {
    typeName: node.type.name,
    src: String(node.attrs['src']),
    near: last.from,
  };
}

/**
 * Transação de chegada (E9, pré-voo 9): `closeHistory` (passo de desfazer
 * próprio), remoção do parágrafo vazio de origem (E11), `setImage`/`setVideo`
 * do core com `{ at }` (a validação continua a dele), a *meta* que tira o
 * marcador e registra a mídia do gesto e, com `select`, `NodeSelection` +
 * `scrollIntoView`. Sem `select`, a seleção da pessoa só é mapeada, sem
 * rolar. Comando recusado ou marcador ausente → `false` e nada é despachado
 * (o Tiptap despacharia a cadeia mesmo com um passo `false`: `preventDispatch`,
 * Ruling 6); o marcador fica para o gerenciador remover.
 */
export function insertUploaded(editor: Editor, o: RteUploadArrival): boolean {
  const state = RTE_UPLOAD_KEY.getState(editor.state);
  const marker = state?.markers.find((m) => m.id === o.id);
  const target = state ? insertionTarget(state, o.id, editor.state.doc) : null;
  if (!marker || !target) return false;
  return editor
    .chain()
    .command((props) => {
      const { tr } = props;
      closeHistory(tr);
      let at = target.at;
      if (target.dropParagraph) {
        tr.delete(target.dropParagraph.from, target.dropParagraph.to);
        at = tr.mapping.map(at);
      }
      const chain = props.chain() as MediaChain;
      const ok = (
        o.type === 'image'
          ? chain.setImage(o.attrs, { at })
          : chain.setVideo(o.attrs, { at })
      ).run();
      const found = ok
        ? insertedBy(props, {
            typeName: TYPE_NAMES[o.type],
            src: o.attrs.src,
            near: at,
          })
        : null;
      const pos = found
        ? findInsertedNear(tr.doc, found.typeName, found.src, found.near)
        : null;
      const node = pos === null ? null : tr.doc.nodeAt(pos);
      if (!found || pos === null || !node) {
        tr.setMeta('preventDispatch', true);
        return false;
      }
      const meta: RteUploadMeta = {
        remove: [o.id],
        placed: {
          gesture: marker.gesture,
          index: marker.index,
          from: pos,
          to: pos + node.nodeSize,
          typeName: found.typeName,
          src: found.src,
        },
      };
      tr.setMeta(RTE_UPLOAD_KEY, meta);
      if (o.select) tr.setSelection(NodeSelection.create(tr.doc, pos));
      if (o.select) tr.scrollIntoView();
      return true;
    })
    .run();
}
