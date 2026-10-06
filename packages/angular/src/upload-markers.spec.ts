// @vitest-environment jsdom
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import {
  NodeSelection,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { insertUploaded, selectOnArrival } from './upload/insert';
import { uploadMetaTransaction } from './upload/markers';
import { destroyTestEditors, selectText } from './testing-support/editors';
import {
  addGesture,
  dispatchMeta,
  markerPos,
  markersEditor,
  mediaPositions,
  mediaSrcs,
  uploadState,
} from './testing-support/upload-markers';

// Spec 05c2a, Tarefa 5: marcadores, ordem do gesto e chegada (E7, E9, E11;
// R6, R7 parcial). A propriedade fica em `upload-order.spec.ts`.

const VIDEO =
  '<figure class="rt-figure rt-figure--video"><video src="/v.webm" controls=""></video></figure>';
const TABLE =
  '<table><tbody><tr><th><p>h</p></th></tr><tr><td><p>x</p></td></tr></tbody></table>';

afterEach(() => destroyTestEditors());

function widgets(editor: Editor): HTMLElement[] {
  return [
    ...editor.view.dom.querySelectorAll<HTMLElement>('.rte-upload-marker'),
  ];
}

function arrive(
  editor: Editor,
  id: string,
  src = `/${id}.png`,
  select = false,
): boolean {
  return insertUploaded(editor, {
    id,
    type: 'image',
    attrs: { src, alt: null },
    select,
  });
}

function caret(editor: Editor, pos: number): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
  );
}

describe('marcadores: posição (E7, R6)', () => {
  it('cursor no meio de abc: o widget fica entre a e bc', () => {
    const editor = markersEditor('<p>abc</p>');
    selectText(editor, 'abc', 1);
    addGesture(editor, 1);
    expect(markerPos(editor, 'm1')).toBe(2);
    const [w] = widgets(editor);
    expect(w?.parentElement?.tagName).toBe('P');
    expect(w?.previousSibling?.textContent).toBe('a');
    expect(w?.getAttribute('contenteditable')).toBe('false');
    expect(w?.getAttribute('aria-hidden')).toBe('true');
  });

  it('parágrafo vazio: o widget fica dentro dele', () => {
    const editor = markersEditor('<p>a</p><p></p>');
    caret(editor, 4);
    addGesture(editor, 1);
    expect(markerPos(editor, 'm1')).toBe(4);
    const p = editor.view.dom.querySelectorAll('p')[1];
    expect(p?.querySelector('.rte-upload-marker')).not.toBeNull();
  });

  it('NodeSelection de vídeo: o marcador fica depois do nó, entre blocos', () => {
    const editor = markersEditor(`${VIDEO}<p>x</p>`);
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
    );
    addGesture(editor, 1, { type: 'video' });
    const size = editor.state.doc.firstChild?.nodeSize ?? -1;
    expect(markerPos(editor, 'm1')).toBe(size);
    expect(widgets(editor)[0]?.parentElement).toBe(editor.view.dom);
  });

  it('célula de tabela: o widget fica dentro da célula', () => {
    const editor = markersEditor(TABLE);
    selectText(editor, 'x', 1);
    addGesture(editor, 1);
    expect(widgets(editor)[0]?.closest('td')).not.toBeNull();
  });

  it('3 marcadores no mesmo ponto: 3 widgets na ordem de side', () => {
    const editor = markersEditor('<p>abc</p>');
    selectText(editor, 'abc', 1);
    const markers = addGesture(editor, 3, { pos: 2 });
    // acrescentados fora de ordem: a ordem vem do `side` (índice + 1)
    dispatchMeta(editor, { remove: ['m1', 'm2', 'm3'] });
    dispatchMeta(editor, { add: [2, 0, 1].flatMap((i) => markers[i] ?? []) });
    expect(uploadState(editor).markers.map((m) => m.id)).toEqual([
      'm3',
      'm1',
      'm2',
    ]);
    expect(widgets(editor).map((w) => w.dataset['id'])).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });
});

describe('marcadores: mapeamento e transações só de meta (E7, R6)', () => {
  it('digitar antes do marcador o desloca', () => {
    const editor = markersEditor('<p>abc</p>');
    addGesture(editor, 1, { pos: 3 });
    editor.view.dispatch(editor.state.tr.insertText('XY', 1));
    expect(markerPos(editor, 'm1')).toBe(5);
  });

  it('colar antes do marcador o desloca', () => {
    const editor = markersEditor('<p>abc</p>');
    addGesture(editor, 1, { pos: 3 });
    caret(editor, 1);
    // o jsdom não tem `ClipboardEvent`: um `paste` sem área de transferência
    editor.view.pasteHTML('<b>zz</b>', new Event('paste') as ClipboardEvent);
    expect(editor.state.doc.textContent).toBe('zzabc');
    expect(markerPos(editor, 'm1')).toBe(5);
  });

  it('apagar o trecho que contém o marcador o leva à borda', () => {
    const editor = markersEditor('<p>abcd</p>');
    addGesture(editor, 1, { pos: 3 });
    editor.commands.deleteRange({ from: 2, to: 4 });
    expect(uploadState(editor).markers).toHaveLength(1);
    expect(markerPos(editor, 'm1')).toBe(2);
    expect(widgets(editor)).toHaveLength(1);
  });

  it('desfazer/refazer de uma digitação mantém o marcador', () => {
    const editor = markersEditor('<p>abc</p>');
    addGesture(editor, 1, { pos: 3 });
    editor.view.dispatch(editor.state.tr.insertText('X', 1));
    expect(markerPos(editor, 'm1')).toBe(4);
    editor.commands.undo();
    expect(markerPos(editor, 'm1')).toBe(3);
    editor.commands.redo();
    expect(markerPos(editor, 'm1')).toBe(4);
    expect(widgets(editor)).toHaveLength(1);
  });

  it('add/remove não mudam o doc, ficam fora do histórico e do value', () => {
    const editor = markersEditor('<p>abc</p>');
    const updates = vi.fn();
    editor.on('update', updates);
    editor.view.dispatch(editor.state.tr.insertText('Z', 4));
    updates.mockClear();
    const doc = editor.state.doc;
    const add = uploadMetaTransaction(editor.state, {
      add: [{ id: 'm1', gesture: 1, index: 0, pos: 2, type: 'image' }],
    });
    expect(add.docChanged).toBe(false);
    expect(add.getMeta('addToHistory')).toBe(false);
    editor.view.dispatch(add);
    expect(editor.state.doc).toBe(doc);
    expect(updates).not.toHaveBeenCalled();
    // o desfazer seguinte desfaz a digitação, não o marcador
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('abc');
    expect(uploadState(editor).markers.map((m) => m.id)).toEqual(['m1']);
    const remove = uploadMetaTransaction(editor.state, { remove: ['m1'] });
    expect(remove.docChanged).toBe(false);
    editor.view.dispatch(remove);
    expect(updates).toHaveBeenCalledTimes(1); // só o desfazer
    editor.commands.redo();
    expect(editor.state.doc.textContent).toBe('abcZ');
    expect(uploadState(editor).markers).toEqual([]);
    expect(widgets(editor)).toHaveLength(0);
  });

  it('getRteHtml e o JSON nunca contêm o marcador', () => {
    const editor = markersEditor('<p>abc</p><p></p>');
    addGesture(editor, 3, { pos: 2 });
    addGesture(editor, 2, { pos: 6, gesture: 2, prefix: 'n' });
    expect(widgets(editor)).toHaveLength(5);
    const html = getRteHtml(editor);
    expect(html).toBe('<p>abc</p><p></p>');
    expect(html).not.toContain('rte-upload-marker');
    expect(JSON.stringify(editor.getJSON())).not.toContain('m1');
  });

  it('sem marcadores, a digitação devolve o mesmo estado do plugin', () => {
    const editor = markersEditor('<p>abc</p>');
    const before = uploadState(editor);
    editor.view.dispatch(editor.state.tr.insertText('X', 1));
    expect(uploadState(editor)).toBe(before);
  });
});

describe('chegada (E9, R7 parcial)', () => {
  it('<p></p>: a figura substitui o parágrafo, num passo de desfazer', () => {
    const editor = markersEditor('<p></p>');
    addGesture(editor, 1, { pos: 1 });
    expect(arrive(editor, 'm1')).toBe(true);
    expect(mediaSrcs(editor.state.doc)).toEqual(['/m1.png']);
    expect(editor.state.doc.childCount).toBe(1);
    expect(uploadState(editor).markers).toEqual([]);
    expect(getRteHtml(editor)).not.toContain('<p>');
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe('<p></p>');
  });

  it('digitação logo antes não é desfeita junto (closeHistory)', () => {
    const editor = markersEditor('<p>ab</p><p></p>');
    addGesture(editor, 1, { pos: 5 });
    caret(editor, 3);
    editor.view.dispatch(editor.state.tr.insertText('x', 3));
    expect(markerPos(editor, 'm1')).toBe(6);
    expect(arrive(editor, 'm1')).toBe(true);
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe('<p>abx</p><p></p>');
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe('<p>ab</p><p></p>');
  });

  it('foco e cursor no marcador: NodeSelection no nó, com rolagem', () => {
    const editor = markersEditor('<p>a</p><p></p>');
    caret(editor, 4);
    addGesture(editor, 1);
    vi.spyOn(editor.view, 'hasFocus').mockReturnValue(true);
    expect(selectOnArrival(editor, 'm1')).toBe(true);
    const trs: Transaction[] = [];
    editor.on('transaction', ({ transaction }) => trs.push(transaction));
    expect(arrive(editor, 'm1', '/a.png', true)).toBe(true);
    const sel = editor.state.selection;
    expect(sel).toBeInstanceOf(NodeSelection);
    expect((sel as NodeSelection).node.attrs['src']).toBe('/a.png');
    expect(trs).toHaveLength(1);
    expect(trs[0]?.scrolledIntoView).toBe(true);
  });

  it('sem foco, ou com o cursor fora do marcador, não seleciona', () => {
    const editor = markersEditor('<p>a</p><p></p>');
    caret(editor, 4);
    addGesture(editor, 1);
    vi.spyOn(editor.view, 'hasFocus').mockReturnValue(false);
    expect(selectOnArrival(editor, 'm1')).toBe(false);
    vi.spyOn(editor.view, 'hasFocus').mockReturnValue(true);
    caret(editor, 2);
    expect(selectOnArrival(editor, 'm1')).toBe(false);
    expect(selectOnArrival(editor, 'nada')).toBe(false);
  });

  it('cursor em outro parágrafo: seleção mapeada, sem rolar', () => {
    const editor = markersEditor('<p></p><p>abc</p>');
    addGesture(editor, 1, { pos: 1 });
    selectText(editor, 'abc', 1, 2);
    const trs: Transaction[] = [];
    editor.on('transaction', ({ transaction }) => trs.push(transaction));
    expect(arrive(editor, 'm1')).toBe(true);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('b');
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(trs[0]?.scrolledIntoView).toBe(false);
  });

  it('cursor dentro do parágrafo vazio substituído: seleção válida', () => {
    const editor = markersEditor('<p>a</p><p></p>');
    caret(editor, 4);
    addGesture(editor, 1);
    expect(arrive(editor, 'm1')).toBe(true);
    expect(mediaSrcs(editor.state.doc)).toEqual(['/m1.png']);
    const { from } = editor.state.selection;
    expect(from).toBeLessThanOrEqual(editor.state.doc.content.size);
  });

  it('comando recusado: false e o documento igual', () => {
    const editor = markersEditor('<p></p>');
    addGesture(editor, 1, { pos: 1 });
    const doc = editor.state.doc;
    const ok = insertUploaded(editor, {
      id: 'm1',
      type: 'image',
      attrs: { src: '/a.png', alt: null, width: 0 },
      select: false,
    });
    expect(ok).toBe(false);
    expect(editor.state.doc).toBe(doc);
    // o gerenciador é quem remove o marcador (transação só de meta)
    expect(uploadState(editor).markers).toHaveLength(1);
  });

  it('recusado com o parágrafo de origem a remover: nada muda (Ruling 6)', () => {
    const editor = markersEditor('<p></p>');
    addGesture(editor, 2, { pos: 1 });
    expect(arrive(editor, 'm2')).toBe(true);
    const doc = editor.state.doc;
    const ok = insertUploaded(editor, {
      id: 'm1',
      type: 'image',
      attrs: { src: '/a.png', alt: null, width: -1 },
      select: false,
    });
    expect(ok).toBe(false);
    expect(editor.state.doc).toBe(doc);
  });

  it('id desconhecido: false', () => {
    const editor = markersEditor('<p></p>');
    expect(arrive(editor, 'x')).toBe(false);
  });

  it('célula de tabela: a figura entra na célula', () => {
    const editor = markersEditor(TABLE);
    selectText(editor, 'x', 1);
    addGesture(editor, 1);
    expect(arrive(editor, 'm1')).toBe(true);
    expect(getRteHtml(editor)).toMatch(
      /<td><p>x<\/p><figure[^]*<\/figure><\/td>/,
    );
  });

  it('vídeo: setVideo com a posição do marcador', () => {
    const editor = markersEditor('<p>a</p><p></p>');
    addGesture(editor, 1, { pos: 4, type: 'video' });
    const ok = insertUploaded(editor, {
      id: 'm1',
      type: 'video',
      attrs: { src: '/v.webm' },
      select: false,
    });
    expect(ok).toBe(true);
    expect(getRteHtml(editor)).toMatch(
      /^<p>a<\/p><figure[^]*<video src="\/v.webm"/,
    );
  });

  it('desfazer/refazer da inserção de fundo', () => {
    const editor = markersEditor('<p>abc</p>');
    addGesture(editor, 1, { pos: 2 });
    expect(arrive(editor, 'm1')).toBe(true);
    const html = getRteHtml(editor);
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe('<p>abc</p>');
    editor.commands.redo();
    expect(getRteHtml(editor)).toBe(html);
  });

  it('duas inserções em sequência: a segunda com a posição mapeada', () => {
    const editor = markersEditor('<p></p><p>x</p><p></p>');
    addGesture(editor, 1, { pos: 1 });
    addGesture(editor, 1, { pos: 6, gesture: 2, prefix: 'n' });
    expect(arrive(editor, 'm1')).toBe(true);
    expect(arrive(editor, 'n1')).toBe(true);
    expect(mediaSrcs(editor.state.doc)).toEqual(['/m1.png', '/n1.png']);
    expect(editor.state.doc.child(1).textContent).toBe('x');
    expect(editor.state.doc.childCount).toBe(3);
  });
});

describe('ordem do gesto (E11, R6)', () => {
  it('<p></p> com 3 marcadores, chegadas 2, 3, 1: ordem 1, 2, 3', () => {
    const editor = markersEditor('<p></p>');
    addGesture(editor, 3, { pos: 1 });
    expect(arrive(editor, 'm2')).toBe(true);
    expect(arrive(editor, 'm3')).toBe(true);
    expect(arrive(editor, 'm1')).toBe(true);
    expect(mediaSrcs(editor.state.doc)).toEqual([
      '/m1.png',
      '/m2.png',
      '/m3.png',
    ]);
    expect(editor.state.doc.childCount).toBe(3);
    expect(getRteHtml(editor)).not.toContain('<p>');
  });

  it('só o 2 chega, 1 e 3 cancelados: a figura antes do parágrafo, que fica', () => {
    const editor = markersEditor('<p></p>');
    addGesture(editor, 3, { pos: 1 });
    expect(arrive(editor, 'm2')).toBe(true);
    const doc = editor.state.doc;
    dispatchMeta(editor, { remove: ['m1'] });
    dispatchMeta(editor, { remove: ['m3'] });
    expect(editor.state.doc).toBe(doc);
    expect(getRteHtml(editor)).toMatch(/^<figure[^]*<\/figure><p><\/p>$/);
    expect(uploadState(editor).placed).toEqual([]);
  });

  it('em abc: chegadas 3, 1, 2 → 1, 2, 3 depois do parágrafo', () => {
    const editor = markersEditor('<p>abc</p>');
    addGesture(editor, 3, { pos: 2 });
    for (const id of ['m3', 'm1', 'm2']) expect(arrive(editor, id)).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('abc');
    expect(mediaSrcs(editor.state.doc)).toEqual([
      '/m1.png',
      '/m2.png',
      '/m3.png',
    ]);
  });

  it('Review Focus 3: chega o 2, desfazer, chegam 1 e 3', () => {
    const editor = markersEditor('<p>abc</p>');
    addGesture(editor, 3, { pos: 2 });
    expect(arrive(editor, 'm2')).toBe(true);
    editor.commands.undo();
    expect(arrive(editor, 'm1')).toBe(true);
    expect(arrive(editor, 'm3')).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('abc');
    expect(mediaSrcs(editor.state.doc)).toEqual(['/m1.png', '/m3.png']);
  });

  it('desfazer e refazer uma chegada não perde a ordem', () => {
    const editor = markersEditor('<p></p>');
    addGesture(editor, 3, { pos: 1 });
    expect(arrive(editor, 'm2')).toBe(true);
    editor.commands.undo();
    editor.commands.redo();
    expect(arrive(editor, 'm1')).toBe(true);
    expect(arrive(editor, 'm3')).toBe(true);
    expect(mediaSrcs(editor.state.doc)).toEqual([
      '/m1.png',
      '/m2.png',
      '/m3.png',
    ]);
  });

  it('Review Focus 4: mesmo src nos dois, seleção no segundo nó', () => {
    const editor = markersEditor('<p>abc</p>');
    addGesture(editor, 2, { pos: 2 });
    expect(arrive(editor, 'm1', '/same.png')).toBe(true);
    caret(editor, markerPos(editor, 'm2'));
    vi.spyOn(editor.view, 'hasFocus').mockReturnValue(true);
    expect(selectOnArrival(editor, 'm2')).toBe(true);
    expect(arrive(editor, 'm2', '/same.png', true)).toBe(true);
    expect(mediaSrcs(editor.state.doc)).toEqual(['/same.png', '/same.png']);
    const positions = mediaPositions(editor.state.doc);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(positions[1]);
  });
});
