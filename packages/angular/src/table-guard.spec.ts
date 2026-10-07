import { getRteHtml } from '@cds/rte-core/extensions';
import { createDocument, type Editor } from '@tiptap/core';
import { undoDepth } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
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
  readTableOpState,
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

/**
 * Coluna 0: célula `rowspan="100"` (Y) começando na linha 0 (`first`), 1
 * (`middle`, com uma linha acima e uma abaixo) ou 2 (`last`); coluna 1:
 * `rNr` em cada uma das 102 linhas.
 */
function rowspanTable(at: 'first' | 'middle' | 'last'): {
  html: string;
  /** Linhas cobertas por Y: [início, fim). */
  span: [number, number];
} {
  const start = at === 'first' ? 0 : at === 'middle' ? 1 : 2;
  const end = start + 100;
  const rows = range(102).map((i) => {
    const first =
      i === start
        ? [td('Y', ' rowspan="100"')]
        : i < start || i >= end
          ? [td(`o${i}o`)]
          : [];
    return tr([...first, td(`r${i}r`)]);
  });
  return { html: table(rows), span: [start, end] };
}

describe('guarda de rowspan > 100 (U14, R8)', () => {
  for (const at of ['first', 'middle', 'last'] as const) {
    describe(`Y começando na linha ${at}`, () => {
      const { html, span } = rowspanTable(at);
      const [start, end] = span;
      const outside = at === 'last' ? 0 : 101;

      it('linha dentro da faixa de Y: addRowBefore/After bloqueados', () => {
        const editor = createTestEditor(html);
        selectText(editor, `r${start + 50}r`, 1);
        const menu = readTableMenuState(editor);
        expect(menu.addRowBefore).toEqual({
          enabled: false,
          spanLimited: true,
        });
        expect(menu.addRowAfter).toEqual({ enabled: false, spanLimited: true });
        expect(exceedsSpanLimit(editor.state, 'addRowAfter')).toBe(true);
      });

      it('linha fora da faixa de Y: livres', () => {
        const editor = createTestEditor(html);
        selectText(editor, `r${outside}r`, 1);
        const menu = readTableMenuState(editor);
        expect(menu.addRowBefore).toEqual({
          enabled: true,
          spanLimited: false,
        });
        expect(menu.addRowAfter).toEqual({ enabled: true, spanLimited: false });
      });

      it('nas bordas da faixa só cresce o lado de dentro', () => {
        const editor = createTestEditor(html);
        selectText(editor, `r${start}r`, 1);
        expect(readTableMenuState(editor).addRowBefore.spanLimited).toBe(false);
        expect(readTableMenuState(editor).addRowAfter.spanLimited).toBe(true);
        selectText(editor, `r${end - 1}r`, 1);
        expect(readTableMenuState(editor).addRowBefore.spanLimited).toBe(true);
        expect(readTableMenuState(editor).addRowAfter.spanLimited).toBe(false);
      });

      it('cursor em Y: a linha entra na borda de Y, livre', () => {
        const editor = createTestEditor(html);
        selectText(editor, 'Y', 1);
        const menu = readTableMenuState(editor);
        expect(menu.addRowBefore.spanLimited).toBe(false);
        expect(menu.addRowAfter.spanLimited).toBe(false);
      });
    });
  }
});

describe('runTableOp bloqueado não muda o HTML (U14)', () => {
  it.each([
    ['addColumnBefore', 'col'],
    ['addColumnAfter', 'col'],
    ['addRowBefore', 'row'],
    ['addRowAfter', 'row'],
  ] as const)('%s', (op, axis) => {
    const editor = createTestEditor(
      axis === 'col'
        ? colspanTable('middle').html
        : rowspanTable('middle').html,
    );
    selectText(editor, axis === 'col' ? 'k51k' : 'r51r', 1);
    const before = getRteHtml(editor);
    expect(runTableOp(editor, op)).toBe(false);
    expect(getRteHtml(editor)).toBe(before);
  });
});

/** `CellSelection` da primeira à segunda célula do documento. */
function selectFirstTwoCells(editor: Editor): void {
  const [a, b] = cellPositions(editor.state.doc);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      CellSelection.create(editor.state.doc, a ?? 0, b ?? 0),
    ),
  );
}

describe('guarda de mergeCells (U14, R8)', () => {
  /** Horizontal: `colspan` 99 + `second` numa linha. */
  function horizontal(second: number) {
    const editor = createTestEditor(
      table([tr([td('a', ' colspan="99"'), td('b', ` colspan="${second}"`)])]),
    );
    selectFirstTwoCells(editor);
    return editor;
  }

  /** Vertical: `rowspan` 99 + `second` numa coluna. */
  function vertical(second: number) {
    const editor = createTestEditor(
      table([
        tr([td('a', ' rowspan="99"')]),
        ...range(98).map(() => tr([])),
        tr([td('b', second > 1 ? ` rowspan="${second}"` : '')]),
        ...range(second - 1).map(() => tr([])),
      ]),
    );
    selectFirstTwoCells(editor);
    return editor;
  }

  it.each([
    ['horizontal', horizontal],
    ['vertical', vertical],
  ] as const)('%s: 99 + 2 → bloqueado, 99 + 1 → livre', (_axis, make) => {
    expect(readTableMenuState(make(2)).mergeCells).toEqual({
      enabled: false,
      spanLimited: true,
    });
    expect(readTableMenuState(make(1)).mergeCells).toEqual({
      enabled: true,
      spanLimited: false,
    });
  });

  it('runTableOp bloqueado não muda o HTML', () => {
    for (const make of [horizontal, vertical]) {
      const editor = make(2);
      const before = getRteHtml(editor);
      expect(runTableOp(editor, 'mergeCells')).toBe(false);
      expect(getRteHtml(editor)).toBe(before);
    }
  });
});

describe('span já acima de 100 (pré-voo 13)', () => {
  it('célula com colspan 101 vinda da API bloqueia as operações que crescem', () => {
    const editor = createTestEditor(table([tr([td('a'), td('b')])]));
    const [a] = cellPositions(editor.state.doc);
    // API direta (ADR 0004): sai com 1 no HTML, mas o documento guarda 101.
    editor.view.dispatch(
      editor.state.tr.setNodeAttribute(a ?? 0, 'colspan', 101),
    );
    expect(hasSpanOverLimit(editor.state.doc)).toBe(true);
    selectText(editor, 'b', 1);
    const menu = readTableMenuState(editor);
    for (const op of [
      'addRowBefore',
      'addRowAfter',
      'addColumnBefore',
      'addColumnAfter',
    ] as const) {
      expect(menu[op]).toEqual({ enabled: false, spanLimited: true });
    }
    // operações que não crescem continuam livres
    expect(menu.deleteRow.enabled).toBe(true);
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
type Rows = (readonly [number, number])[][];

const span = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 3 }) },
  // 100 cresce para 101 com uma linha/coluna; 95–99 somam > 100 no merge
  { weight: 2, arbitrary: fc.constant(100) },
  { weight: 2, arbitrary: fc.integer({ min: 95, max: 99 }) },
  { weight: 1, arbitrary: fc.integer({ min: 1, max: 100 }) },
);

/** Larga: 1–4 linhas de 1–3 células com colspan/rowspan 1–100. */
const wideArb: fc.Arbitrary<Rows> = fc.array(
  fc.array(fc.tuple(span, fc.oneof(fc.constant(1), span)), {
    minLength: 1,
    maxLength: 3,
  }),
  { minLength: 1, maxLength: 4 },
);

/**
 * Alta: 1–3 colunas, cada uma com 1–2 trechos verticais (rowspan 1–100,
 * colspan 1); as colunas mais curtas são completadas com células simples até
 * a altura da mais alta, para o `rowspan` longo caber de verdade.
 */
const tallArb: fc.Arbitrary<Rows> = fc
  .array(fc.array(span, { minLength: 1, maxLength: 2 }), {
    minLength: 1,
    maxLength: 3,
  })
  .map((columns) => {
    const height = Math.max(
      ...columns.map((c) => c.reduce((sum, h) => sum + h, 0)),
    );
    const rows: Rows = range(height).map(() => []);
    for (const segments of columns) {
      let row = 0;
      for (const h of segments) {
        rows[row]?.push([1, h]);
        row += h;
      }
      for (; row < height; row += 1) rows[row]?.push([1, 1]);
    }
    return rows;
  });

const tableArb = fc.oneof(wideArb, tallArb);

function tableHtml(rows: Rows): string {
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
/** Mínimo de casos de cada lado (bloqueada/livre) por operação. */
const MIN_PER_SIDE = 5;

/**
 * Documento da tabela normalizado pelo `fixTables` (a carga não passa por
 * ele), lido e corrigido só no estado, sem render. `null` (fora do escopo da
 * guarda) se o `prosemirror-tables` não consegue normalizá-la (o `fixTable`
 * lança em algumas tabelas patológicas), se ela continua com problemas ou se
 * a normalização passa de `MAX_CELLS` células (rowspans longos viram linhas
 * novas, e o jsdom levaria segundos para renderizá-las).
 */
function prepare(html: string, editor: Editor): ProseMirrorNode | null {
  let state = EditorState.create({
    doc: createDocument(html, editor.schema, editor.options.parseOptions),
  });
  try {
    const fix = fixTables(state);
    if (fix) {
      if (cellPositions(fix.doc).length > MAX_CELLS) return null;
      state = state.apply(fix);
    }
  } catch {
    return null;
  }
  let consistent = true;
  state.doc.descendants((node) => {
    if (node.type.spec['tableRole'] !== 'table') return true;
    if (TableMap.get(node).problems) consistent = false;
    return false;
  });
  return consistent ? state.doc : null;
}

/** Carrega o documento já normalizado no editor reaproveitado (um render). */
function load(editor: Editor, doc: ProseMirrorNode): Editor {
  editor.commands.setContent(doc.toJSON(), { emitUpdate: false });
  return editor;
}

/**
 * Roda `editor.commands[op]()` com `view.dispatch` trocado por um que só
 * captura a transação; devolve o documento resultante (o editor não muda).
 */
function runCaptured(editor: Editor, op: RteGrowingTableOp): ProseMirrorNode {
  const { view } = editor;
  const before = editor.state;
  let doc = before.doc;
  view.dispatch = (tr) => {
    doc = before.apply(tr).doc;
  };
  try {
    editor.commands[op]();
  } finally {
    delete (view as { dispatch?: unknown }).dispatch;
  }
  return doc;
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
  // Índice par: vizinha horizontal primeiro; ímpar: vertical primeiro.
  const axes =
    index % 2 === 0
      ? (['horiz', 'vert'] as const)
      : (['vert', 'horiz'] as const);
  let next: number | null = null;
  for (const axis of axes) {
    next ??= map.nextCell(rel, axis, 1) ?? map.nextCell(rel, axis, -1);
  }
  if (next === null) return false;
  editor.view.dispatch(
    editor.state.tr.setSelection(CellSelection.create(doc, cell, start + next)),
  );
  return true;
}

describe('propriedade: guarda ⇔ comando do Tiptap (R8)', () => {
  it('spanLimited ⇔ o comando real deixa célula > 100', () => {
    const seen = Object.fromEntries(
      GROWING.map((op) => [op, { limited: 0, free: 0 }]),
    ) as Record<RteGrowingTableOp, { limited: number; free: number }>;
    // Dois editores reaproveitados entre as execuções (criar um `Editor` com
    // todas as extensões por execução é o custo dominante no jsdom).
    const [first, second] = [
      createTestEditor('<p></p>'),
      createTestEditor('<p></p>'),
    ] as const;
    fc.assert(
      fc.property(tableArb, fc.nat(), (rows, index) => {
        const html = tableHtml(rows);
        const doc = prepare(html, first);
        fc.pre(doc !== null);
        if (!doc) return;
        const guarded = load(first, doc);
        const real = load(second, doc);
        // Esquemas diferentes (uma instância cada): compara pelo JSON.
        expect(real.getJSON()).toEqual(guarded.getJSON());
        for (const op of GROWING) {
          const merge = op === 'mergeCells';
          if (!select(guarded, index, merge)) continue;
          select(real, index, merge);
          // só a operação conferida (o estado do menu ensaiaria as cinco)
          const limited = readTableOpState(guarded, op).spanLimited;
          seen[op][limited ? 'limited' : 'free'] += 1;
          // O comando do Tiptap de verdade, com a transação capturada em vez
          // de aplicada à vista: sem render da tabela nem restauração.
          expect(limited).toBe(hasSpanOverLimit(runCaptured(real, op)));
        }
      }),
      { numRuns: RUNS, ...(SEED ? { seed: Number(SEED) } : {}) },
    );
    // Os dois lados da equivalência aparecem em cada operação (com
    // execuções suficientes).
    if (RUNS >= 100) {
      for (const op of GROWING) {
        expect(seen[op].limited, `${op} bloqueada`).toBeGreaterThanOrEqual(
          MIN_PER_SIDE,
        );
        expect(seen[op].free, `${op} livre`).toBeGreaterThanOrEqual(
          MIN_PER_SIDE,
        );
      }
    }
  }, 120_000);
});
