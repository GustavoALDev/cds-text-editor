// @vitest-environment jsdom
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { createEditorExtensions } from './factory';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

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

describe('tabelas: fábrica', () => {
  it('quatro extensões, na ordem, com as opções da spec', () => {
    const list = createEditorExtensions({ features: ONLY_TABLES });
    const names = list.map((e) => e.name);
    expect(names.slice(-4)).toEqual([
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
