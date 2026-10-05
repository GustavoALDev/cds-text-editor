import { Editor, Node } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { RTE_FLOATING_KINDS, type RteFloatingMenuKind } from './floating/types';
import {
  mapFloatingIdentity,
  readFloatingContext,
  readFloatingKind,
  sameFloatingIdentity,
  type RteFloatingContext,
  type RteFloatingIdentity,
  type RteFloatingSignals,
} from './floating/visibility';
import {
  createTestEditor,
  destroyTestEditors,
  selectText,
} from './testing-support/editors';

afterEach(() => {
  destroyTestEditors();
});

const X = 'https://x.com/';
const IMG =
  '<figure class="rt-figure"><img src="https://x.com/a.png" alt="A"></figure>';
const VIDEO =
  '<figure class="rt-figure rt-figure--video"><video src="https://x.com/v.mp4" controls=""></video></figure>';
const EMBED =
  '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" width="560" height="315"></iframe></figure>';

const table = (cell1: string, cell2 = '<p>z</p>') =>
  `<table><tbody><tr><td>${cell1}</td><td>${cell2}</td></tr></tbody></table>`;

/** Posição do primeiro nó do tipo `name`. */
function posOf(editor: Editor, name: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === name) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`posOf: ${name} não encontrado.`);
  return found;
}

function selectNode(editor: Editor, name: string): number {
  const pos = posOf(editor, name);
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
  );
  expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  return pos;
}

/** Posições dentro das duas primeiras células (`$anchor`/`$head` das células). */
function selectCells(editor: Editor): void {
  const cells: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.spec['tableRole'] === 'cell') cells.push(pos);
    return true;
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(
      CellSelection.create(editor.state.doc, cells[0]!, cells[1]!),
    ),
  );
  expect(editor.state.selection).toBeInstanceOf(CellSelection);
}

const ALL = RTE_FLOATING_KINDS;
const kindOf = (e: Editor, kinds: readonly RteFloatingMenuKind[] = ALL) =>
  readFloatingContext(e, kinds)?.kind ?? null;

function at(html: string, text: string, from?: number, to?: number): Editor {
  const editor = createTestEditor(html);
  selectText(editor, text, from, to);
  return editor;
}

describe('readFloatingContext (M4, R3)', () => {
  it('seleção de texto → text com a identidade da seleção', () => {
    const e = at('<p>abc</p>', 'b');
    expect(readFloatingContext(e, ALL)).toEqual({
      kind: 'text',
      identity: { kind: 'text', from: 2, to: 3 },
    });
  });

  it('cursor fora de link → null', () => {
    expect(kindOf(at('<p>abc</p>', 'abc', 1))).toBeNull();
  });

  it('cursor dentro de link → link com o intervalo da marca', () => {
    const e = at(`<p><a href="${X}">abc</a></p>`, 'abc', 1);
    expect(readFloatingContext(e, ALL)).toEqual({
      kind: 'link',
      identity: { kind: 'link', from: 1, to: 4 },
    });
  });

  it('cursor na borda final do link (pos 4) → link (ruling 19)', () => {
    const e = at(`<p><a href="${X}">abc</a></p>`, 'abc', 3);
    expect(e.state.selection.from).toBe(4);
    expect(kindOf(e)).toBe('link');
  });

  it('seleção dentro do link → text', () => {
    expect(kindOf(at(`<p><a href="${X}">abc</a></p>`, 'abc', 1, 2))).toBe(
      'text',
    );
  });

  it('seleção em bloco de código → null', () => {
    expect(kindOf(at('<pre><code>xy</code></pre>', 'x'))).toBeNull();
  });

  it('seleção com code em parágrafo → text (pelas marcas)', () => {
    expect(kindOf(at('<p>a<code>bc</code>d</p>', 'bc'))).toBe('text');
  });

  it('seleção só de espaços → null (pré-voo 5)', () => {
    const e = createTestEditor('<p>ab</p>');
    selectText(e, 'ab', 1);
    e.view.dispatch(e.state.tr.insertText('   '));
    selectText(e, 'a   b', 1, 4);
    expect(
      e.state.doc.textBetween(e.state.selection.from, e.state.selection.to),
    ).toBe('   ');
    expect(kindOf(e)).toBeNull();
  });

  it('AllSelection → null', () => {
    const e = createTestEditor('<p>abc</p>');
    e.commands.selectAll();
    expect(kindOf(e)).toBeNull();
  });

  it('NodeSelection de imagem → image com {pos, pos + nodeSize}', () => {
    const e = createTestEditor(`<p>a</p>${IMG}`);
    const pos = selectNode(e, 'rtImage');
    const size = e.state.doc.nodeAt(pos)!.nodeSize;
    expect(readFloatingContext(e, ALL)).toEqual({
      kind: 'image',
      identity: { kind: 'image', from: pos, to: pos + size },
    });
  });

  it('imagem dentro de célula → image; sem image nos tipos → table (pré-voo 4)', () => {
    const e = createTestEditor(table(IMG));
    selectNode(e, 'rtImage');
    expect(kindOf(e)).toBe('image');
    expect(kindOf(e, ['link', 'text', 'table'])).toBe('table');
  });

  it('cursor em célula → table com a identidade da tabela', () => {
    const e = at(`<p>a</p>${table('<p>xy</p>')}`, 'xy', 1);
    const pos = posOf(e, 'table');
    const size = e.state.doc.nodeAt(pos)!.nodeSize;
    expect(readFloatingContext(e, ALL)).toEqual({
      kind: 'table',
      identity: { kind: 'table', from: pos, to: pos + size },
    });
  });

  it('CellSelection de duas células → table', () => {
    const e = createTestEditor(table('<p>xy</p>'));
    selectCells(e);
    expect(kindOf(e)).toBe('table');
  });

  it('seleção de texto numa célula → text', () => {
    expect(kindOf(at(table('<p>xy</p>'), 'x'))).toBe('text');
  });

  it('NodeSelection de vídeo: fora de tabela → null, dentro → table', () => {
    const out = createTestEditor(`<p>a</p>${VIDEO}`);
    selectNode(out, 'rtVideo');
    expect(kindOf(out)).toBeNull();
    const inside = createTestEditor(table(VIDEO));
    selectNode(inside, 'rtVideo');
    expect(kindOf(inside)).toBe('table');
  });

  it('NodeSelection de embed: fora de tabela → null, dentro → table', () => {
    const out = createTestEditor(`<p>a</p>${EMBED}`);
    selectNode(out, 'rtEmbed');
    expect(kindOf(out)).toBeNull();
    const inside = createTestEditor(table(EMBED));
    selectNode(inside, 'rtEmbed');
    expect(kindOf(inside)).toBe('table');
  });

  it('kinds sem table → null na célula', () => {
    const e = at(table('<p>xy</p>'), 'xy', 1);
    expect(kindOf(e, ['image', 'link', 'text'])).toBeNull();
  });

  it('kinds sem text → seleção de texto é null (fora de tabela e na célula)', () => {
    expect(
      kindOf(at('<p>abc</p>', 'b'), ['image', 'link', 'table']),
    ).toBeNull();
    expect(kindOf(at(table('<p>xy</p>'), 'x'), ['table'])).toBeNull();
  });

  it('seleção só de espaços numa célula → null (não é table)', () => {
    const e = at(table('<p>xy</p>'), 'xy', 1);
    e.view.dispatch(e.state.tr.insertText('   '));
    selectText(e, 'x   y', 1, 4);
    expect(kindOf(e)).toBeNull();
  });

  it('seleção em bloco de código numa célula → null (não é table)', () => {
    expect(kindOf(at(table('<pre><code>xy</code></pre>'), 'x'))).toBeNull();
  });

  it('seleção sem link nem marca aplicável → null', () => {
    const e = new Editor({
      element: document.createElement('div'),
      extensions: [
        Node.create({ name: 'doc', topNode: true, content: 'block+' }),
        Node.create({
          name: 'paragraph',
          group: 'block',
          content: 'inline*',
          parseHTML: () => [{ tag: 'p' }],
          renderHTML: () => ['p', 0],
        }),
        Node.create({ name: 'text', group: 'inline' }),
      ],
      content: '<p>abc</p>',
    });
    try {
      e.view.dispatch(
        e.state.tr.setSelection(TextSelection.create(e.state.doc, 2, 3)),
      );
      expect(kindOf(e)).toBeNull();
    } finally {
      e.destroy();
    }
  });

  it('kinds sem link → cursor no link é null', () => {
    const e = at(`<p><a href="${X}">abc</a></p>`, 'abc', 1);
    expect(kindOf(e, ['image', 'text', 'table'])).toBeNull();
  });
});

const SIGNALS: RteFloatingSignals = {
  enabled: true,
  focus: 'editable',
  dragging: false,
  composing: false,
  dialog: false,
  dismissed: null,
};
const CTX: RteFloatingContext = {
  kind: 'text',
  identity: { kind: 'text', from: 2, to: 3 },
};

describe('readFloatingKind (M5 puro, R4)', () => {
  it('sem contexto → null', () => {
    expect(readFloatingKind(null, SIGNALS)).toBeNull();
  });

  it.each<[string, Partial<RteFloatingSignals>]>([
    ['enabled false', { enabled: false }],
    ["focus 'other'", { focus: 'other' }],
    ['dragging', { dragging: true }],
    ['composing', { composing: true }],
    ['dialog', { dialog: true }],
  ])('%s → null', (_, patch) => {
    expect(readFloatingKind(CTX, { ...SIGNALS, ...patch })).toBeNull();
  });

  it("focus 'editable' e 'menu' → o tipo", () => {
    expect(readFloatingKind(CTX, SIGNALS)).toBe('text');
    expect(readFloatingKind(CTX, { ...SIGNALS, focus: 'menu' })).toBe('text');
  });

  it('dismissed igual à identidade → null; diferente → o tipo', () => {
    expect(
      readFloatingKind(CTX, { ...SIGNALS, dismissed: { ...CTX.identity } }),
    ).toBeNull();
    expect(
      readFloatingKind(CTX, {
        ...SIGNALS,
        dismissed: { kind: 'text', from: 2, to: 4 },
      }),
    ).toBe('text');
    expect(
      readFloatingKind(CTX, {
        ...SIGNALS,
        dismissed: { kind: 'table', from: 2, to: 3 },
      }),
    ).toBe('text');
  });
});

describe('sameFloatingIdentity', () => {
  it('compara tipo e intervalo; null só é igual a null', () => {
    const a: RteFloatingIdentity = { kind: 'link', from: 1, to: 4 };
    expect(sameFloatingIdentity(a, { kind: 'link', from: 1, to: 4 })).toBe(
      true,
    );
    expect(sameFloatingIdentity(a, { kind: 'link', from: 1, to: 5 })).toBe(
      false,
    );
    expect(sameFloatingIdentity(a, { kind: 'text', from: 1, to: 4 })).toBe(
      false,
    );
    expect(sameFloatingIdentity(a, null)).toBe(false);
    expect(sameFloatingIdentity(null, a)).toBe(false);
    expect(sameFloatingIdentity(null, null)).toBe(true);
  });
});

/** Dispensa o contexto atual e o mapeia por `tr.mapping` a cada transação. */
function dismissNow(editor: Editor): { current: RteFloatingIdentity | null } {
  const ref = {
    current: readFloatingContext(editor, ALL)?.identity ?? null,
  };
  expect(ref.current).not.toBeNull();
  editor.on('transaction', ({ transaction }) => {
    if (ref.current && transaction.docChanged) {
      ref.current = mapFloatingIdentity(ref.current, transaction.mapping);
    }
  });
  return ref;
}

const kindWith = (e: Editor, dismissed: RteFloatingIdentity | null) =>
  readFloatingKind(readFloatingContext(e, ALL), { ...SIGNALS, dismissed });

describe('identidade dispensada mapeada (M6, R4)', () => {
  it('tabela: digitar 3 letras na célula mantém a identidade (segue null)', () => {
    const e = at(table('<p>xy</p>', '<p>w</p>'), 'xy', 1);
    const ref = dismissNow(e);
    expect(kindWith(e, ref.current)).toBeNull();
    for (const ch of 'abc') e.view.dispatch(e.state.tr.insertText(ch));
    expect(e.state.doc.textContent).toContain('xabcy');
    expect(
      sameFloatingIdentity(readFloatingContext(e, ALL)!.identity, ref.current),
    ).toBe(true);
    expect(kindWith(e, ref.current)).toBeNull();
  });

  it('tabela: parágrafo inserido antes desloca a identidade, que segue igual', () => {
    const e = at(`<p>a</p>${table('<p>xy</p>')}`, 'xy', 1);
    const ref = dismissNow(e);
    const before = ref.current!;
    const { schema } = e.state;
    e.view.dispatch(
      e.state.tr.insert(
        0,
        schema.nodes['paragraph']!.create(null, schema.text('novo')),
      ),
    );
    expect(ref.current!.from).toBeGreaterThan(before.from);
    expect(
      sameFloatingIdentity(readFloatingContext(e, ALL)!.identity, ref.current),
    ).toBe(true);
    expect(kindWith(e, ref.current)).toBeNull();
  });

  it('tabela: cursor em outra tabela → identidade diferente (o menu volta)', () => {
    const e = at(
      `${table('<p>xy</p>')}<p>meio</p>${table('<p>kw</p>')}`,
      'xy',
      1,
    );
    const ref = dismissNow(e);
    selectText(e, 'kw', 1);
    expect(kindWith(e, ref.current)).toBe('table');
  });

  it('texto: estender a seleção em 1 caractere → diferente', () => {
    const e = at('<p>abcd</p>', 'b');
    const ref = dismissNow(e);
    expect(kindWith(e, ref.current)).toBeNull();
    selectText(e, 'abcd', 1, 3);
    expect(kindWith(e, ref.current)).toBe('text');
  });

  it('imagem dispensada apagada → mapFloatingIdentity devolve null', () => {
    const e = createTestEditor(`<p>a</p>${IMG}<p>b</p>`);
    selectNode(e, 'rtImage');
    const ref = dismissNow(e);
    e.commands.deleteSelection();
    expect(ref.current).toBeNull();
  });
});
