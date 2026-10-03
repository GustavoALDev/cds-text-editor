// @vitest-environment jsdom
import { Extension } from '@tiptap/core';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { EditorState, Plugin } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { createEditorExtensions } from './factory';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import { pressKey } from './testing/press-key';
import { SHIFT_META, ShiftBatch } from './testing/shift-batch';

const ONLY_TABLES = {
  colors: false,
  code: false,
  tables: true,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: false,
};

afterEach(() => destroyTestEditors());

function editorWith(content: string | object) {
  return createTestEditor({ features: ONLY_TABLES }, content as string);
}

function html(content: string | object): string {
  const editor = editorWith(content);
  const out = getRteHtml(editor);
  expect(
    validateHtml(out, editor.storage.rtContent.schema, { mode: 'canonical' }),
  ).toEqual([]);
  return out;
}

describe('tabelas: leitura e saída canônica', () => {
  it('descarta style/align, mantém só largura e atributos do esquema', () => {
    const input =
      '<table style="min-width: 145px"><colgroup><col style="width: 120px"><col style="min-width: 25px"></colgroup><tbody><tr><th scope="col" align="center"><p>A</p></th><th><p>B</p></th></tr><tr><td colspan="2" style="background: red"><p>C</p></td></tr></tbody></table>';
    expect(html(input)).toBe(
      '<table><colgroup><col style="width: 120px"><col></colgroup><tbody><tr><th scope="col"><p>A</p></th><th><p>B</p></th></tr><tr><td colspan="2"><p>C</p></td></tr></tbody></table>',
    );
  });

  it('sem largura nenhuma: sem colgroup', () => {
    expect(
      html('<table><tbody><tr><td><p>a</p></td></tr></tbody></table>'),
    ).toBe('<table><tbody><tr><td><p>a</p></td></tr></tbody></table>');
  });

  it('colwidth do atributo e width do col viram width em px', () => {
    expect(
      html(
        '<table><tbody><tr><th colwidth="80"><p>a</p></th></tr></tbody></table>',
      ),
    ).toBe(
      '<table><colgroup><col style="width: 80px"></colgroup><tbody><tr><th><p>a</p></th></tr></tbody></table>',
    );
    expect(
      html(
        '<table><colgroup><col width="80"></colgroup><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      ),
    ).toBe(
      '<table><colgroup><col style="width: 80px"></colgroup><tbody><tr><td><p>a</p></td></tr></tbody></table>',
    );
  });

  it('célula com colspan=2 no índice 0 recebe as larguras dos col 0 e 1', () => {
    const editor = editorWith(
      '<table><colgroup><col style="width: 50px"><col style="width: 60px"><col style="width: 70px"></colgroup><tbody><tr><td colspan="2"><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
    );
    const cells: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell') cells.push(node.attrs['colwidth']);
    });
    expect(cells).toEqual([[50, 60], [70]]);
    expect(getRteHtml(editor)).toBe(
      '<table><colgroup><col style="width: 50px"><col style="width: 60px"><col style="width: 70px"></colgroup><tbody><tr><td colspan="2"><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
    );
  });

  it('colspan/rowspan inválidos são omitidos; scope inválido é omitido', () => {
    expect(
      html(
        '<table><tbody><tr><td colspan="0"><p>a</p></td><td colspan="101"><p>b</p></td><td rowspan="x"><p>c</p></td><th scope="rowgroup"><p>d</p></th><th scope="row" rowspan="2"><p>e</p></th></tr></tbody></table>',
      ),
    ).toBe(
      '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td><td><p>c</p></td><th><p>d</p></th><th rowspan="2" scope="row"><p>e</p></th></tr></tbody></table>',
    );
  });

  it('scope é lido sem diferenciar maiúsculas ASCII', () => {
    expect(
      html(
        '<table><tbody><tr><th scope="COL"><p>a</p></th><th scope="Row"><p>b</p></th></tr></tbody></table>',
      ),
    ).toBe(
      '<table><tbody><tr><th scope="col"><p>a</p></th><th scope="row"><p>b</p></th></tr></tbody></table>',
    );
  });

  it('colgroup com rowspan na 1ª coluna sobrevive a uma digitação', () => {
    const editor = editorWith(
      '<table><colgroup><col style="width: 50px"><col style="width: 60px"><col style="width: 70px"></colgroup><tbody><tr><td rowspan="3"><p>a</p></td><td><p>b</p></td><td><p>c</p></td></tr><tr><td><p>d</p></td><td><p>e</p></td></tr><tr><td><p>f</p></td><td><p>g</p></td></tr></tbody></table>',
    );
    editor.commands.setTextSelection(4);
    editor.commands.insertContent('x');
    expect(getRteHtml(editor)).toContain(
      '<colgroup><col style="width: 50px"><col style="width: 60px"><col style="width: 70px"></colgroup>',
    );
  });

  it('caption é descartado: sem legenda e sem parágrafo', () => {
    expect(
      html(
        '<table><caption>Legenda</caption><tbody><tr><td>a</td></tr></tbody></table>',
      ),
    ).toBe('<table><tbody><tr><td><p>a</p></td></tr></tbody></table>');
  });

  it('parse de um elemento vivo não o altera e é idempotente', () => {
    const host = new window.DOMParser().parseFromString(
      '<div><table><caption>Legenda</caption><tbody><tr><td>a</td></tr></tbody></table></div>',
      'text/html',
    ).body;
    const before = host.outerHTML;
    const editor = editorWith('<p></p>');
    const parser = PMDOMParser.fromSchema(editor.schema);
    const first = parser.parse(host).toJSON();
    const second = parser.parse(host).toJSON();
    expect(host.outerHTML).toBe(before);
    expect(second).toEqual(first);
  });

  it('thead é lido e não sai', () => {
    expect(
      html(
        '<table><thead><tr><th><p>H</p></th></tr></thead><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      ),
    ).toBe(
      '<table><tbody><tr><th><p>H</p></th></tr><tr><td><p>a</p></td></tr></tbody></table>',
    );
  });

  it('insertTable gera saída válida em canonical', () => {
    const editor = editorWith('<p>x</p>');
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const out = getRteHtml(editor);
    expect(
      validateHtml(out, editor.storage.rtContent.schema, {
        mode: 'canonical',
      }),
    ).toEqual([]);
    expect(out).toContain('<table><tbody><tr><th>');
    expect(out).not.toContain('colgroup');
  });
});

describe('tabelas: larguras dentro de 1–9999 (resizable)', () => {
  it('leitura limita o que passa de 9999 e ignora zero', () => {
    expect(
      html(
        '<table><tbody><tr><td colwidth="50000"><p>a</p></td><td colwidth="0"><p>b</p></td></tr></tbody></table>',
      ),
    ).toBe(
      '<table><colgroup><col style="width: 9999px"><col></colgroup><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
    );
  });

  it('JSON com largura absurda sai limitado na renderização', () => {
    const cell = (colwidth: unknown) => ({
      type: 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth },
      content: [{ type: 'paragraph' }],
    });
    const out = getRteHtml(
      editorWith({
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  cell([123456]),
                  cell([-5]),
                  cell(['x']),
                  cell([80.4]),
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(out).toContain(
      '<colgroup><col style="width: 9999px"><col><col><col style="width: 80px"></colgroup>',
    );
  });

  it('largura arrastada acima do limite é corrigida no documento', () => {
    const editor = editorWith(
      '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>',
    );
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'tableCell') pos = p;
    });
    editor.view.dispatch(
      editor.state.tr.setNodeAttribute(pos, 'colwidth', [70000]),
    );
    expect(editor.state.doc.nodeAt(pos)?.attrs['colwidth']).toEqual([9999]);
  });
});

/**
 * Cão de guarda do laço de `appendTransaction`: lança depois de 200 rodadas
 * ou 5 s num mesmo `dispatch` (um laço infinito síncrono não seria
 * interrompido pelo timeout do Vitest).
 */
function watchdog() {
  const guard = { rounds: 0, start: 0 };
  const extension = Extension.create({
    name: 'testWatchdog',
    addProseMirrorPlugins: () => [
      new Plugin({
        appendTransaction() {
          guard.rounds += 1;
          if (guard.rounds > 200 || Date.now() - guard.start > 5000) {
            throw new Error('laço de appendTransaction sem fim');
          }
          return null;
        },
      }),
    ],
  });
  const arm = () => {
    guard.rounds = 0;
    guard.start = Date.now();
  };
  return { extension, arm };
}

describe('tabelas: canonização sem laço com o fixTables', () => {
  it.each([
    [20000, 9999],
    [10000, 9999],
    [123.5, 124],
  ])(
    'duas células com largura %s e a 3ª com 100: editar a 3ª converge',
    (raw, canon) => {
      const { extension, arm } = watchdog();
      const editor = createTestEditor(
        { features: ONLY_TABLES, extensions: [extension] },
        '<p></p>',
      );
      // Nós criados direto pelo esquema: o estado nasce com as larguras fora
      // do canônico, sem passar pela leitura do JSON (que já as corrigiria).
      const { schema } = editor;
      const row = (colwidth: number, text: string) =>
        schema.node('tableRow', null, [
          schema.node('tableCell', { colwidth: [colwidth] }, [
            schema.node('paragraph', null, [schema.text(text)]),
          ]),
        ]);
      const doc = schema.node('doc', null, [
        schema.node('table', null, [
          row(raw, 'a'),
          row(raw, 'b'),
          row(100, 'c'),
        ]),
      ]);
      editor.view.updateState(
        EditorState.create({ doc, plugins: editor.state.plugins }),
      );
      let target = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === 'c') target = pos + 1;
      });
      arm();
      editor.chain().setTextSelection(target).insertContent('x').run();
      const widths: unknown[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'tableCell') widths.push(node.attrs['colwidth']);
      });
      expect(widths).toEqual([[canon], [canon], [canon]]);
      expect(getRteHtml(editor)).toBe(
        `<table><colgroup><col style="width: ${canon}px"></colgroup><tbody><tr><td><p>a</p></td></tr><tr><td><p>b</p></td></tr><tr><td><p>cx</p></td></tr></tbody></table>`,
      );
    },
    5000,
  );
});

describe('tabelas: colspan > 100 criado por comando não trava', () => {
  // `colwidth` de cada célula: null ou uma largura por coluna coberta.
  function expectCoherent(editor: ReturnType<typeof editorWith>) {
    editor.state.doc.check();
    editor.state.doc.descendants((node) => {
      if (node.type.name !== 'tableCell') return true;
      const colwidth = node.attrs['colwidth'] as number[] | null;
      if (colwidth !== null) {
        expect(colwidth).toHaveLength(node.attrs['colspan'] as number);
      }
      return true;
    });
    expect(
      validateHtml(getRteHtml(editor), editor.storage.rtContent.schema, {
        mode: 'canonical',
      }),
    ).toEqual([]);
  }

  // 1ª linha: célula de colspan 100 (colunas de 50px e 60px) + coluna de
  // 120px; 2ª linha: célula simples + célula de colspan 100 (60px na 1ª).
  // A 2ª coluna com largura em outra linha faz o fixTables reescrever o
  // colwidth da célula alargada com o comprimento do colspan real.
  const TABLE =
    '<table><tbody><tr><td colspan="100" colwidth="50,60"><p>a</p></td><td colwidth="120"><p>b</p></td></tr>' +
    '<tr><td><p>c</p></td><td colspan="100" colwidth="60"><p>d</p></td></tr></tbody></table>';

  function setup() {
    const { extension, arm } = watchdog();
    const editor = createTestEditor(
      { features: ONLY_TABLES, extensions: [extension] },
      TABLE,
    );
    const text = (t: string) => {
      let pos = -1;
      editor.state.doc.descendants((node, p) => {
        if (node.isText && node.text === t) pos = p;
      });
      return pos;
    };
    const cell = (t: string) => editor.state.doc.resolve(text(t)).before(-1);
    return { editor, arm, text, cell };
  }

  it('addColumnAfter alarga a célula de colspan 100 para 101 e converge', () => {
    const { editor, arm, text } = setup();
    arm();
    editor.commands.setTextSelection(text('c'));
    arm();
    expect(editor.commands.addColumnAfter()).toBe(true);
    const spans: number[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell') {
        spans.push(node.attrs['colspan'] as number);
      }
    });
    expect(spans).toEqual([101, 1, 1, 1, 100]);
    expectCoherent(editor);
  }, 10000);

  it('mergeCells cobrindo 101 colunas converge', () => {
    const { editor, arm, cell } = setup();
    arm();
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(editor.state.doc, cell('a'), cell('b')),
      ),
    );
    arm();
    expect(editor.commands.mergeCells()).toBe(true);
    const spans: number[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell') {
        spans.push(node.attrs['colspan'] as number);
      }
    });
    expect(spans[0]).toBe(101);
    expectCoherent(editor);
  }, 10000);
});

describe('tabelas: intervalos do lote mapeados ao documento final', () => {
  it('largura fora do limite corrigida mesmo com posição deslocada no lote', () => {
    const editor = createTestEditor(
      { features: ONLY_TABLES, extensions: [ShiftBatch] },
      '<p>a</p><p>b</p><table><tbody><tr><td><p>c</p></td></tr></tbody></table>',
    );
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'tableCell') pos = p;
    });
    editor.view.dispatch(
      editor.state.tr
        .setNodeAttribute(pos, 'colwidth', [70000])
        .setMeta(SHIFT_META, true),
    );
    const widths: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell') widths.push(node.attrs['colwidth']);
    });
    expect(widths).toEqual([[9999]]);
  });
});

describe('tabelas: Tab sem armadilha de teclado (§6, WCAG 2.1.2)', () => {
  const TABLE =
    '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>';

  function caretIn(editor: ReturnType<typeof editorWith>, text: string) {
    let target = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === text) target = pos + 1;
    });
    editor.commands.setTextSelection(target);
  }

  const cellText = (editor: ReturnType<typeof editorWith>) =>
    editor.state.selection.$from.parent.textContent;

  it('Tab vai à próxima célula; na última devolve false e não cria linha', () => {
    const editor = editorWith(TABLE);
    caretIn(editor, 'a');
    expect(pressKey(editor, 'Tab')).toBe(true);
    expect(cellText(editor)).toBe('b');
    caretIn(editor, 'd');
    const before = editor.state.doc;
    expect(pressKey(editor, 'Tab')).toBe(false);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(getRteHtml(editor)).toBe(TABLE);
  });

  it('Shift-Tab volta uma célula; na primeira devolve false', () => {
    const editor = editorWith(TABLE);
    caretIn(editor, 'd');
    expect(pressKey(editor, 'Tab', true)).toBe(true);
    expect(cellText(editor)).toBe('c');
    caretIn(editor, 'a');
    expect(pressKey(editor, 'Tab', true)).toBe(false);
    expect(getRteHtml(editor)).toBe(TABLE);
  });
});

describe('tabelas: fábrica', () => {
  it('quatro extensões, na ordem, com as opções da spec', () => {
    const list = createEditorExtensions({ features: ONLY_TABLES });
    const names = list.map((e) => e.name);
    expect(names.slice(-5, -1)).toEqual([
      'table',
      'tableRow',
      'tableHeader',
      'tableCell',
    ]);
    const table = list.find((e) => e.name === 'table');
    expect(table?.options).toMatchObject({
      resizable: true,
      renderWrapper: false,
      allowTableNodeSelection: false,
    });
  });
});
