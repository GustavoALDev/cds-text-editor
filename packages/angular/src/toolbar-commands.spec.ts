import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import {
  createTestEditor,
  destroyTestEditors,
  selectText,
} from './testing-support/editors';
import { runTableOp, runToolbarCommand } from './toolbar/commands';
import { RTE_TOOLBAR_ITEMS, type RteToolbarItemId } from './toolbar/items';

afterEach(() => destroyTestEditors());

interface Case {
  id: RteToolbarItemId;
  value?: string | null;
  doc: string;
  /** Texto a selecionar e deslocamentos (`selectText`). */
  select: [text: string, from?: number, to?: number];
  /** Preparação extra (p. ex. uma edição para o `undo`). */
  prepare?: (editor: Editor) => void;
  expected: string;
  /** O caso desfaz com um `undo()` (falso para `undo`/`redo`). */
  undoable?: false;
}

const P = '<p>ab</p>';
const LIST = '<ul><li><p>a</p></li><li><p>b</p></li></ul>';
const TASKS =
  '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">a</label></li><li class="rt-task"><label><input type="checkbox" disabled="">b</label></li></ul>';
const CODE = '<pre><code>x = 1</code></pre>';
// Títulos sintetizados com os rótulos padrão do core (inglês).
const CALLOUT =
  '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">Information</p><p>ab</p></aside>';
const TABLE =
  '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>';
const td = (text: string, attrs = '') => `<td${attrs}><p>${text}</p></td>`;
const th = (text: string, attrs = '') => `<th${attrs}><p>${text}</p></th>`;
const tr = (...cells: string[]) => `<tr>${cells.join('')}</tr>`;
const table = (...rows: string[]) =>
  `<table><tbody>${rows.join('')}</tbody></table>`;
const EMPTY_TD = '<td><p></p></td>';
const EMPTY_TH = '<th><p></p></th>';

const CASES: Case[] = [
  {
    id: 'undo',
    doc: P,
    select: ['ab', 2],
    prepare: (e) => e.commands.insertContent('c'),
    expected: P,
    undoable: false,
  },
  {
    id: 'redo',
    doc: P,
    select: ['ab', 2],
    prepare: (e) => {
      e.commands.insertContent('c');
      e.commands.undo();
    },
    expected: '<p>abc</p>',
    undoable: false,
  },
  {
    id: 'blockType',
    value: 'paragraph',
    doc: '<h2>ab</h2>',
    select: ['ab', 1],
    expected: P,
  },
  {
    id: 'blockType',
    value: 'heading2',
    doc: P,
    select: ['ab', 1],
    expected: '<h2 id="rt-ab">ab</h2>',
  },
  {
    id: 'blockType',
    value: 'heading3',
    doc: P,
    select: ['ab', 1],
    expected: '<h3 id="rt-ab">ab</h3>',
  },
  {
    id: 'blockType',
    value: 'heading4',
    doc: P,
    select: ['ab', 1],
    expected: '<h4 id="rt-ab">ab</h4>',
  },
  {
    id: 'bold',
    doc: P,
    select: ['ab', 0, 1],
    expected: '<p><strong>a</strong>b</p>',
  },
  {
    id: 'italic',
    doc: P,
    select: ['ab', 0, 1],
    expected: '<p><em>a</em>b</p>',
  },
  {
    id: 'underline',
    doc: P,
    select: ['ab', 0, 1],
    expected: '<p><u>a</u>b</p>',
  },
  {
    id: 'strike',
    doc: P,
    select: ['ab', 0, 1],
    expected: '<p><s>a</s>b</p>',
  },
  {
    id: 'code',
    doc: P,
    select: ['ab', 0, 1],
    expected: '<p><code>a</code>b</p>',
  },
  {
    id: 'superscript',
    doc: P,
    select: ['ab', 0, 1],
    expected: '<p><sup>a</sup>b</p>',
  },
  {
    id: 'subscript',
    doc: P,
    select: ['ab', 0, 1],
    expected: '<p><sub>a</sub>b</p>',
  },
  {
    id: 'textColor',
    value: 'red',
    doc: P,
    select: ['ab', 0, 1],
    expected:
      '<p><span data-rt-color="red" style="color: #b3261e">a</span>b</p>',
  },
  {
    id: 'textColor',
    value: null,
    doc: '<p><span data-rt-color="red">a</span>b</p>',
    select: ['ab', 0, 1],
    expected: P,
  },
  {
    id: 'highlight',
    value: 'yellow',
    doc: P,
    select: ['ab', 0, 1],
    expected:
      '<p><mark data-rt-color="yellow" style="background-color: #fff3a3">a</mark>b</p>',
  },
  {
    id: 'highlight',
    value: null,
    doc: '<p><mark data-rt-color="green">a</mark>b</p>',
    select: ['ab', 0, 1],
    expected: P,
  },
  {
    id: 'bulletList',
    doc: P,
    select: ['ab', 1],
    expected: '<ul><li><p>ab</p></li></ul>',
  },
  {
    id: 'orderedList',
    doc: P,
    select: ['ab', 1],
    expected: '<ol><li><p>ab</p></li></ol>',
  },
  {
    id: 'taskList',
    doc: P,
    select: ['ab', 1],
    expected:
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">ab</label></li></ul>',
  },
  {
    id: 'indent',
    doc: LIST,
    select: ['b', 1],
    expected: '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>',
  },
  {
    id: 'outdent',
    doc: '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>',
    select: ['b', 1],
    expected: LIST,
  },
  ...(['left', 'center', 'right', 'justify'] as const).map((value): Case => ({
    id: 'align',
    value,
    doc: P,
    select: ['ab', 1],
    expected: `<p style="text-align: ${value}">ab</p>`,
  })),
  {
    id: 'blockquote',
    doc: P,
    select: ['ab', 1],
    expected: '<blockquote><p>ab</p></blockquote>',
  },
  {
    id: 'codeBlock',
    doc: P,
    select: ['ab', 1],
    expected: '<pre><code>ab</code></pre>',
  },
  {
    id: 'codeLanguage',
    value: 'javascript',
    doc: CODE,
    select: ['x = 1', 1],
    expected: '<pre><code class="language-javascript">x = 1</code></pre>',
  },
  {
    id: 'codeLanguage',
    value: 'plain',
    doc: '<pre><code class="language-javascript">x = 1</code></pre>',
    select: ['x = 1', 1],
    expected: CODE,
  },
  {
    id: 'horizontalRule',
    doc: P,
    select: ['ab', 2],
    expected: '<p>ab</p><hr><p></p>',
  },
  {
    id: 'table',
    value: 'insertTable',
    doc: P,
    select: ['ab', 2],
    expected:
      '<p>ab</p>' +
      table(
        tr(EMPTY_TH, EMPTY_TH, EMPTY_TH),
        tr(EMPTY_TD, EMPTY_TD, EMPTY_TD),
        tr(EMPTY_TD, EMPTY_TD, EMPTY_TD),
      ),
  },
  {
    id: 'table',
    value: 'addRowBefore',
    doc: TABLE,
    select: ['c', 1],
    expected: table(
      tr(td('a'), td('b')),
      tr(EMPTY_TD, EMPTY_TD),
      tr(td('c'), td('d')),
    ),
  },
  {
    id: 'table',
    value: 'addRowAfter',
    doc: TABLE,
    select: ['c', 1],
    expected: table(
      tr(td('a'), td('b')),
      tr(td('c'), td('d')),
      tr(EMPTY_TD, EMPTY_TD),
    ),
  },
  {
    id: 'table',
    value: 'addColumnBefore',
    doc: TABLE,
    select: ['b', 1],
    expected: table(
      tr(td('a'), EMPTY_TD, td('b')),
      tr(td('c'), EMPTY_TD, td('d')),
    ),
  },
  {
    id: 'table',
    value: 'addColumnAfter',
    doc: TABLE,
    select: ['b', 1],
    expected: table(
      tr(td('a'), td('b'), EMPTY_TD),
      tr(td('c'), td('d'), EMPTY_TD),
    ),
  },
  {
    id: 'table',
    value: 'deleteRow',
    doc: TABLE,
    select: ['c', 1],
    expected: table(tr(td('a'), td('b'))),
  },
  {
    id: 'table',
    value: 'deleteColumn',
    doc: TABLE,
    select: ['b', 1],
    expected: table(tr(td('a')), tr(td('c'))),
  },
  {
    id: 'table',
    value: 'mergeCells',
    doc: TABLE,
    select: ['a', 1],
    prepare: (e) => {
      const cells: number[] = [];
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === 'tableCell') cells.push(pos);
      });
      e.view.dispatch(
        e.state.tr.setSelection(
          CellSelection.create(e.state.doc, cells[0] ?? 0, cells[1] ?? 0),
        ),
      );
    },
    expected: table(tr(td('a</p><p>b', ' colspan="2"')), tr(td('c'), td('d'))),
  },
  {
    id: 'table',
    value: 'splitCell',
    doc: table(tr(td('a', ' colspan="2"')), tr(td('c'), td('d'))),
    select: ['a', 1],
    expected: table(tr(td('a'), EMPTY_TD), tr(td('c'), td('d'))),
  },
  {
    id: 'table',
    value: 'toggleHeaderRow',
    doc: TABLE,
    select: ['a', 1],
    expected: table(tr(th('a'), th('b')), tr(td('c'), td('d'))),
  },
  {
    id: 'table',
    value: 'toggleHeaderColumn',
    doc: TABLE,
    select: ['a', 1],
    expected: table(tr(th('a'), td('b')), tr(th('c'), td('d'))),
  },
  {
    id: 'table',
    value: 'deleteTable',
    doc: `${TABLE}<p>z</p>`,
    select: ['a', 1],
    expected: '<p>z</p>',
  },
  ...(['info', 'success', 'warning', 'danger'] as const).map(
    (variant): Case => ({
      id: 'callout',
      value: variant,
      doc: P,
      select: ['ab', 1],
      expected: `<aside class="rt-callout rt-callout--${variant}" role="note"><p class="rt-callout__title">${
        {
          info: 'Information',
          success: 'Success',
          warning: 'Warning',
          danger: 'Danger',
        }[variant]
      }</p><p>ab</p></aside>`,
    }),
  ),
  {
    id: 'callout',
    value: 'warning',
    doc: CALLOUT,
    select: ['ab', 1],
    expected:
      '<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title">Warning</p><p>ab</p></aside>',
  },
  {
    id: 'callout',
    value: 'remove',
    doc: CALLOUT,
    select: ['ab', 1],
    expected: P,
  },
  {
    id: 'pullquote',
    doc: P,
    select: ['ab', 1],
    expected:
      '<figure class="rt-pullquote"><blockquote><p>ab</p></blockquote></figure>',
  },
  {
    id: 'pullquote',
    doc: '<figure class="rt-pullquote"><blockquote><p>ab</p></blockquote></figure>',
    select: ['ab', 1],
    expected: P,
  },
  {
    id: 'readAlso',
    doc: P,
    select: ['ab', 2],
    expected:
      '<p>ab</p><aside class="rt-read-also" role="note"><p class="rt-read-also__title">Read also</p><ul><li></li></ul></aside>',
  },
  {
    id: 'clearFormatting',
    doc: '<p><strong><em>a</em></strong><span data-rt-color="red">b</span>c</p>',
    select: ['abc'],
    expected: '<p>abc</p>',
  },
];

function label(c: Case): string {
  const value = c.value === undefined ? '' : ` ${String(c.value)}`;
  return `${c.id}${value} em ${c.doc.slice(0, 40)}`;
}

/** Conta as chamadas a `chain().focus()` (U4). */
function spyFocus(editor: Editor): { count: number } {
  const probe = { count: 0 };
  const original = editor.chain.bind(editor);
  vi.spyOn(editor, 'chain').mockImplementation(() => {
    const chain = original();
    const focus = chain.focus.bind(chain);
    chain.focus = (...args: Parameters<typeof chain.focus>) => {
      probe.count += 1;
      return focus(...args);
    };
    return chain;
  });
  return probe;
}

describe('runToolbarCommand (R5)', () => {
  it.each(CASES.map((c) => [label(c), c] as const))('%s', (_name, c) => {
    const editor = createTestEditor(c.doc);
    const initial = getRteHtml(editor);
    selectText(editor, ...c.select);
    c.prepare?.(editor);
    const focus = spyFocus(editor);

    expect(runToolbarCommand(editor, c.id, c.value)).toBe(true);
    expect(getRteHtml(editor)).toBe(c.expected);
    expect(focus.count).toBeGreaterThan(0);

    if (c.undoable === undefined) {
      editor.commands.undo();
      expect(getRteHtml(editor)).toBe(initial);
    }
  });

  it('cobre todo item da barra', () => {
    const covered = new Set(CASES.map((c) => c.id));
    expect([...covered].sort()).toEqual(Object.keys(RTE_TOOLBAR_ITEMS).sort());
  });

  it('cobre todo valor dos menus', () => {
    const values = (id: RteToolbarItemId) =>
      new Set(CASES.filter((c) => c.id === id).map((c) => c.value));
    expect(values('blockType')).toEqual(
      new Set(['paragraph', 'heading2', 'heading3', 'heading4']),
    );
    expect(values('align')).toEqual(
      new Set(['left', 'center', 'right', 'justify']),
    );
    expect(values('callout')).toEqual(
      new Set(['info', 'success', 'warning', 'danger', 'remove']),
    );
    expect(values('table')).toEqual(
      new Set([
        'insertTable',
        'addRowBefore',
        'addRowAfter',
        'addColumnBefore',
        'addColumnAfter',
        'deleteRow',
        'deleteColumn',
        'mergeCells',
        'splitCell',
        'toggleHeaderRow',
        'toggleHeaderColumn',
        'deleteTable',
      ]),
    );
    expect(values('textColor')).toEqual(new Set(['red', null]));
    expect(values('highlight')).toEqual(new Set(['yellow', null]));
    expect(values('codeLanguage')).toEqual(new Set(['javascript', 'plain']));
  });

  it('valor desconhecido ou fora de contexto não faz nada', () => {
    const editor = createTestEditor(P);
    selectText(editor, 'ab', 0, 1);
    expect(runToolbarCommand(editor, 'blockType', 'heading1')).toBe(false);
    expect(runToolbarCommand(editor, 'align', 'start')).toBe(false);
    expect(runToolbarCommand(editor, 'callout', 'tip')).toBe(false);
    expect(runToolbarCommand(editor, 'table', 'nope')).toBe(false);
    expect(runToolbarCommand(editor, 'indent')).toBe(false);
    expect(runToolbarCommand(editor, 'codeLanguage', 'javascript')).toBe(false);
    expect(getRteHtml(editor)).toBe(P);
  });

  it('itens de tarefa não aninham (rtTaskItem é inline*): indent/outdent não fazem nada', () => {
    const editor = createTestEditor(TASKS);
    selectText(editor, 'b', 1);
    expect(runToolbarCommand(editor, 'indent')).toBe(false);
    expect(runToolbarCommand(editor, 'outdent')).toBe(false);
    expect(getRteHtml(editor)).toBe(TASKS);
  });

  it('recurso desligado: o comando ausente devolve false', () => {
    const editor = createTestEditor(P, { features: { tasks: false } });
    selectText(editor, 'ab', 1);
    expect(runToolbarCommand(editor, 'taskList')).toBe(false);
    expect(getRteHtml(editor)).toBe(P);
  });
});

describe('runTableOp (R8)', () => {
  it('addRowAfter na última linha cria a linha', () => {
    const editor = createTestEditor(TABLE);
    selectText(editor, 'd', 1);
    expect(runTableOp(editor, 'addRowAfter')).toBe(true);
    expect(getRteHtml(editor)).toBe(
      table(tr(td('a'), td('b')), tr(td('c'), td('d')), tr(EMPTY_TD, EMPTY_TD)),
    );
  });

  it('insertTable dentro de tabela não faz nada', () => {
    const editor = createTestEditor(TABLE);
    selectText(editor, 'a', 1);
    expect(runTableOp(editor, 'insertTable')).toBe(false);
    expect(getRteHtml(editor)).toBe(TABLE);
  });

  it('operação de tabela fora de tabela não faz nada', () => {
    const editor = createTestEditor(P);
    selectText(editor, 'ab', 1);
    expect(runTableOp(editor, 'addRowAfter')).toBe(false);
    expect(getRteHtml(editor)).toBe(P);
  });
});
