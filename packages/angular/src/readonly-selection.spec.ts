import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@comodeviaser/rte-angular';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settle } from './testing-support/render';

// D10: `readonly` seleciona pelo teclado como um `input` somente leitura. O
// jsdom não tem `Selection.modify`: o teste o espia (o navegador real está no
// N2, `e2e/angular/editor-states.spec.ts`).

type Modify = (alter: string, direction: string, granularity: string) => void;
const proto = Selection.prototype as unknown as Record<string, unknown>;
let modify: ReturnType<typeof vi.fn<Modify>>;

beforeEach(() => {
  modify = vi.fn<Modify>();
  proto['modify'] = modify;
});

afterEach(() => {
  Reflect.deleteProperty(proto, 'modify');
  vi.restoreAllMocks();
});

async function setup(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(RteEditor);
  fixture.componentRef.setInput('value', '<p>abc</p>');
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  let values = 0;
  fixture.componentInstance.value.subscribe(() => values++);
  fixture.autoDetectChanges();
  await settle(fixture);
  const editor = fixture.componentInstance.editor() as Editor;
  let docChanges = 0;
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) docChanges++;
  });
  return {
    editor,
    dom: editor.view.dom,
    counts: () => ({ values, docChanges }),
  };
}

function key(
  dom: HTMLElement,
  init: KeyboardEventInit & { key: string },
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  dom.dispatchEvent(event);
  return event;
}

describe('RteEditor: seleção pelo teclado em readonly (D10)', () => {
  it('Shift+setas, Shift+Home/End e Ctrl estendem a seleção sem editar', async () => {
    const { dom, counts } = await setup({ readonly: true });
    const cases = [
      [{ key: 'ArrowRight', shiftKey: true }, 'forward', 'character'],
      [{ key: 'ArrowLeft', shiftKey: true }, 'backward', 'character'],
      [{ key: 'ArrowDown', shiftKey: true }, 'forward', 'line'],
      [{ key: 'ArrowUp', shiftKey: true }, 'backward', 'line'],
      [{ key: 'End', shiftKey: true }, 'forward', 'lineboundary'],
      [{ key: 'Home', shiftKey: true }, 'backward', 'lineboundary'],
      [{ key: 'ArrowRight', shiftKey: true, ctrlKey: true }, 'forward', 'word'],
      [
        { key: 'Home', shiftKey: true, ctrlKey: true },
        'backward',
        'documentboundary',
      ],
    ] as const;
    for (const [init, direction, granularity] of cases) {
      modify.mockClear();
      const event = key(dom, init);
      expect(modify).toHaveBeenCalledExactlyOnceWith(
        'extend',
        direction,
        granularity,
      );
      expect(event.defaultPrevented).toBe(true);
    }
    expect(counts()).toEqual({ values: 0, docChanges: 0 });
  });

  it('sem seleção dentro do editável (foco por Tab), parte da seleção do documento', async () => {
    const { dom } = await setup({ readonly: true });
    const outside = document.createElement('span');
    outside.textContent = 'fora';
    document.body.appendChild(outside);
    try {
      document.getSelection()?.collapse(outside.firstChild, 1);
      let anchor: Node | null = null;
      modify.mockImplementation(function (this: Selection) {
        anchor = this.anchorNode;
      });
      key(dom, { key: 'ArrowRight', shiftKey: true });
      expect(modify).toHaveBeenCalledOnce();
      expect(anchor !== null && dom.contains(anchor)).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it('editável: o navegador decide (nem com Shift)', async () => {
    const { dom } = await setup({});
    for (const init of [
      { key: 'ArrowRight', shiftKey: true },
      { key: 'ArrowRight' },
    ]) {
      expect(key(dom, init).defaultPrevented).toBe(false);
    }
    expect(modify).not.toHaveBeenCalled();
  });

  it('readonly sem Shift, com Alt ou Meta ou outra tecla: o navegador decide', async () => {
    const { dom } = await setup({ readonly: true });
    for (const init of [
      { key: 'ArrowRight' },
      { key: 'ArrowRight', shiftKey: true, altKey: true },
      { key: 'ArrowRight', shiftKey: true, metaKey: true },
      { key: 'a', shiftKey: true },
    ]) {
      expect(key(dom, init).defaultPrevented).toBe(false);
    }
    expect(modify).not.toHaveBeenCalled();
  });

  it('nomes do protótipo de Object como tecla (eventos sintéticos) não são mapeados', async () => {
    const { dom } = await setup({ readonly: true });
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      for (const name of [
        'constructor',
        'toString',
        'hasOwnProperty',
        '__proto__',
        'valueOf',
      ]) {
        expect(key(dom, { key: name, shiftKey: true }).defaultPrevented).toBe(
          false,
        );
      }
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
    expect(modify).not.toHaveBeenCalled();
  });
});
