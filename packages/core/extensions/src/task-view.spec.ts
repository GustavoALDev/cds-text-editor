// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

const ONLY_TASKS = {
  colors: false,
  code: false,
  tables: false,
  tasks: true,
  media: false,
  embeds: false,
  newsBlocks: false,
};

const AB =
  '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li><li class="rt-task"><label><input type="checkbox" disabled="">B</label></li></ul>';

afterEach(() => destroyTestEditors());

function editorWith(
  content = AB,
  labels?: { taskCheckbox(t: string): string },
) {
  return createTestEditor(
    { features: ONLY_TASKS, ...(labels ? { labels } : {}) },
    content,
  );
}

function items(editor: Editor): HTMLLIElement[] {
  return Array.from(editor.view.dom.querySelectorAll('li.rt-task'));
}

function checkbox(li: Element): HTMLInputElement {
  const input = li.querySelector('input');
  if (!(input instanceof HTMLInputElement)) throw new Error('sem checkbox');
  return input;
}

describe('TaskItemView: estrutura', () => {
  it('li[data-checked] > span.rte-task__check[contenteditable=false] > input + span.rte-task__text', () => {
    const editor = editorWith();
    const [first, second] = items(editor);
    if (!first || !second) throw new Error('itens ausentes');
    expect(first.getAttribute('data-checked')).toBe('true');
    expect(second.getAttribute('data-checked')).toBe('false');
    const children = Array.from(first.children);
    expect(children.map((c) => c.className)).toEqual([
      'rte-task__check',
      'rte-task__text',
    ]);
    const check = children[0] as HTMLElement;
    expect(check.tagName).toBe('SPAN');
    expect(check.getAttribute('contenteditable')).toBe('false');
    const input = checkbox(first);
    expect(input.parentElement).toBe(check);
    expect(input.type).toBe('checkbox');
    expect(input.checked).toBe(true);
    expect(checkbox(second).checked).toBe(false);
    expect((children[1] as HTMLElement).textContent).toBe('A');
    expect(first.querySelector('label')).toBeNull();
  });

  it('aria-label = labels.taskCheckbox(texto) e muda ao digitar', () => {
    const editor = editorWith(AB, { taskCheckbox: (t) => `Tarefa: ${t}` });
    const [first] = items(editor);
    if (!first) throw new Error('item ausente');
    expect(checkbox(first).getAttribute('aria-label')).toBe('Tarefa: A');
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)),
    );
    editor.commands.insertContent('x');
    expect(
      checkbox(items(editor)[0] as Element).getAttribute('aria-label'),
    ).toBe('Tarefa: Ax');
  });

  it('rótulo padrão (en) quando não há labels', () => {
    const editor = editorWith();
    expect(
      checkbox(items(editor)[1] as Element).getAttribute('aria-label'),
    ).toBe('Task: B');
  });
});

describe('TaskItemView: interação', () => {
  it('editor.setEditable(false) desabilita o checkbox; true reabilita', () => {
    const editor = editorWith();
    const input = checkbox(items(editor)[0] as Element);
    expect(input.disabled).toBe(false);
    editor.setEditable(false);
    expect(input.disabled).toBe(true);
    editor.setEditable(true);
    expect(input.disabled).toBe(false);
  });

  it('editor criado não editável: checkbox desabilitado', () => {
    const editor = createTestEditor({ features: ONLY_TASKS }, AB, {
      editable: false,
    });
    expect(checkbox(items(editor)[0] as Element).disabled).toBe(true);
  });

  it('mousedown no checkbox tem defaultPrevented', () => {
    const editor = editorWith();
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    checkbox(items(editor)[0] as Element).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('teclas no checkbox não chegam ao editor (stopEvent)', () => {
    const editor = editorWith();
    const before = editor.state.doc;
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    checkbox(items(editor)[0] as Element).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(editor.state.doc).toBe(before);
  });

  it('click alterna checked por transação (com desfazer)', () => {
    const editor = editorWith();
    let transactions = 0;
    editor.on('transaction', () => {
      transactions += 1;
    });
    const second = items(editor)[1] as Element;
    checkbox(second).click();
    expect(transactions).toBe(1);
    expect(getRteHtml(editor)).toContain(
      '<input type="checkbox" disabled="" checked="">B',
    );
    const li = items(editor)[1] as Element;
    expect(li).toBe(second);
    expect(li.getAttribute('data-checked')).toBe('true');
    expect(checkbox(li).checked).toBe(true);
    editor.commands.undo();
    expect(checkbox(items(editor)[1] as Element).checked).toBe(false);
  });

  it('click com o editor não editável não muda o documento', () => {
    const editor = editorWith();
    editor.setEditable(false);
    const input = checkbox(items(editor)[1] as Element);
    input.disabled = false; // simula um clique que escapou do disabled
    input.click();
    expect(input.checked).toBe(false);
    expect(getRteHtml(editor)).toBe(AB);
  });

  it('update com outro nó do mesmo tipo devolve true sem recriar o li', () => {
    const editor = editorWith();
    const before = items(editor)[0];
    editor.commands.command(({ tr }) => {
      tr.setNodeAttribute(1, 'checked', false);
      return true;
    });
    const after = items(editor)[0];
    expect(after).toBe(before);
    expect(after?.getAttribute('data-checked')).toBe('false');
    expect(checkbox(after as Element).checked).toBe(false);
  });

  it('a vista não altera getRteHtml nem getHTML', () => {
    const editor = editorWith();
    expect(getRteHtml(editor)).toBe(AB);
    expect(editor.getHTML()).toBe(AB);
  });
});
