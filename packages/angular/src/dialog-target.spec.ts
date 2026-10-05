import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { dialogTarget } from './dialogs/target';
import {
  createTestEditor,
  destroyTestEditors,
  selectText,
} from './testing-support/editors';

afterEach(() => {
  destroyTestEditors();
});

const X = 'https://x.com/';

function at(html: string, text: string, from?: number, to?: number): Editor {
  const editor = createTestEditor(html);
  selectText(editor, text, from, to);
  return editor;
}

describe('dialogTarget: link', () => {
  it('cursor fora de link → insert no cursor', () => {
    const e = at('<p>ab</p>', 'ab', 1);
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'insert',
      range: { from: 2, to: 2 },
    });
  });

  it('seleção fora de link → apply com a seleção', () => {
    const e = at('<p>ab</p>', 'a');
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'apply',
      range: { from: 1, to: 2 },
    });
  });

  it('cursor dentro de um link → edit com o intervalo do link', () => {
    const e = at(`<p><a href="${X}">abc</a></p>`, 'abc', 1);
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'edit',
      range: { from: 1, to: 4 },
    });
  });

  it('seleção dentro de um link → edit com o intervalo do link', () => {
    const e = at(`<p><a href="${X}">abc</a></p>`, 'abc', 1, 2);
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'edit',
      range: { from: 1, to: 4 },
    });
  });

  it('seleção que começa fora e termina dentro de um link → apply (Review Focus 3)', () => {
    const e = at(`<p>xx<a href="${X}">abc</a></p>`, 'xxabc', 0, 4);
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'apply',
      range: { from: 1, to: 5 },
    });
  });

  it('seleção que começa dentro e termina fora de um link → apply', () => {
    const e = at(`<p><a href="${X}">abc</a>xx</p>`, 'abcxx', 1, 5);
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'apply',
      range: { from: 2, to: 6 },
    });
  });

  it('dois links selecionados juntos → apply', () => {
    const e = at(
      `<p><a href="${X}">ab</a> <a href="https://y.com/">cd</a></p>`,
      'ab cd',
    );
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'apply',
      range: { from: 1, to: 6 },
    });
  });

  it('em bloco de código → null', () => {
    const e = at('<pre><code>abc</code></pre>', 'abc', 1);
    expect(dialogTarget(e, 'link')).toBeNull();
    selectText(e, 'abc');
    expect(dialogTarget(e, 'link')).toBeNull();
  });

  it('com a marca code → null (cursor e seleção)', () => {
    const e = at('<p>a<code>bcd</code>e</p>', 'abcde', 2);
    expect(dialogTarget(e, 'link')).toBeNull();
    selectText(e, 'abcde', 0, 3);
    expect(dialogTarget(e, 'link')).toBeNull();
  });

  it('seleção de nó (não de texto) → null', () => {
    const e = createTestEditor('<p>a</p><hr><p>b</p>');
    const hr = e.state.doc.child(0).nodeSize;
    e.view.dispatch(
      e.state.tr.setSelection(NodeSelection.create(e.state.doc, hr)),
    );
    expect(dialogTarget(e, 'link')).toBeNull();
  });
});

describe('dialogTarget: lang', () => {
  it('cursor fora de trecho com idioma → null', () => {
    const e = at('<p>ab</p>', 'ab', 1);
    expect(dialogTarget(e, 'lang')).toBeNull();
  });

  it('seleção → apply com a seleção', () => {
    const e = at('<p>ab</p>', 'ab');
    expect(dialogTarget(e, 'lang')).toEqual({
      mode: 'apply',
      range: { from: 1, to: 3 },
    });
  });

  it('cursor num trecho com idioma → edit com o trecho', () => {
    const e = at('<p>x<span lang="fr">ab</span>y</p>', 'xaby', 2);
    expect(dialogTarget(e, 'lang')).toEqual({
      mode: 'edit',
      range: { from: 2, to: 4 },
    });
  });

  it('em bloco de código → null', () => {
    const e = at('<pre><code>abc</code></pre>', 'abc');
    expect(dialogTarget(e, 'lang')).toBeNull();
  });

  it('sem newsBlocks (sem rtLang no esquema) → null', () => {
    const e = createTestEditor('<p>ab</p>', {
      features: { newsBlocks: false },
    });
    selectText(e, 'ab');
    expect(dialogTarget(e, 'lang')).toBeNull();
  });
});

describe('dialogTarget: quoteAuthor', () => {
  const QUOTE =
    '<figure class="rt-pullquote"><blockquote><p>frase</p></blockquote></figure><p>fora</p>';

  it('dentro de rtPullquote → edit com a seleção', () => {
    const e = at(QUOTE, 'frase', 2);
    const sel = e.state.selection;
    expect(dialogTarget(e, 'quoteAuthor')).toEqual({
      mode: 'edit',
      range: { from: sel.from, to: sel.to },
    });
  });

  it('fora de rtPullquote → null', () => {
    const e = at(QUOTE, 'fora', 2);
    expect(dialogTarget(e, 'quoteAuthor')).toBeNull();
  });
});

describe('dialogTarget: table', () => {
  it('fora de tabela → insert', () => {
    const e = at('<p>ab</p>', 'ab', 1);
    expect(dialogTarget(e, 'table')).toEqual({
      mode: 'insert',
      range: { from: 2, to: 2 },
    });
  });

  it('dentro de tabela → null', () => {
    const e = at(
      '<table><tbody><tr><td><p>cel</p></td></tr></tbody></table>',
      'cel',
      1,
    );
    expect(dialogTarget(e, 'table')).toBeNull();
  });

  it('com tables: false → null', () => {
    const e = createTestEditor('<p>ab</p>', { features: { tables: false } });
    selectText(e, 'ab', 1);
    expect(dialogTarget(e, 'table')).toBeNull();
  });
});
