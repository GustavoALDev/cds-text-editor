// @vitest-environment jsdom
// Limite de caracteres (spec 03c, C4/C6/R3).
//
// Reproduzir uma falha da propriedade: `FC_SEED=<n> npx vitest run extensions/src/char-limit.spec.ts`
// (a semente aparece na falha); `FC_RUNS` muda o número de execuções.
import type { Editor } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { charLimitKey, getCharLimitState } from './char-limit';
import { createEditorExtensions } from './factory';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import { pressKey } from './testing/press-key';
import { typeText } from './testing/type-text';
import type { RteEditorOptions } from './types';

const SEED = Number(process.env['FC_SEED'] ?? 20261003);
const RUNS = Number(process.env['FC_RUNS'] ?? 200);

const NBSP = ' ';

afterEach(() => destroyTestEditors());

function make(
  charLimit: Exclude<RteEditorOptions['charLimit'], undefined>,
  content?: string,
): Editor {
  const editor = createTestEditor({ charLimit }, content);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  return editor;
}

const chars = (editor: Editor) => getCharLimitState(editor);
const paste = () => new Event('paste') as ClipboardEvent;
const text = (editor: Editor) => editor.state.doc.textContent;
const endOf = (editor: Editor) => editor.state.doc.content.size - 1;

describe('digitação', () => {
  it('recusa o que passa do limite e conta as recusas', () => {
    const editor = make(5, '<p>abcd</p>');
    typeText(editor, 'ef');
    expect(text(editor)).toBe('abcde');
    expect(chars(editor)).toMatchObject({
      characters: 5,
      limit: 5,
      remaining: 0,
      overLimit: false,
      rejected: 1,
    });
  });

  it('espaço no fim é aceito (o colapso o ignora); a letra depois, não', () => {
    const editor = make(5, '<p>abcde</p>');
    typeText(editor, ' ');
    expect(text(editor)).toBe('abcde ');
    expect(chars(editor).rejected).toBe(0);
    typeText(editor, 'f');
    expect(text(editor)).toBe('abcde ');
    expect(chars(editor).rejected).toBe(1);
  });

  it('conteúdo acima do limite é preservado; apagar e trocar menor passam', () => {
    const editor = make(5);
    editor.commands.setContent('<p>abcdefg</p>');
    editor.commands.setTextSelection(endOf(editor));
    expect(text(editor)).toBe('abcdefg');
    expect(chars(editor)).toMatchObject({
      characters: 7,
      overLimit: true,
      remaining: -2,
      rejected: 0,
    });
    typeText(editor, 'x');
    expect(text(editor)).toBe('abcdefg');
    expect(chars(editor).rejected).toBe(1);
    // Backspace com o cursor no meio do texto fica para o navegador (o keymap
    // devolve `false`); com seleção, o `deleteSelection` do keymap trata.
    editor.commands.setTextSelection({ from: 7, to: 8 });
    expect(pressKey(editor, 'Backspace')).toBe(true);
    expect(text(editor)).toBe('abcdef');
    editor.commands.setTextSelection({ from: 1, to: 3 });
    typeText(editor, 'z');
    expect(text(editor)).toBe('zcdef');
    expect(chars(editor).rejected).toBe(1);
  });

  it('selecionar ab de abcdefg e digitar z é aceito (7 → 6)', () => {
    const editor = make(5, '<p>abcdefg</p>');
    editor.commands.setTextSelection({ from: 1, to: 3 });
    typeText(editor, 'z');
    expect(text(editor)).toBe('zcdefg');
    expect(chars(editor).characters).toBe(6);
  });

  it('composição IME nunca é recusada', () => {
    const editor = make(3, '<p>abc</p>');
    (
      editor.view as unknown as { input: { composing: boolean } }
    ).input.composing = true;
    typeText(editor, 'x');
    (
      editor.view as unknown as { input: { composing: boolean } }
    ).input.composing = false;
    expect(text(editor)).toBe('abcx');
    expect(chars(editor)).toMatchObject({ overLimit: true, rejected: 0 });
  });

  it('comandos não são barrados', () => {
    const editor = make(3, '<p>abc</p>');
    editor.commands.insertContent('xyz');
    expect(text(editor)).toBe('abcxyz');
    expect(chars(editor)).toMatchObject({ overLimit: true, rejected: 0 });
  });
});

describe('colagem', () => {
  it('corta no maior prefixo que cabe, como colagem desfazível', () => {
    const editor = make(10, '<p>abc</p>');
    const seen: Transaction[] = [];
    editor.on('transaction', ({ transaction }) => seen.push(transaction));
    editor.view.pasteText('defghijklmnop', paste());
    expect(text(editor)).toBe('abcdefghij');
    expect(chars(editor).rejected).toBe(1);
    expect(seen.some((tr) => tr.getMeta('uiEvent') === 'paste')).toBe(true);
    editor.commands.undo();
    expect(text(editor)).toBe('abc');
  });

  it('corte atravessa marcas', () => {
    const editor = make(10, '<p>abc</p>');
    editor.view.pasteHTML('<p><strong>defgh</strong>ijklm</p>', paste());
    expect(getRteHtml(editor)).toBe('<p>abc<strong>defgh</strong>ij</p>');
  });

  it('corte fecha a estrutura (lista)', () => {
    const editor = make(6);
    editor.view.pasteHTML(
      '<ul><li><p>1234</p></li><li><p>5678</p></li></ul>',
      paste(),
    );
    const html = getRteHtml(editor);
    expect(html).toBe('<ul><li><p>1234</p></li><li><p>56</p></li></ul>');
    expect(() => editor.state.doc.check()).not.toThrow();
    expect(
      validateHtml(html, editor.storage.rtContent.schema, {
        mode: 'canonical',
      }),
    ).toEqual([]);
  });

  it('não parte par substituto', () => {
    const editor = make(4, '<p>ab</p>');
    editor.view.pasteText('😀😀😀😀😀', paste());
    expect(text(editor)).toBe('ab😀😀');
  });

  it('nada cabe: recusa e conta', () => {
    const editor = make(3, '<p>abc</p>');
    editor.view.pasteText('d', paste());
    expect(text(editor)).toBe('abc');
    expect(chars(editor).rejected).toBe(1);
  });

  it('documento já acima do limite: colagem toda recusada', () => {
    const editor = make(5);
    editor.commands.setContent('<p>abcdefg</p>');
    editor.commands.setTextSelection(endOf(editor));
    const doc = editor.state.doc;
    editor.view.pasteText('x', paste());
    expect(editor.state.doc.eq(doc)).toBe(true);
    expect(chars(editor)).toMatchObject({ overLimit: true, rejected: 1 });
  });

  it('abaixo do limite não muda rejected', () => {
    const editor = make(10, '<p>abc</p>');
    editor.view.pasteText('def', paste());
    expect(text(editor)).toBe('abcdef');
    expect(chars(editor).rejected).toBe(0);
  });
});

describe('soltar', () => {
  const bigSlice = (editor: Editor) =>
    new Slice(Fragment.from(editor.schema.text('xxxxxxxxxx')), 0, 0);

  function drop(editor: Editor, moved: boolean, big = bigSlice(editor)) {
    const { view } = editor;
    vi.spyOn(view, 'posAtCoords').mockReturnValue({
      pos: endOf(editor),
      inside: -1,
    });
    return (
      view.someProp('handleDrop', (f) =>
        f(view, new Event('drop') as DragEvent, big, moved),
      ) === true
    );
  }

  it('externo que passa do limite é recusado', () => {
    const editor = make(5, '<p>abc</p>');
    expect(drop(editor, false)).toBe(true);
    expect(text(editor)).toBe('abc');
    expect(chars(editor).rejected).toBe(1);
  });

  it('arrasto interno com modificador de cópia (moved: false) não é barrado', () => {
    const editor = make(5, '<p>abc</p>');
    const slice = bigSlice(editor);
    // Como o `prosemirror-view` no `dragstart` de um recorte deste editor.
    editor.view.dragging = { slice, move: false };
    try {
      expect(drop(editor, false, slice)).toBe(false);
    } finally {
      editor.view.dragging = null;
    }
    expect(chars(editor).rejected).toBe(0);
  });

  it('arrasto interno não é tratado', () => {
    const editor = make(5, '<p>abc</p>');
    expect(drop(editor, true)).toBe(false);
    expect(chars(editor).rejected).toBe(0);
  });
});

describe('limite por função e validação', () => {
  it('a função é lida a cada verificação', () => {
    let l: number | null = 5;
    const editor = make(() => l, '<p>abcde</p>');
    typeText(editor, 'f');
    expect(text(editor)).toBe('abcde');
    l = 10;
    typeText(editor, 'f');
    expect(text(editor)).toBe('abcdef');
    expect(chars(editor)).toMatchObject({ limit: 10, remaining: 4 });
  });

  const invalid: [string, () => number | null | undefined][] = [
    ['-1', () => -1],
    ['1.5', () => 1.5],
    ['NaN', () => NaN],
    ["'5'", () => '5' as never],
    ['undefined', () => undefined],
    [
      'função que lança',
      () => {
        throw new Error('x');
      },
    ],
  ];
  it.each(invalid)('função devolvendo %s: sem limite', (_n, source) => {
    const editor = make(source, '<p>abcde</p>');
    typeText(editor, 'fgh');
    expect(text(editor)).toBe('abcdefgh');
    expect(chars(editor)).toMatchObject({
      limit: null,
      remaining: null,
      overLimit: false,
    });
  });

  it.each([-1, 1.5, Infinity, NaN, '5' as never])(
    'fábrica recusa %s com RangeError',
    (value) => {
      expect(() => createEditorExtensions({ charLimit: value })).toThrow(
        RangeError,
      );
    },
  );

  it('fábrica aceita 0 e null', () => {
    expect(() => createEditorExtensions({ charLimit: 0 })).not.toThrow();
    expect(() => createEditorExtensions({ charLimit: null })).not.toThrow();
  });
});

describe('getCharLimitState', () => {
  it('mesmo estado: mesmo objeto, congelado', () => {
    const editor = make(5, '<p>abc</p>');
    const a = getCharLimitState(editor);
    expect(getCharLimitState(editor)).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('sem a extensão: TypeError', async () => {
    const { Editor } = await import('@tiptap/core');
    const { default: Document } = await import('@tiptap/extension-document');
    const { default: Paragraph } = await import('@tiptap/extension-paragraph');
    const { default: Text } = await import('@tiptap/extension-text');
    const bare = new Editor({ extensions: [Document, Paragraph, Text] });
    expect(() => getCharLimitState(bare)).toThrow(TypeError);
    bare.destroy();
  });

  it('plugin do limite vem antes de toda regra de entrada', () => {
    const editor = make(5);
    const plugins = editor.state.plugins;
    const index = plugins.findIndex((p) => p.spec.key === charLimitKey);
    expect(index).toBeGreaterThanOrEqual(0);
    const inputRules = plugins
      .map((p, i) =>
        (p.spec as { isInputRules?: boolean }).isInputRules ? i : -1,
      )
      .filter((i) => i >= 0);
    expect(inputRules.length).toBeGreaterThan(0);
    for (const i of inputRules) expect(index).toBeLessThan(i);
  });
});

describe('propriedade: colagem nunca passa do limite', () => {
  // Tempo por teste: FC_RUNS alto em execuções locais.
  it(
    'characters ≤ max(limite, antes) e documento válido',
    { timeout: 300_000 },
    () => {
      let limit = 0;
      const editor = createTestEditor({ charLimit: () => limit });
      const unit = fc.constantFrom('a', ' ', NBSP, '😀', 'é');
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 40 }),
          fc.string({ unit, maxLength: 30 }),
          fc.string({ unit, minLength: 1, maxLength: 40 }),
          (l, initial, pasted) => {
            limit = l;
            editor.commands.setContent({
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content:
                    initial === '' ? [] : [{ type: 'text', text: initial }],
                },
              ],
            });
            editor.commands.setTextSelection(endOf(editor));
            const before = chars(editor).characters;
            editor.view.pasteText(pasted, paste());
            expect(chars(editor).characters).toBeLessThanOrEqual(
              Math.max(l, before),
            );
            editor.state.doc.check();
          },
        ),
        { seed: SEED, numRuns: RUNS },
      );
    },
  );
});
