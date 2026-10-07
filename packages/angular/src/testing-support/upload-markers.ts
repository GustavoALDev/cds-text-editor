import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  RTE_UPLOAD_KEY,
  createUploadMarkersPlugin,
  uploadMetaTransaction,
  type RteUploadMarker,
  type RteUploadMeta,
  type RteUploadPluginState,
} from '../upload/markers';
import type { RteUploadType } from '../upload/types';
import { createTestEditor } from './editors';

/**
 * Elementos de marcador falsos (o DOM de verdade é da Tarefa 8): um por id,
 * guardados como o gerenciador os guardaria.
 */
export function fakeMarkerElements(): {
  elementOf: (id: string) => HTMLElement;
  created: Map<string, HTMLElement>;
} {
  const created = new Map<string, HTMLElement>();
  const elementOf = (id: string) => {
    let el = created.get(id);
    if (!el) {
      el = document.createElement('span');
      el.className = 'rte-upload-marker';
      el.setAttribute('contenteditable', 'false');
      el.setAttribute('aria-hidden', 'true');
      el.dataset['id'] = id;
      created.set(id, el);
    }
    return el;
  };
  return { elementOf, created };
}

/** Editor de teste com o *plugin* dos marcadores registrado. */
export function markersEditor(html: string): Editor {
  const { elementOf } = fakeMarkerElements();
  const ext = Extension.create({
    name: 'rteUploadMarkersTest',
    addProseMirrorPlugins: () => [createUploadMarkersPlugin(elementOf)],
  });
  return createTestEditor(html, {}, [ext]);
}

export function uploadState(editor: Editor): RteUploadPluginState {
  const state = RTE_UPLOAD_KEY.getState(editor.state);
  if (!state) throw new Error('sem o plugin de marcadores');
  return state;
}

export function dispatchMeta(editor: Editor, meta: RteUploadMeta): void {
  editor.view.dispatch(uploadMetaTransaction(editor.state, meta));
}

/**
 * Um gesto de `n` marcadores no mesmo ponto (`pos`, padrão `selection.to`):
 * ids `<prefix>1…<prefix>n`, índices 0…n-1.
 */
export function addGesture(
  editor: Editor,
  n: number,
  o: {
    gesture?: number;
    pos?: number;
    prefix?: string;
    type?: RteUploadType;
  } = {},
): RteUploadMarker[] {
  const pos = o.pos ?? editor.state.selection.to;
  const markers = Array.from({ length: n }, (_, index) => ({
    id: `${o.prefix ?? 'm'}${index + 1}`,
    gesture: o.gesture ?? 1,
    index,
    pos,
    type: o.type ?? ('image' as const),
  }));
  dispatchMeta(editor, { add: markers });
  return markers;
}

export function markerPos(editor: Editor, id: string): number {
  const m = uploadState(editor).markers.find((x) => x.id === id);
  if (!m) throw new Error(`marcador ${id} ausente`);
  return m.pos;
}

/** `src` das mídias do documento, em ordem. */
export function mediaSrcs(doc: ProseMirrorNode): string[] {
  const out: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'rtImage' || node.type.name === 'rtVideo') {
      out.push(String(node.attrs['src']));
      return false;
    }
    return true;
  });
  return out;
}

/** Posições das mídias do documento, em ordem. */
export function mediaPositions(doc: ProseMirrorNode): number[] {
  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'rtImage' || node.type.name === 'rtVideo') {
      out.push(pos);
      return false;
    }
    return true;
  });
  return out;
}
