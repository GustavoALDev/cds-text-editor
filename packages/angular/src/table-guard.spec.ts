import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { undoDepth } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import {
  CellSelection,
  TableMap,
  findTable,
  fixTables,
} from '@tiptap/pm/tables';
import * as fc from 'fast-check';
import {
  createTestEditor,
  destroyTestEditors,
  selectText,
} from './testing-support/editors';
import { runTableOp } from './toolbar/commands';
import {
  RTE_SPAN_LIMIT,
  exceedsSpanLimit,
  readTableMenuState,
  type RteGrowingTableOp,
} from './toolbar/table-guard';

afterEach(() => destroyTestEditors());

const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const SEED = process.env['FC_SEED'];

const GROWING: readonly RteGrowingTableOp[] = [
  'addRowBefore',
  'addRowAfter',
  'addColumnBefore',
  'addColumnAfter',
  'mergeCells',
];

const td = (text: string, attrs = '') => `<td${attrs}><p>${text}</p></td>`;
const tr = (cells: readonly string[]) => `<tr>${cells.join('')}</tr>`;
const table = (rows: readonly string[]) =>
  `<table><tbody>${rows.join('')}</tbody></table>`;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Posições das células (de qualquer tabela) na ordem do documento. */
function cellPositions(doc: ProseMirrorNode): number[] {
  const out: number[] = [];
  doc.descendants((node, pos) => {
    const role = node.type.spec['tableRole'] as unknown;
    if (role === 'cell' || role === 'header_cell') out.push(pos);
  });
  return out;
}

function hasSpanOverLimit(doc: ProseMirrorNode): boolean {
  let over = false;
  doc.descendants((node) => {
    const { colspan, rowspan } = node.attrs as Record<string, unknown>;
    if (
      (typeof colspan === 'number' && colspan > RTE_SPAN_LIMIT) ||
      (typeof rowspan === 'number' && rowspan > RTE_SPAN_LIMIT)
    ) {
      over = true;
    }
  });
  return over;
}

/**
 * Linha 1: célula `colspan="100"` (X) na posição dada, entre `a` e `b`;
 * linha 2: 102 células simples `kNk`, uma por coluna.
 */
function colspanTable(at: 'first' | 'middle' | 'last'): {
  html: string;
  /** Colunas cobertas por X: [início, fim). */
  span: [number, number];
} {
  const x = td('X', ' colspan="100"');
  const row1 =
    at === 'first'
      ? [x, td('a'), td('b')]
      : at === 'middle'
        ? [td('a'), x, td('b')]
        : [td('a'), td('b'), x];
  const start = at === 'first' ? 0 : at === 'middle' ? 1 : 2;
  const row2 = range(102).map((i) => td(`k${i}k`));
  return { html: table([tr(row1), tr(row2)]), span: [start, start + 100] };
}

describe('guarda de colspan > 100 (U14, R8)', () => {
  for (const at of ['first', 'middle', 'last'] as const) {
    describe(`X na posição ${at} da linha`, () => {
      const { html, span } = colspanTable(at);
      const [start, end] = span;
      const inside = start + 50;
      const outside = at === 'last' ? 0 : 101;

      it('coluna dentro da faixa de X: addColumnBefore/After bloqueados', () => {
        const editor = createTestEditor(html);
        selectText(editor, `k${inside}k`, 1);
        const menu = readTableMenuState(editor);
        expect(menu.addColumnBefore).toEqual({
          enabled: false,
          spanLimited: true,
        });
        expect(menu.addColumnAfter).toEqual({
          enabled: false,
          spanLimited: true,
        });
        expect(exceedsSpanLimit(editor.state, 'addColumnAfter')).toBe(true);
      });

      it('coluna fora da faixa de X: livres', () => {
        const editor = createTestEditor(html);
        selectText(editor, `k${outside}k`, 1);
        const menu = readTableMenuState(editor);
        expect(menu.addColumnBefore).toEqual({
          enabled: true,
          spanLimited: false,
        });
        expect(menu.addColumnAfter).toEqual({
          enabled: true,
          spanLimited: false,
        });
      });

      it('nas bordas da faixa só cresce o lado de dentro', () => {
        const editor = createTestEditor(html);
        selectText(editor, `k${start}k`, 1);
        expect(readTableMenuState(editor).addColumnBefore.spanLimited).toBe(
          false,
        );
        expect(readTableMenuState(editor).addColumnAfter.spanLimited).toBe(
          true,
        );
        selectText(editor, `k${end - 1}k`, 1);
        expect(readTableMenuState(editor).addColumnBefore.spanLimited).toBe(
          true,
        );
        expect(readTableMenuState(editor).addColumnAfter.spanLimited).toBe(
          false,
        );
      });

      it('cursor em X: a coluna entra na borda de X, livre', () => {
        const editor = createTestEditor(html);
        selectText(editor, 'X', 1);
        const menu = readTableMenuState(editor);
        expect(menu.addColumnBefore.spanLimited).toBe(false);
        expect(menu.addColumnAfter.spanLimited).toBe(false);
      });
    });
  }
});

describe('guarda de rowspan > 100 (U14, R8)', () => {
  // Coluna 0: Y com rowspan 100; coluna 1: `rNr` por linha; a linha 100 fica
  // fora de Y.
  const html = table([
    tr([td('Y', ' rowspan="100"'), td('r0r')]),
    ...range(99).map((i) => tr([td(`r${i + 1}r`)])),
    tr([td('fora'), td('r100r')]),
  ]);

  it('linha dentro da faixa de Y: addRowBefore/After bloqueados', () => {
    const editor = createTestEditor(html);
    selectText(editor, 'r50r', 1);
    const menu = readTableMenuState(editor);
    expect(menu.addRowBefore).toEqual({ enabled: false, spanLimited: true });
    expect(menu.addRowAfter).toEqual({ enabled: false, spanLimited: true });
  });

  it('linha fora da faixa de Y: livres', () => {
    const editor = createTestEditor(html);
    selectText(editor, 'r100r', 1);
    const menu = readTableMenuState(editor);
    expect(menu.addRowBefore).toEqual({ enabled: true, spanLimited: false });
    expect(menu.addRowAfter).toEqual({ enabled: true, spanLimited: false });
  });
});

describe('guarda de mergeCells (U14, R8)', () => {
  function mergeState(second: number) {
    const editor = createTestEditor(
      table([tr([td('a', ' colspan="99"'), td('b', ` colspan="${second}"`)])]),
    );
    const [a, b] = cellPositions(editor.state.doc);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(editor.state.doc, a ?? 0, b ?? 0),
      ),
    );
    return editor;
  }

  it('99 + 2 → bloqueado', () => {
    const editor = mergeState(2);
    expect(readTableMenuState(editor).mergeCells).toEqual({
      enabled: false,
      spanLimited: true,
    });
  });

  it('99 + 1 → livre', () => {
    const editor = mergeState(1);
    expect(readTableMenuState(editor).mergeCells).toEqual({
      enabled: true,
      spanLimited: false,
    });
  });

  it('runTableOp bloqueado não muda o HTML', () => {
    const editor = mergeState(2);
    const before = getRteHtml(editor);
    expect(runTableOp(editor, 'mergeCells')).toBe(false);
    expect(getRteHtml(editor)).toBe(before);
  });
});

describe('ensaio (pré-voo 13)', () => {
  it('não aplica nada: mesmo EditorState e mesma profundidade do histórico', () => {
    const { html } = colspanTable('first');
    const editor = createTestEditor(html);
    selectText(editor, 'k50k', 1);
    editor.commands.insertContent('z');
    const state = editor.state;
    const depth = undoDepth(state);
    const menu = readTableMenuState(editor);
    for (const op of GROWING) exceedsSpanLimit(editor.state, op);
    expect(menu.addColumnAfter.spanLimited).toBe(true);
    expect(menu.addRowAfter.enabled).toBe(true);
    expect(editor.state).toBe(state);
    expect(undoDepth(editor.state)).toBe(depth);
  });

  it('sem transação (fora de tabela) → false', () => {
    const editor = createTestEditor('<p>ab</p>');
    for (const op of GROWING) {
      expect(exceedsSpanLimit(editor.state, op)).toBe(false);
    }
  });
});

/** Tabela gerada: linhas de células `[colspan, rowspan]`. */
const span = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 3 }) },
  { weight: 2, arbitrary: fc.integer({ min: 95, max: 100 }) },
  { weight: 1, arbitrary: fc.integer({ min: 1, max: 100 }) },
);
const tableArb = fc.array(
  fc.array(fc.tuple(span, fc.oneof(fc.constant(1), span)), {
    minLength: 1,
    maxLength: 3,
  }),
  { minLength: 1, maxLength: 4 },
);

function tableHtml(rows: readonly (readonly [number, number])[][]): string {
  let n = 0;
  return table(
    rows.map((row) =>
      tr(
        row.map(([colspan, rowspan]) => {
          n += 1;
          const attrs =
            (colspan > 1 ? ` colspan="${colspan}"` : '') +
            (rowspan > 1 ? ` rowspan="${rowspan}"` : '');
          return td(`c${n}c`, attrs);
        }),
      ),
    ),
  );
}

/** Teto de células depois da normalização (custo do jsdom). */
const MAX_CELLS = 600;

/**
 * Carrega e normaliza a tabela pelo `fixTables` (a carga não passa por ele).
 * `null` (fora do escopo da guarda) se o `prosemirror-tables` não consegue
 * normalizá-la (o `fixTable` lança em algumas tabelas patológicas), se ela
 * continua com problemas ou se a normalização passa de `MAX_CELLS` células
 * (rowspans longos viram linhas novas, e o jsdom levaria segundos).
 */
function load(html: string): Editor | null {
  const editor = createTestEditor(html);
  try {
    const fix = fixTables(editor.state);
    if (fix && cellPositions(fix.doc).length > MAX_CELLS) return null;
    if (fix) editor.view.dispatch(fix.setMeta('addToHistory', false));
  } catch {
    return null;
  }
  let consistent = true;
  editor.state.doc.descendants((node) => {
    if (node.type.spec['tableRole'] !== 'table') return true;
    if (TableMap.get(node).problems) consistent = false;
    return false;
  });
  return consistent ? editor : null;
}

/** Seleção numa célula, ou `CellSelection` com a vizinha (mergeCells). */
function select(editor: Editor, index: number, merge: boolean): boolean {
  const { doc } = editor.state;
  const cells = cellPositions(doc);
  const cell = cells[index % cells.length] ?? 0;
  if (!merge) {
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(doc, cell + 2)),
    );
    return true;
  }
  const found = findTable(doc.resolve(cell));
  if (!found) return false;
  const map = TableMap.get(found.node);
  const start = found.start;
  const rel = cell - start;
  const next =
    map.nextCell(rel, 'horiz', 1) ??
    map.nextCell(rel, 'horiz', -1) ??
    map.nextCell(rel, 'vert', 1) ??
    map.nextCell(rel, 'vert', -1);
  if (next === null) return false;
  editor.view.dispatch(
    editor.state.tr.setSelection(CellSelection.create(doc, cell, start + next)),
  );
  return true;
}

describe('propriedade: guarda ⇔ comando do Tiptap (R8)', () => {
  it('spanLimited ⇔ o comando real deixa célula > 100', () => {
    const seen = { limited: 0, free: 0 };
    fc.assert(
      fc.property(tableArb, fc.nat(), (rows, index) => {
        destroyTestEditors();
        const html = tableHtml(rows);
        const guarded = load(html);
        const real = load(html);
        fc.pre(guarded !== null && real !== null);
        if (!guarded || !real) return;
        // Esquemas diferentes (uma instância cada): compara pelo JSON.
        expect(real.getJSON()).toEqual(guarded.getJSON());
        for (const op of GROWING) {
          const merge = op === 'mergeCells';
          if (!select(guarded, index, merge)) continue;
          select(real, index, merge);
          const limited = readTableMenuState(guarded)[op].spanLimited;
          seen[limited ? 'limited' : 'free'] += 1;
          const snapshot = real.state;
          real.commands[op]();
          expect(limited).toBe(hasSpanOverLimit(real.state.doc));
          real.view.updateState(snapshot);
        }
      }),
      { numRuns: RUNS, ...(SEED ? { seed: Number(SEED) } : {}) },
    );
    // Os dois lados da equivalência aparecem (com execuções suficientes).
    if (RUNS >= 100) {
      expect(seen.limited).toBeGreaterThan(0);
      expect(seen.free).toBeGreaterThan(0);
    }
  }, 120_000);
});
