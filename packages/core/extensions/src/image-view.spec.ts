// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import type { RteEditorOptions } from './types';

const ONLY_MEDIA = {
  colors: false,
  code: false,
  tables: false,
  tasks: false,
  media: true,
  embeds: false,
  newsBlocks: false,
};

const SIZED =
  '<figure class="rt-figure rt-figure--center"><img src="/a.jpg" alt="Gato" width="400" height="200"><figcaption>Legenda</figcaption></figure><p>fim</p>';
const UNSIZED =
  '<figure class="rt-figure rt-figure--center"><img src="/a.jpg" alt="Gato"></figure><p>fim</p>';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

afterEach(() => {
  destroyTestEditors();
  vi.restoreAllMocks();
});

interface Setup {
  /** Largura e altura exibidas do `img`. */
  shown?: [number, number];
  /** `clientWidth` da área do editor. */
  area?: number;
  options?: RteEditorOptions;
}

function editorWith(content: string | object = SIZED, setup: Setup = {}) {
  const editor = createTestEditor(
    { ...setup.options, features: ONLY_MEDIA },
    content as string,
  );
  const [w, h] = setup.shown ?? [400, 200];
  stubRect(img(editor), w, h);
  Object.defineProperty(editor.view.dom, 'clientWidth', {
    configurable: true,
    value: setup.area ?? 800,
  });
  return editor;
}

function stubRect(element: Element, width: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width,
      height,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    }) as DOMRect;
}

function figure(editor: Editor): HTMLElement {
  const el = editor.view.dom.querySelector('figure');
  if (!(el instanceof HTMLElement)) throw new Error('sem figure');
  return el;
}

function img(editor: Editor): HTMLImageElement {
  const el = editor.view.dom.querySelector('img');
  if (!(el instanceof HTMLImageElement)) throw new Error('sem img');
  return el;
}

function handle(editor: Editor, corner: Corner): HTMLElement {
  const el = figure(editor).querySelector(`.rte-image__handle--${corner}`);
  if (!(el instanceof HTMLElement)) throw new Error(`sem alça ${corner}`);
  return el;
}

function pointer(
  target: EventTarget,
  type: string,
  init: PointerEventInit = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    button: 0,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function imageAttrs(editor: Editor): Record<string, unknown> {
  let attrs: Record<string, unknown> | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'rtImage') attrs = node.attrs;
    return attrs === null;
  });
  if (!attrs) throw new Error('sem rtImage');
  return attrs;
}

function size(editor: Editor): [unknown, unknown] {
  const a = imageAttrs(editor);
  return [a['width'], a['height']];
}

function shown(editor: Editor): [string | null, string | null] {
  const el = img(editor);
  return [el.getAttribute('width'), el.getAttribute('height')];
}

function countChanges(editor: Editor): () => number {
  let count = 0;
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) count += 1;
  });
  return () => count;
}

/** Arrasto completo de `corner` com deslocamento `dx`/`dy`. */
function drag(editor: Editor, corner: Corner, dx: number, dy = 0): void {
  const h = handle(editor, corner);
  pointer(h, 'pointerdown', { clientX: 0, clientY: 0 });
  pointer(h, 'pointermove', { clientX: dx, clientY: dy });
  pointer(h, 'pointerup', { clientX: dx, clientY: dy });
}

describe('ImageView: estrutura', () => {
  it('figure.rt-figure com img, 4 alças aria-hidden e figcaption', () => {
    const editor = editorWith();
    const fig = figure(editor);
    expect(fig.classList.contains('rt-figure')).toBe(true);
    expect(fig.classList.contains('rt-figure--center')).toBe(true);
    const el = img(editor);
    expect(el.parentElement).toBe(fig);
    expect(el.getAttribute('src')).toBe('/a.jpg');
    expect(el.getAttribute('alt')).toBe('Gato');
    expect(shown(editor)).toEqual(['400', '200']);
    const handles = Array.from(fig.querySelectorAll('.rte-image__handle'));
    expect(handles.map((h) => h.className)).toEqual([
      'rte-image__handle rte-image__handle--nw',
      'rte-image__handle rte-image__handle--ne',
      'rte-image__handle rte-image__handle--sw',
      'rte-image__handle rte-image__handle--se',
    ]);
    for (const h of handles) {
      expect(h.tagName).toBe('SPAN');
      expect(h.getAttribute('aria-hidden')).toBe('true');
      expect(h.parentElement).toBe(fig);
    }
    expect(fig.querySelector('figcaption')?.textContent).toBe('Legenda');
  });

  it('legenda com crédito: texto + espaço + small.rt-credit; sem os dois, sem figcaption', () => {
    const editor = editorWith(
      '<figure class="rt-figure rt-figure--left"><img src="/a.jpg" alt="x"><figcaption>Leg <small class="rt-credit">Ana</small></figcaption></figure>',
    );
    const fig = figure(editor);
    expect(fig.classList.contains('rt-figure--left')).toBe(true);
    const caption = fig.querySelector('figcaption');
    expect(caption?.childNodes[0]?.nodeValue).toBe('Leg ');
    expect(caption?.querySelector('small.rt-credit')?.textContent).toBe('Ana');
    expect(figure(editorWith(UNSIZED)).querySelector('figcaption')).toBeNull();
  });

  it('NodeSelection → rte-image--selected; seleção fora remove', () => {
    const editor = editorWith();
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)),
    );
    expect(figure(editor).classList.contains('rte-image--selected')).toBe(
      false,
    );
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
    );
    expect(figure(editor).classList.contains('rte-image--selected')).toBe(true);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)),
    );
    expect(figure(editor).classList.contains('rte-image--selected')).toBe(
      false,
    );
  });

  it('update com legenda e alinhamento novos muda o DOM sem recriar o img', () => {
    const editor = editorWith();
    const before = img(editor);
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
    );
    expect(
      editor.commands.updateImage({
        caption: 'Nova',
        credit: 'Bia',
        align: 'right',
      }),
    ).toBe(true);
    expect(img(editor)).toBe(before);
    const fig = figure(editor);
    expect(fig.classList.contains('rt-figure--right')).toBe(true);
    expect(fig.classList.contains('rt-figure--center')).toBe(false);
    expect(fig.classList.contains('rte-image--selected')).toBe(true);
    expect(fig.querySelector('figcaption')?.textContent).toBe('Nova Bia');
    editor.commands.updateImage({ caption: '', credit: '' });
    expect(img(editor)).toBe(before);
    expect(figure(editor).querySelector('figcaption')).toBeNull();
  });

  it('atributos crus do JSON passam pelas checagens antes do DOM', () => {
    const editor = createTestEditor(
      { features: ONLY_MEDIA },
      {
        type: 'doc',
        content: [
          {
            type: 'rtImage',
            attrs: {
              src: 'javascript:alert(1)',
              srcset: 'javascript:alert(1) 1x',
              width: 'abc',
              height: -3,
              align: 'evil',
              alt: 42,
            },
          },
        ],
      },
    );
    const el = img(editor);
    expect(el.hasAttribute('src')).toBe(false);
    expect(el.hasAttribute('srcset')).toBe(false);
    expect(el.hasAttribute('width')).toBe(false);
    expect(el.hasAttribute('height')).toBe(false);
    expect(el.getAttribute('alt')).toBe('');
    expect(figure(editor).classList.contains('rt-figure--center')).toBe(true);
    expect(figure(editor).classList.contains('rt-figure--evil')).toBe(false);
  });
});

describe('ImageView: arrasto', () => {
  it('se: prévia no img durante o arrasto; pointerup grava numa transação; um undo volta', () => {
    const editor = editorWith();
    const changes = countChanges(editor);
    const h = handle(editor, 'se');
    const down = pointer(h, 'pointerdown', { clientX: 0, clientY: 0 });
    expect(down.defaultPrevented).toBe(true);
    pointer(h, 'pointermove', { clientX: 100, clientY: 0 });
    expect(shown(editor)).toEqual(['500', '250']);
    expect(size(editor)).toEqual([400, 200]);
    expect(changes()).toBe(0);
    pointer(h, 'pointermove', { clientX: 60, clientY: 0 });
    expect(shown(editor)).toEqual(['460', '230']);
    pointer(h, 'pointermove', { clientX: 100, clientY: 0 });
    pointer(h, 'pointerup', { clientX: 100, clientY: 0 });
    expect(size(editor)).toEqual([500, 250]);
    expect(shown(editor)).toEqual(['500', '250']);
    expect(changes()).toBe(1);
    // Depois do arrasto, mover o ponteiro não muda nada.
    pointer(h, 'pointermove', { clientX: 300, clientY: 0 });
    expect(shown(editor)).toEqual(['500', '250']);
    expect(editor.commands.undo()).toBe(true);
    expect(size(editor)).toEqual([400, 200]);
    expect(shown(editor)).toEqual(['400', '200']);
  });

  it('nw com dx +100 → 300×150', () => {
    const editor = editorWith();
    drag(editor, 'nw', 100);
    expect(size(editor)).toEqual([300, 150]);
  });

  it('ne e sw seguem computeResize (eixo de maior variação)', () => {
    const editor = editorWith();
    drag(editor, 'ne', 50);
    expect(size(editor)).toEqual([450, 225]);
    stubRect(img(editor), 450, 225);
    drag(editor, 'sw', 0, 25);
    expect(size(editor)).toEqual([500, 250]);
  });

  it('nw com dx −1000 → 48×24 (minWidth padrão)', () => {
    const editor = editorWith();
    drag(editor, 'nw', 1000);
    expect(size(editor)).toEqual([48, 24]);
  });

  it('image.minWidth 100 → 100×50', () => {
    const editor = editorWith(SIZED, { options: { image: { minWidth: 100 } } });
    drag(editor, 'nw', 1000);
    expect(size(editor)).toEqual([100, 50]);
  });

  it('largura máxima = clientWidth da área do editor (450)', () => {
    const editor = editorWith(SIZED, { area: 450 });
    drag(editor, 'se', 1000);
    expect(size(editor)).toEqual([450, 225]);
  });

  it('clientWidth 0 → teto 10000', () => {
    const editor = editorWith(SIZED, { area: 0 });
    drag(editor, 'se', 20000);
    expect(size(editor)).toEqual([10000, 5000]);
  });

  it('escala: exibida 200 (atributo 400) e dx 50 → 500×250; teto = área × escala', () => {
    const editor = editorWith(SIZED, { shown: [200, 100] });
    drag(editor, 'se', 50);
    expect(size(editor)).toEqual([500, 250]);
    const capped = editorWith(SIZED, { shown: [200, 100], area: 300 });
    drag(capped, 'se', 1000);
    expect(size(capped)).toEqual([600, 300]);
  });

  it('largura exibida 0 → escala 1', () => {
    const editor = editorWith(SIZED, { shown: [0, 0] });
    drag(editor, 'se', 100);
    expect(size(editor)).toEqual([500, 250]);
  });

  it('Escape durante o arrasto restaura o img sem transação', () => {
    const editor = editorWith();
    const changes = countChanges(editor);
    const h = handle(editor, 'se');
    pointer(h, 'pointerdown', { clientX: 0, clientY: 0 });
    pointer(h, 'pointermove', { clientX: 100, clientY: 0 });
    const key = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    editor.view.dom.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(shown(editor)).toEqual(['400', '200']);
    pointer(h, 'pointermove', { clientX: 200, clientY: 0 });
    pointer(h, 'pointerup', { clientX: 200, clientY: 0 });
    expect(shown(editor)).toEqual(['400', '200']);
    expect(size(editor)).toEqual([400, 200]);
    expect(changes()).toBe(0);
  });

  it('pointercancel restaura o img sem transação', () => {
    const editor = editorWith();
    const changes = countChanges(editor);
    const h = handle(editor, 'ne');
    pointer(h, 'pointerdown', { clientX: 0, clientY: 0 });
    pointer(h, 'pointermove', { clientX: 100, clientY: 0 });
    expect(shown(editor)).toEqual(['500', '250']);
    pointer(h, 'pointercancel');
    expect(shown(editor)).toEqual(['400', '200']);
    pointer(h, 'pointerup', { clientX: 100, clientY: 0 });
    expect(size(editor)).toEqual([400, 200]);
    expect(changes()).toBe(0);
  });

  it('sem width/height no nó: parte do tamanho exibido (300×150) e grava os dois', () => {
    const editor = editorWith(UNSIZED, { shown: [300, 150] });
    expect(shown(editor)).toEqual([null, null]);
    drag(editor, 'se', 100);
    expect(size(editor)).toEqual([400, 200]);
  });

  it('sem width/height e sem tamanho exibido: não arrasta', () => {
    const editor = editorWith(UNSIZED, { shown: [0, 0] });
    const changes = countChanges(editor);
    drag(editor, 'se', 100);
    expect(size(editor)).toEqual([null, null]);
    expect(changes()).toBe(0);
  });

  it('pointerup sem mover não cria transação', () => {
    const editor = editorWith();
    const changes = countChanges(editor);
    drag(editor, 'se', 0);
    expect(changes()).toBe(0);
  });

  it('mantém a NodeSelection da imagem depois do arrasto', () => {
    const editor = editorWith();
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
    );
    drag(editor, 'se', 100);
    const selection = editor.state.selection;
    expect(selection instanceof NodeSelection && selection.from === 0).toBe(
      true,
    );
    expect(figure(editor).classList.contains('rte-image--selected')).toBe(true);
  });

  it('botão secundário não inicia arrasto', () => {
    const editor = editorWith();
    const h = handle(editor, 'se');
    const down = pointer(h, 'pointerdown', { button: 2, clientX: 0 });
    expect(down.defaultPrevented).toBe(false);
    pointer(h, 'pointermove', { clientX: 100 });
    pointer(h, 'pointerup', { clientX: 100 });
    expect(shown(editor)).toEqual(['400', '200']);
    expect(size(editor)).toEqual([400, 200]);
  });

  it('editor não editável: não inicia arrasto', () => {
    const editor = editorWith();
    editor.setEditable(false);
    drag(editor, 'se', 100);
    expect(size(editor)).toEqual([400, 200]);
  });

  it('usa setPointerCapture quando existe', () => {
    const editor = editorWith();
    const h = handle(editor, 'se');
    const capture = vi.fn();
    Object.assign(h, { setPointerCapture: capture });
    pointer(h, 'pointerdown', { clientX: 0, pointerId: 7 });
    expect(capture).toHaveBeenCalledWith(7);
    pointer(h, 'pointerup', { clientX: 0 });
  });
});

describe('ImageView: contrato de NodeView', () => {
  function view(editor: Editor) {
    const desc = (figure(editor) as unknown as { pmViewDesc?: unknown })
      .pmViewDesc as {
      spec: {
        stopEvent(e: Event): boolean;
        ignoreMutation(m: unknown): boolean;
      };
    };
    return desc.spec;
  }

  it('stopEvent é true para evento com alvo na alça e false no img', () => {
    const editor = editorWith();
    const spec = view(editor);
    const onHandle = new MouseEvent('mousedown');
    Object.defineProperty(onHandle, 'target', { value: handle(editor, 'sw') });
    expect(spec.stopEvent(onHandle)).toBe(true);
    const onImg = new MouseEvent('mousedown');
    Object.defineProperty(onImg, 'target', { value: img(editor) });
    expect(spec.stopEvent(onImg)).toBe(false);
  });

  it('ignoreMutation() → true', () => {
    const editor = editorWith();
    expect(view(editor).ignoreMutation({ type: 'attributes' })).toBe(true);
  });

  it('destroy no meio do arrasto remove os ouvintes de document', () => {
    const editor = editorWith();
    const remove = vi.spyOn(document, 'removeEventListener');
    const h = handle(editor, 'se');
    pointer(h, 'pointerdown', { clientX: 0 });
    pointer(h, 'pointermove', { clientX: 100 });
    destroyTestEditors();
    const types = remove.mock.calls.map(([type]) => type);
    expect(types).toEqual(
      expect.arrayContaining([
        'pointermove',
        'pointerup',
        'pointercancel',
        'keydown',
      ]),
    );
    // Sem ouvintes vivos: eventos depois do destroy não lançam.
    expect(() =>
      pointer(document, 'pointerup', { clientX: 100 }),
    ).not.toThrow();
  });

  it('ouvintes de document só durante o arrasto', () => {
    const editor = editorWith();
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    expect(add).not.toHaveBeenCalled();
    drag(editor, 'se', 10);
    const ours = (calls: unknown[][]) =>
      calls
        .map(([type]) => String(type))
        .filter((type) => type.startsWith('pointer') || type === 'keydown')
        .sort();
    const added = ours(add.mock.calls);
    const removed = ours(remove.mock.calls);
    expect(added).toEqual([
      'keydown',
      'pointercancel',
      'pointermove',
      'pointerup',
    ]);
    expect(removed).toEqual(added);
  });
});
