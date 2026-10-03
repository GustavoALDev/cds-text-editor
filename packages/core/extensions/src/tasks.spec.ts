// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { DOMParser as PMParser } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
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

afterEach(() => destroyTestEditors());

function editorWith(content: string | object) {
  return createTestEditor({ features: ONLY_TASKS }, content as string);
}

function canonical(editor: Editor): string {
  const out = getRteHtml(editor);
  expect(
    validateHtml(out, editor.storage.rtContent.schema, { mode: 'canonical' }),
  ).toEqual([]);
  return out;
}

function html(content: string | object): string {
  return canonical(editorWith(content));
}

/** Cursor no deslocamento `offset` do primeiro bloco de texto igual a `text`. */
function cursorIn(editor: Editor, text: string, offset: number): void {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isTextblock && node.textContent === text) {
      target = pos + 1 + offset;
    }
    return target < 0;
  });
  if (target < 0) throw new Error(`bloco "${text}" não encontrado`);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, target),
    ),
  );
}

/**
 * Tecla pelo `handleKeyDown` da vista, como um `keydown` real (o comando
 * `keyboardShortcut` do Tiptap só repete os passos, não a seleção).
 */
function press(editor: Editor, name: string): boolean {
  const keys = name.split('-');
  const key = keys[keys.length - 1] ?? '';
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: keys.includes('Mod'),
    bubbles: true,
    cancelable: true,
  });
  return (
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, event)) === true
  );
}

const TWO =
  '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">Comprar pão</label></li><li class="rt-task"><label><input type="checkbox" disabled="">Leite</label></li></ul>';

describe('tarefas: saída canônica', () => {
  it('a saída da 03a é ponto fixo e válida em canonical', () => {
    expect(html(TWO)).toBe(TWO);
  });

  it('o nó tem conteúdo inline e o atributo checked', () => {
    const editor = editorWith(TWO);
    const items: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'rtTaskItem') {
        items.push([node.textContent, node.attrs['checked']]);
      }
    });
    expect(items).toEqual([
      ['Comprar pão', true],
      ['Leite', false],
    ]);
    expect(editor.schema.nodes['rtTaskItem']?.spec.content).toBe('inline*');
  });

  it('marcas dentro da tarefa ficam dentro do label', () => {
    expect(
      html(
        '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled=""><strong>A</strong> b</label></li></ul>',
      ),
    ).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled=""><strong>A</strong> b</label></li></ul>',
    );
  });

  it('JSON vira a mesma saída', () => {
    expect(
      html({
        type: 'doc',
        content: [
          {
            type: 'rtTaskList',
            content: [
              {
                type: 'rtTaskItem',
                attrs: { checked: true },
                content: [{ type: 'text', text: 'A' }],
              },
            ],
          },
        ],
      }),
    ).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li></ul>',
    );
  });

  it('editor.getHTML() (documento global) monta o label com o input', () => {
    const editor = editorWith(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li></ul>',
    );
    expect(editor.getHTML()).toContain(
      '<label><input type="checkbox" disabled="" checked="">A</label>',
    );
  });
});

describe('tarefas: leitura tolerante', () => {
  it('formato do Tiptap: data-checked true/false', () => {
    expect(
      html(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>A</p></div></li><li data-type="taskItem" data-checked="false"><div><p>B</p></div></li></ul>',
      ),
    ).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li><li class="rt-task"><label><input type="checkbox" disabled="">B</label></li></ul>',
    );
  });

  it('li sem classe dentro de ul.rt-tasks vira tarefa', () => {
    expect(html('<ul class="rt-tasks"><li>X</li></ul>')).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">X</label></li></ul>',
    );
  });

  it('data-checked vazio → marcada; input[checked] sem data-checked → marcada', () => {
    expect(
      html(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked=""><div><p>A</p></div></li></ul>',
      ),
    ).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li></ul>',
    );
    expect(
      html(
        '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" checked>A</label></li></ul>',
      ),
    ).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li></ul>',
    );
  });

  it('ul comum continua lista de marcadores', () => {
    expect(html('<ul><li><p>a</p></li></ul>')).toBe(
      '<ul><li><p>a</p></li></ul>',
    );
  });

  it('dois parágrafos: o 1º é a tarefa, o 2º sai da lista', () => {
    expect(
      html(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>A</p><p>B</p></div></li></ul>',
      ),
    ).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li></ul><p>B</p>',
    );
  });

  it('dois parágrafos no meio da lista: nenhum texto se perde, na ordem', () => {
    const editor = editorWith(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><div><p>A</p><p>B</p></div></li><li data-type="taskItem" data-checked="true"><div><p>C</p></div></li></ul>',
    );
    const out = canonical(editor);
    expect(
      editor.state.doc.textBetween(0, editor.state.doc.content.size, '|'),
    ).toBe('A|B|C');
    expect(out).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li></ul><p>B</p><ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">C</label></li></ul>',
    );
  });

  it('li[data-type=taskItem] sem div: o p depois do label é o texto', () => {
    expect(
      html(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><p>A</p></li></ul>',
      ),
    ).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li></ul>',
    );
  });

  it('subtarefa: sem ul dentro de li.rt-task, textos A, A1, B na ordem', () => {
    const out = html(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>A</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>A1</p></div></li></ul></div></li><li data-type="taskItem" data-checked="false"><div><p>B</p></div></li></ul>',
    );
    const box = parseBody(out);
    expect(box.querySelectorAll('li.rt-task ul')).toHaveLength(0);
    expect(
      Array.from(box.querySelectorAll('li.rt-task')).map((li) => [
        li.textContent,
        li.querySelector('input')?.hasAttribute('checked'),
      ]),
    ).toEqual([
      ['A', false],
      ['A1', true],
      ['B', false],
    ]);
    // Saída atual (registrar como `expected` em tolerant-cases, Tarefa 16).
    expect(out).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li></ul><ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A1</label></li></ul><ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">B</label></li></ul>',
    );
  });

  it('o parse não muta o DOM de entrada (dois parses do mesmo elemento)', () => {
    const editor = editorWith('<p></p>');
    const input =
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>A</p><p>B</p></div></li></ul><ul class="rt-tasks"><li>X</li></ul>';
    const source = parseBody(input);
    const before = source.outerHTML;
    editor.commands.setContent(input);
    const first = canonical(editor);
    // o mesmo elemento vivo, duas vezes, pelo DOMParser do esquema
    editor.view.dispatch(
      editor.state.tr.replaceWith(
        0,
        editor.state.doc.content.size,
        parseLive(editor, source).content,
      ),
    );
    const second = canonical(editor);
    editor.view.dispatch(
      editor.state.tr.replaceWith(
        0,
        editor.state.doc.content.size,
        parseLive(editor, source).content,
      ),
    );
    expect(canonical(editor)).toBe(second);
    expect(second).toBe(first);
    expect(source.outerHTML).toBe(before);
  });
});

function parseBody(html: string): HTMLElement {
  return new window.DOMParser().parseFromString(html, 'text/html').body;
}

function parseLive(editor: Editor, element: HTMLElement) {
  return PMParser.fromSchema(editor.schema).parse(element);
}

describe('tarefas: comandos', () => {
  it('toggleTaskList converte parágrafos e volta a parágrafos', () => {
    const editor = editorWith('<p>A</p><p>B</p>');
    editor.commands.selectAll();
    expect(editor.commands.toggleTaskList()).toBe(true);
    expect(canonical(editor)).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li><li class="rt-task"><label><input type="checkbox" disabled="">B</label></li></ul>',
    );
    cursorIn(editor, 'B', 0);
    expect(editor.commands.toggleTaskList()).toBe(true);
    expect(canonical(editor)).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li></ul><p>B</p>',
    );
  });

  it('toggleTaskList recusa dentro de item de lista comum', () => {
    const editor = editorWith('<ul><li><p>A</p></li></ul>');
    cursorIn(editor, 'A', 0);
    expect(editor.commands.toggleTaskList()).toBe(false);
  });

  it('toggleTaskItemChecked alterna o item do cursor', () => {
    const editor = editorWith(TWO);
    cursorIn(editor, 'Leite', 1);
    expect(editor.commands.toggleTaskItemChecked()).toBe(true);
    expect(canonical(editor)).toContain(
      '<input type="checkbox" disabled="" checked="">Leite',
    );
    editor.commands.setContent('<p>x</p>');
    expect(editor.commands.toggleTaskItemChecked()).toBe(false);
  });

  it('com tasks: false, toggleTaskList é undefined e não há nós de tarefa', () => {
    const editor = createTestEditor({
      features: { ...ONLY_TASKS, tasks: false },
    });
    const commands = editor.commands as unknown as Record<string, unknown>;
    expect(commands['toggleTaskList']).toBeUndefined();
    expect(commands['toggleTaskItemChecked']).toBeUndefined();
    expect(editor.schema.nodes['rtTaskItem']).toBeUndefined();
  });
});

describe('tarefas: teclado', () => {
  const AB =
    '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li></ul>';

  it('Enter no fim de A marcada cria item desmarcado', () => {
    const editor = editorWith(AB);
    cursorIn(editor, 'A', 1);
    expect(press(editor, 'Enter')).toBe(true);
    editor.commands.insertContent('B');
    expect(canonical(editor)).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li><li class="rt-task"><label><input type="checkbox" disabled="">B</label></li></ul>',
    );
  });

  it('Enter no meio divide o texto', () => {
    const editor = editorWith(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">AB</label></li></ul>',
    );
    cursorIn(editor, 'AB', 1);
    press(editor, 'Enter');
    expect(canonical(editor)).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li><li class="rt-task"><label><input type="checkbox" disabled="">B</label></li></ul>',
    );
  });

  it('Enter em item vazio sai para <p></p> depois da lista', () => {
    const editor = editorWith(AB);
    cursorIn(editor, 'A', 1);
    press(editor, 'Enter');
    expect(press(editor, 'Enter')).toBe(true);
    expect(canonical(editor)).toBe(`${AB}<p></p>`);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('Backspace no início do 2º de 3 itens → lista, parágrafo, lista', () => {
    const editor = editorWith(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li><li class="rt-task"><label><input type="checkbox" disabled="" checked="">B</label></li><li class="rt-task"><label><input type="checkbox" disabled="">C</label></li></ul>',
    );
    cursorIn(editor, 'B', 0);
    expect(press(editor, 'Backspace')).toBe(true);
    expect(canonical(editor)).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li></ul><p>B</p><ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">C</label></li></ul>',
    );
    expect(editor.state.selection.$from.parent.textContent).toBe('B');
    expect(editor.state.selection.$from.parentOffset).toBe(0);
  });

  it('Backspace fora do início não é capturado pelo teclado de item', () => {
    const editor = editorWith(AB);
    cursorIn(editor, 'A', 1);
    press(editor, 'Backspace');
    expect(editor.state.doc.firstChild?.type.name).toBe('rtTaskList');
  });

  it('Mod-Enter alterna checked', () => {
    const editor = editorWith(AB);
    cursorIn(editor, 'A', 1);
    expect(press(editor, 'Mod-Enter')).toBe(true);
    expect(canonical(editor)).toBe(
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li></ul>',
    );
    press(editor, 'Mod-Enter');
    expect(canonical(editor)).toBe(AB);
  });
});
