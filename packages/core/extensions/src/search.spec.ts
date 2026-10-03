// @vitest-environment jsdom
// Busca e substituição (spec 03c, C8–C12, R5): literal, por bloco de texto,
// com teto, decorações, navegação circular, índice incremental e substituir
// um/todos.
//
// Reproduzir uma falha da propriedade: `FC_SEED=<n> npx vitest run
// extensions/src/search.spec.ts`; `FC_RUNS` muda o número de execuções.
import { getSchema } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { createEditorExtensions } from './factory';
import { foldCase, searchProbe } from './search-index';
import { getSearchState, normalizeReplacement } from './search';
import type { RteSearchOptions, RteSearchState } from './search';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import { text, validDoc } from './testing/doc-arbitraries';
import { referenceMatches } from './testing/search-reference';
import { typeText } from './testing/type-text';

const SEED = Number(process.env['FC_SEED'] ?? 20261003);
const RUNS = Number(process.env['FC_RUNS'] ?? 200);
vi.setConfig({ testTimeout: 300_000 });

afterEach(() => {
  destroyTestEditors();
  for (const el of document.querySelectorAll('input')) el.remove();
});

function q(
  editor: Editor,
  query: string,
  options?: RteSearchOptions,
): RteSearchState {
  expect(editor.commands.setSearchQuery(query, options)).toBe(true);
  const state = getSearchState(editor);
  if (state === null) throw new Error('sem rtSearch');
  return state;
}

const state = (editor: Editor) => getSearchState(editor) as RteSearchState;
const texts = (editor: Editor, s: RteSearchState) =>
  s.matches.map((m) => editor.state.doc.textBetween(m.from, m.to));
const decorated = (editor: Editor) =>
  editor.view.dom.querySelectorAll('.rte-search-match');
const active = (editor: Editor) =>
  editor.view.dom.querySelectorAll('.rte-search-match--active');

describe('consulta literal (C8, C9)', () => {
  it('atravessa marcas no meio da palavra; caseSensitive', () => {
    const editor = createTestEditor({}, '<p>no<strong>tí</strong>cia</p>');
    for (const query of ['notícia', 'NOTÍCIA']) {
      const s = q(editor, query);
      expect(s.matches).toEqual([{ from: 1, to: 8 }]);
      expect(texts(editor, s)).toEqual(['notícia']);
    }
    expect(q(editor, 'NOTÍCIA', { caseSensitive: true }).matches).toEqual([]);
  });

  it.each(['<p>ab</p><p>cd</p>', '<p>ab<br>cd</p>'])(
    'não atravessa blocos nem hardBreak: %s',
    (html) => {
      const editor = createTestEditor({}, html);
      expect(q(editor, 'bc').matches).toEqual([]);
      expect(q(editor, 'ab').matches).toHaveLength(1);
    },
  );

  it('código, célula, título de caixa, tarefa e item de "Leia também"', () => {
    const editor = createTestEditor(
      {},
      '<pre><code>x alvo</code></pre>' +
        '<table><tbody><tr><td><p>alvo</p></td></tr></tbody></table>' +
        '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">alvo</p><p>corpo</p></aside>' +
        '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">alvo</label></li></ul>' +
        '<aside class="rt-read-also" role="note"><p class="rt-read-also__title">Leia</p><ul><li><a href="https://example.com/m">alvo</a></li></ul></aside>',
    );
    const s = q(editor, 'alvo');
    expect(s.matches).toHaveLength(5);
    expect(texts(editor, s)).toEqual(Array(5).fill('alvo'));
    const parents = s.matches.map(
      (m) => editor.state.doc.resolve(m.from).parent.type.name,
    );
    expect(parents[0]).toBe('codeBlock');
    expect(parents[2]).toBe('rtCalloutTitle');
    expect(parents[4]).toBe('rtReadAlsoItem');
    for (let i = 1; i < 5; i++) {
      expect(s.matches[i]!.from).toBeGreaterThan(s.matches[i - 1]!.to);
    }
  });

  it('wholeWord com acentos, sublinhado, número e parênteses', () => {
    const editor = createTestEditor(
      {},
      '<p>ação reação ação_x ação1 (ação)</p>',
    );
    const s = q(editor, 'ação', { wholeWord: true });
    expect(s.matches).toEqual([
      { from: 1, to: 5 },
      { from: 27, to: 31 },
    ]);
    expect(q(editor, 'ação', { wholeWord: false }).matches).toHaveLength(5);
  });

  it('İ e ß: a dobra só vale quando o comprimento se mantém', () => {
    const turkish = createTestEditor({}, '<p>İstanbul istanbul</p>');
    expect(q(turkish, 'i').matches).toEqual([{ from: 10, to: 11 }]);
    expect(q(turkish, 'İ').matches).toEqual([{ from: 1, to: 2 }]);
    const german = createTestEditor({}, '<p>Straße STRASSE</p>');
    expect(texts(german, q(german, 'ß'))).toEqual(['ß']);
    expect(texts(german, q(german, 'ss'))).toEqual(['SS']);
  });

  it('metacaracteres são literais (Review Focus 3)', () => {
    const editor = createTestEditor({}, '<p>a.*b</p>');
    expect(q(editor, '.*').matches).toEqual([{ from: 2, to: 4 }]);
    const plain = createTestEditor({}, '<p>ab</p>');
    expect(q(plain, '.*').matches).toEqual([]);
  });
});

describe('teto, consulta e opções (C10)', () => {
  it('no máximo 1000 resultados indexados e decorados', () => {
    const editor = createTestEditor({}, `<p>${'a '.repeat(1200)}</p>`);
    const s = q(editor, 'a');
    expect(s.matches).toHaveLength(1000);
    expect(s.total).toBe(1000);
    expect(s.capped).toBe(true);
    expect(decorated(editor)).toHaveLength(1000);
    expect(active(editor)).toHaveLength(1);
  });

  it('consulta cortada em 1000 unidades sem partir par; vazia = sem busca', () => {
    const editor = createTestEditor({}, '<p>a</p>');
    expect(q(editor, 'a'.repeat(1001)).query.length).toBe(1000);
    expect(q(editor, `${'a'.repeat(999)}😀`).query.length).toBe(999);
    q(editor, 'a');
    expect(decorated(editor)).toHaveLength(1);
    const s = q(editor, '');
    expect(s.matches).toEqual([]);
    expect(s.activeIndex).toBe(-1);
    expect(decorated(editor)).toHaveLength(0);
  });

  it('setSearchOptions recalcula com a mesma consulta; clearSearch', () => {
    const editor = createTestEditor({}, '<p>Gato gato</p>');
    expect(q(editor, 'gato').matches).toHaveLength(2);
    expect(editor.commands.setSearchOptions({ caseSensitive: true })).toBe(
      true,
    );
    expect(state(editor)).toMatchObject({
      query: 'gato',
      caseSensitive: true,
      wholeWord: false,
      matches: [{ from: 6, to: 10 }],
    });
    expect(editor.commands.clearSearch()).toBe(true);
    expect(state(editor)).toMatchObject({
      query: '',
      matches: [],
      activeIndex: -1,
      lastReplaced: null,
    });
    expect(decorated(editor)).toHaveLength(0);
    expect(editor.commands.clearSearch()).toBe(false);
  });

  it('estado congelado e o mesmo objeto para o mesmo EditorState', () => {
    const editor = createTestEditor({}, '<p>a a</p>');
    const s = q(editor, 'a');
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.matches)).toBe(true);
    expect(Object.isFrozen(s.matches[0])).toBe(true);
    expect(getSearchState(editor)).toBe(s);
  });
});

describe('ativo e navegação (C12)', () => {
  const html = '<p>x a</p><p>a</p><p>a</p>';

  it('ativo inicial: primeiro em ou depois da seleção (circular)', () => {
    const editor = createTestEditor({}, html);
    // Início do 2º parágrafo: depois de `<p>x a</p>` (5) + 1.
    editor.commands.setTextSelection(6);
    expect(q(editor, 'a').activeIndex).toBe(1);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(q(editor, 'a').activeIndex).toBe(0);
  });

  it('next/previous circulares, selecionam e rolam sem focar', () => {
    const editor = createTestEditor({}, html);
    const input = document.body.appendChild(document.createElement('input'));
    input.focus();
    editor.commands.setTextSelection(1);
    q(editor, 'a');
    const trs: Transaction[] = [];
    editor.on('transaction', ({ transaction }) => trs.push(transaction));

    const expectActive = (index: number) => {
      const s = state(editor);
      expect(s.activeIndex).toBe(index);
      const { from, to } = editor.state.selection;
      expect({ from, to }).toEqual(s.matches[index]);
      expect(active(editor)).toHaveLength(1);
      expect(document.activeElement).toBe(input);
    };

    expect(editor.commands.nextSearchMatch()).toBe(true);
    expectActive(1);
    expect(trs.at(-1)?.scrolledIntoView).toBe(true);
    expect(editor.commands.nextSearchMatch()).toBe(true);
    expectActive(2);
    expect(editor.commands.nextSearchMatch()).toBe(true);
    expectActive(0);
    expect(editor.commands.previousSearchMatch()).toBe(true);
    expectActive(2);
    expect(trs.at(-1)?.scrolledIntoView).toBe(true);
    expect(editor.commands.previousSearchMatch()).toBe(true);
    expectActive(1);

    q(editor, 'zzz');
    expect(editor.commands.nextSearchMatch()).toBe(false);
    expect(editor.commands.previousSearchMatch()).toBe(false);
  });

  it('edição antes do ativo: o ativo continua no mesmo trecho', () => {
    const editor = createTestEditor({}, html);
    editor.commands.setTextSelection(1);
    q(editor, 'a');
    editor.commands.nextSearchMatch();
    editor.commands.nextSearchMatch();
    const before = state(editor).matches[2]!;
    editor.commands.insertContentAt(1, 'novo ');
    const s = state(editor);
    expect(s.activeIndex).toBe(2);
    expect(s.matches[2]).toEqual({ from: before.from + 5, to: before.to + 5 });
    expect(active(editor)).toHaveLength(1);
  });

  it('apagar o trecho ativo: primeiro em ou depois da posição mapeada', () => {
    const editor = createTestEditor({}, html);
    editor.commands.setTextSelection(1);
    q(editor, 'a');
    editor.commands.nextSearchMatch();
    const { from, to } = state(editor).matches[1]!;
    editor.commands.deleteRange({ from, to });
    const s = state(editor);
    expect(s.matches).toHaveLength(2);
    expect(s.activeIndex).toBe(1);
    expect(s.matches[1]!.from).toBeGreaterThanOrEqual(from);
  });

  it('consulta e navegação não entram no histórico', () => {
    const editor = createTestEditor({}, html);
    q(editor, 'a');
    editor.commands.nextSearchMatch();
    editor.commands.setSearchOptions({ wholeWord: true });
    editor.commands.clearSearch();
    expect(editor.can().undo()).toBe(false);
  });
});

describe('índice incremental (R5)', () => {
  it('digitar num parágrafo reindexa só esse bloco; meta não reindexa', () => {
    const html = Array.from(
      { length: 500 },
      (_, i) => `<p>palavra ${i + 1}</p>`,
    ).join('');
    const editor = createTestEditor({}, html);
    expect(q(editor, 'palavra').total).toBe(500);
    let pos = 0;
    for (let i = 0; i < 249; i++) pos += editor.state.doc.child(i).nodeSize;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, pos + 2),
      ),
    );
    searchProbe.blocks = 0;
    typeText(editor, 'x');
    expect(searchProbe.blocks).toBe(1);
    expect(state(editor).total).toBe(499);
    searchProbe.blocks = 0;
    editor.view.dispatch(editor.state.tr.setMeta('x', 1));
    expect(searchProbe.blocks).toBe(0);
  });

  it('features.search: false não registra a busca', () => {
    const editor = createTestEditor(
      { features: { search: false } },
      '<p>a</p>',
    );
    expect(getSearchState(editor)).toBeNull();
    expect(
      (editor.commands as Partial<typeof editor.commands>).setSearchQuery,
    ).toBeUndefined();
  });
});

describe('comandos encadeados e opções ausentes', () => {
  // Numa cadeia, o estado do plugin é o de antes da cadeia: comando de busca
  // depois de outro comando de busca, ou navegação/substituição depois de
  // mudar o documento, devolve `false` sem efeito (documentado em search.ts).
  it('setSearchQuery().nextSearchMatch(): a consulta vale, a navegação não', () => {
    const editor = createTestEditor({}, '<p>a a</p>');
    editor.commands.setTextSelection(1);
    expect(editor.chain().setSearchQuery('a').nextSearchMatch().run()).toBe(
      false,
    );
    expect(state(editor)).toMatchObject({ query: 'a', activeIndex: 0 });
    expect(editor.state.selection.from).toBe(1);
    expect(editor.commands.nextSearchMatch()).toBe(true);
    expect(state(editor).activeIndex).toBe(1);
  });

  it('insertContent().nextSearchMatch(): sem exceção, só a edição vale', () => {
    const editor = createTestEditor({}, '<p>a a a</p>');
    editor.commands.setTextSelection(1);
    q(editor, 'a');
    editor.commands.nextSearchMatch();
    const run = () =>
      editor.chain().insertContentAt(1, 'bbbbbbbbbb ').nextSearchMatch().run();
    expect(run).not.toThrow();
    expect(editor.state.doc.textContent).toBe('bbbbbbbbbb a a a');
    const s = state(editor);
    expect(s.matches).toEqual(referenceMatches(editor.state.doc, 'a'));
    // O ativo continua no mesmo trecho (mapeado), sem avançar.
    expect(s.activeIndex).toBe(1);
  });

  it('substituir encadeado depois de busca ou de edição: false sem efeito', () => {
    const editor = createTestEditor({}, '<p>a a</p>');
    q(editor, 'a');
    expect(
      editor.chain().setSearchQuery('a').replaceSearchMatch('b').run(),
    ).toBe(false);
    expect(
      editor.chain().insertContentAt(1, 'x').replaceAllSearchMatches('b').run(),
    ).toBe(false);
    expect(getRteHtml(editor)).toBe('<p>xa a</p>');
  });

  it('opções null valem como ausentes', () => {
    const editor = createTestEditor({}, '<p>Gato gato</p>');
    q(editor, 'gato', { caseSensitive: true });
    expect(() => editor.commands.setSearchOptions(null as never)).not.toThrow();
    expect(state(editor)).toMatchObject({ caseSensitive: true, total: 1 });
    expect(() =>
      editor.commands.setSearchQuery('Gato', null as never),
    ).not.toThrow();
    expect(state(editor)).toMatchObject({ caseSensitive: true, total: 1 });
  });
});

describe('substituição (C10, C11)', () => {
  it('normalizeReplacement: quebras de linha e NUL', () => {
    expect(normalizeReplacement('a\r\nb\rc\nd', false)).toBe('a b c d');
    expect(normalizeReplacement('a\r\nb\rc\nd', true)).toBe('a\nb\nc\nd');
    const fffd = String.fromCharCode(0xfffd);
    expect(normalizeReplacement('\0', false)).toBe(fffd);
    expect(normalizeReplacement('a\0b', true)).toBe(`a${fffd}b`);
  });

  it('substituir um: herda as marcas; o ativo passa ao próximo', () => {
    const editor = createTestEditor({}, '<p><strong>gato</strong> gato</p>');
    editor.commands.setTextSelection(1);
    q(editor, 'gato');
    const trs: Transaction[] = [];
    editor.on('transaction', ({ transaction }) => trs.push(transaction));
    expect(editor.commands.replaceSearchMatch('cão')).toBe(true);
    expect(trs).toHaveLength(1);
    expect(getRteHtml(editor)).toBe('<p><strong>cão</strong> gato</p>');
    const s = state(editor);
    expect(s.lastReplaced).toBe(1);
    expect(s.activeIndex).toBe(0);
    expect(texts(editor, s)).toEqual(['gato']);
    expect(s.matches[0]).toEqual({ from: 5, to: 9 });
    expect(active(editor)).toHaveLength(1);
  });

  it('gato → gatos duas vezes troca os dois; vazio apaga', () => {
    const editor = createTestEditor({}, '<p>gato gato</p>');
    editor.commands.setTextSelection(1);
    q(editor, 'gato');
    expect(editor.commands.replaceSearchMatch('gatos')).toBe(true);
    expect(editor.commands.replaceSearchMatch('gatos')).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>gatos gatos</p>');

    const empty = createTestEditor({}, '<p>a gato b</p>');
    q(empty, 'gato');
    expect(empty.commands.replaceSearchMatch('')).toBe(true);
    expect(empty.state.doc.textContent).toBe('a  b');
    expect(state(empty)).toMatchObject({ total: 0, lastReplaced: 1 });
  });

  it('quebra de linha: espaço no parágrafo, \\n no código; $& literal', () => {
    const p = createTestEditor({}, '<p>x</p>');
    q(p, 'x');
    expect(p.commands.replaceSearchMatch('a\nb')).toBe(true);
    expect(getRteHtml(p)).toBe('<p>a b</p>');

    const code = createTestEditor({}, '<pre><code>x</code></pre>');
    q(code, 'x');
    expect(code.commands.replaceAllSearchMatches('a\r\nb')).toBe(true);
    expect(getRteHtml(code)).toBe('<pre><code>a\nb</code></pre>');

    const literal = createTestEditor({}, '<p>x</p>');
    q(literal, 'x');
    expect(literal.commands.replaceAllSearchMatches('$&$1')).toBe(true);
    expect(literal.state.doc.textContent).toBe('$&$1');
  });

  it('substituir tudo: cada trecho herda as suas marcas', () => {
    const editor = createTestEditor(
      {},
      '<p><em>ab</em> <strong>ab</strong></p>',
    );
    q(editor, 'ab');
    expect(editor.commands.replaceAllSearchMatches('x')).toBe(true);
    expect(getRteHtml(editor)).toBe('<p><em>x</em> <strong>x</strong></p>');
    expect(state(editor)).toMatchObject({ total: 0, lastReplaced: 2 });
  });

  it('substituir tudo sem teto, numa transação: um undo restaura', () => {
    const editor = createTestEditor({}, `<p>${'a '.repeat(1500).trim()}</p>`);
    const original = getRteHtml(editor);
    expect(q(editor, 'a').capped).toBe(true);
    const trs: Transaction[] = [];
    editor.on('transaction', ({ transaction }) => trs.push(transaction));
    expect(editor.commands.replaceAllSearchMatches('b')).toBe(true);
    expect(trs).toHaveLength(1);
    expect(editor.state.doc.textContent).toBe('b '.repeat(1500).trim());
    expect(state(editor)).toMatchObject({ total: 0, lastReplaced: 1500 });
    expect(editor.commands.undo()).toBe(true);
    expect(getRteHtml(editor)).toBe(original);
  });

  it('não funde com a digitação anterior (Review Focus 5)', () => {
    const editor = createTestEditor({}, '<p>gato</p>');
    editor.commands.setTextSelection(5);
    typeText(editor, 'z');
    q(editor, 'gato');
    expect(editor.commands.replaceAllSearchMatches('x')).toBe(true);
    expect(editor.state.doc.textContent).toBe('xz');
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('gatoz');
  });

  it('editor não editável ou sem resultado: false sem efeito', () => {
    const editor = createTestEditor({}, '<p>a a</p>');
    q(editor, 'a');
    editor.setEditable(false);
    expect(editor.commands.replaceSearchMatch('b')).toBe(false);
    expect(editor.commands.replaceAllSearchMatches('b')).toBe(false);
    expect(getRteHtml(editor)).toBe('<p>a a</p>');
    expect(state(editor).lastReplaced).toBeNull();
    expect(q(editor, 'a ').total).toBe(1);

    editor.setEditable(true);
    q(editor, 'zzz');
    expect(editor.commands.replaceSearchMatch('b')).toBe(false);
    expect(editor.commands.replaceAllSearchMatches('b')).toBe(false);
    expect(getRteHtml(editor)).toBe('<p>a a</p>');
  });
});

describe('propriedades (R5)', () => {
  const schema = getSchema(createEditorExtensions());

  /** Trecho de 1 a 8 pontos de código do texto (`null` sem texto). */
  const excerptOf = (json: object): fc.Arbitrary<string> | null => {
    const points = [...schema.nodeFromJSON(json).textContent];
    if (points.length === 0) return null;
    return fc
      .tuple(fc.nat({ max: points.length - 1 }), fc.integer({ min: 1, max: 8 }))
      .map(([i, n]) => points.slice(i, i + n).join(''));
  };

  /** Faixas de conteúdo dos blocos de texto do documento. */
  const textBlocks = (editor: Editor) => {
    const out: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      out.push({ from: pos + 1, to: pos + 1 + node.content.size });
      return false;
    });
    return out;
  };

  it('igual à referência ingênua: do zero, setContent e edição parcial', () => {
    const editor = createTestEditor({}, '<p></p>');
    fc.assert(
      fc.property(
        validDoc.chain((json) => {
          const excerpt = excerptOf(json) ?? fc.constant('');
          return fc.tuple(
            fc.constant(json),
            fc.oneof(
              fc.constant(''),
              fc.constantFrom('A', 'İ', 'ß', '.*', '&', '😀'),
              text,
              excerpt,
            ),
            fc.record({ caseSensitive: fc.boolean(), wholeWord: fc.boolean() }),
            fc.record({
              block: fc.nat(),
              at: fc.nat(),
              remove: fc.nat({ max: 4 }),
              insert: fc.oneof(fc.constant(''), text, excerpt),
            }),
          );
        }),
        ([json, query, options, edit]) => {
          const expected = () =>
            referenceMatches(
              editor.state.doc,
              state(editor).query,
              options,
            ).slice(0, 1000);
          // Consulta antes do conteúdo: caminho incremental (documento mudou).
          editor.commands.setSearchQuery(query, options);
          editor.commands.setContent(json);
          expect(state(editor).matches).toEqual(expected());
          // Consulta sobre o documento: índice do zero.
          expect(q(editor, query, options).matches).toEqual(expected());
          // Edição parcial num bloco: o cache poupa os demais blocos.
          const blocks = textBlocks(editor);
          const block = blocks[edit.block % Math.max(1, blocks.length)];
          if (!block) return;
          const from = block.from + (edit.at % (block.to - block.from + 1));
          const to = Math.min(block.to, from + edit.remove);
          editor.view.dispatch(
            editor.state.tr.insertText(edit.insert, from, to),
          );
          expect(state(editor).matches).toEqual(expected());
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('replaceAll(r) sem ponto de código da consulta: 0 resultados, válido, um undo', () => {
    const editor = createTestEditor({}, '<p></p>');
    const S = editor.storage.rtContent.schema;
    // `r` não vazio: apagar poderia juntar as sobras num novo resultado.
    const noQueryPoint = (query: string) => {
      const banned = new Set(foldCase(query));
      return fc
        .string({ minLength: 1 })
        .filter(
          (r) =>
            ![
              ...foldCase(
                r +
                  normalizeReplacement(r, false) +
                  normalizeReplacement(r, true),
              ),
            ].some((c) => banned.has(c)),
        );
    };
    // Tabelas que continuam com problemas depois do `fixTables` da carga ficam
    // de fora: o prosemirror-tables volta a corrigi-las a cada mudança nelas,
    // inclusive no `undo`, o que não tem relação com a substituição.
    const tablesSettled = () => {
      let ok = true;
      editor.state.doc.descendants((node) => {
        if (node.type.spec['tableRole'] === 'table') {
          if (TableMap.get(node).problems) ok = false;
          return false;
        }
        return ok;
      });
      return ok;
    };
    fc.assert(
      fc.property(
        validDoc.chain((json) => {
          const excerpt = excerptOf(json);
          if (excerpt === null) return fc.constant(null);
          return excerpt.chain((query) =>
            fc.tuple(
              fc.constant(json),
              fc.constant(query),
              noQueryPoint(query),
            ),
          );
        }),
        (input) => {
          fc.pre(input !== null);
          const [json, query, r] = input;
          editor.commands.setContent(json);
          fc.pre(tablesSettled());
          const original = getRteHtml(editor);
          q(editor, query, { caseSensitive: false, wholeWord: false });
          const replaced = editor.commands.replaceAllSearchMatches(r);
          expect(state(editor).total).toBe(0);
          const html = getRteHtml(editor);
          expect(validateHtml(html, S, { mode: 'canonical' })).toEqual([]);
          if (replaced) {
            expect(editor.commands.undo()).toBe(true);
          }
          expect(getRteHtml(editor)).toBe(original);
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});
