import type { Editor } from '@tiptap/core';
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { getHtmlSchema } from '@cds/rte-core';
import { readMediaRules } from './dialogs/media-rules';
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

/** Seleciona tudo (Ctrl+A do Tiptap: `AllSelection`). */
function selectAll(editor: Editor): void {
  editor.commands.selectAll();
  expect(editor.state.selection).toBeInstanceOf(AllSelection);
}

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

  it('cursor exatamente nas bordas de um link → edit', () => {
    const e = at(`<p>x<a href="${X}">abc</a>y</p>`, 'xabcy', 1);
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'edit',
      range: { from: 2, to: 5 },
    });
    selectText(e, 'xabcy', 4);
    expect(e.state.selection.from).toBe(5);
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'edit',
      range: { from: 2, to: 5 },
    });
  });

  it('seleção de tudo (Ctrl+A) → apply com o documento inteiro', () => {
    const e = createTestEditor('<p>ab</p><p>cd</p>');
    selectAll(e);
    expect(dialogTarget(e, 'link')).toEqual({
      mode: 'apply',
      range: { from: 0, to: e.state.doc.content.size },
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

  it('seleção de tudo (Ctrl+A) → apply com o documento inteiro', () => {
    const e = createTestEditor('<p>ab</p><p>cd</p>');
    selectAll(e);
    expect(dialogTarget(e, 'lang')).toEqual({
      mode: 'apply',
      range: { from: 0, to: e.state.doc.content.size },
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

  it('seleção que começa dentro e termina fora de rtPullquote → null', () => {
    const e = at(QUOTE, 'frase', 2);
    const from = e.state.selection.from;
    selectText(e, 'fora', 2);
    const to = e.state.selection.from;
    e.view.dispatch(
      e.state.tr.setSelection(TextSelection.create(e.state.doc, from, to)),
    );
    expect(dialogTarget(e, 'quoteAuthor')).toBeNull();
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

  it('com seleção → insert no ponto de inserção', () => {
    const e = at('<p>ab</p>', 'ab');
    expect(dialogTarget(e, 'table')).toEqual({
      mode: 'insert',
      range: { from: 1, to: 1 },
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

describe('dialogTarget: mídia (V2, pré-voo 2)', () => {
  const IMG =
    '<p>ab</p><figure class="rt-figure rt-figure--center"><img src="/a.png" alt="A"></figure><p>cd</p>';
  const VIDEO =
    '<p>ab</p><figure class="rt-figure rt-figure--video"><video src="/v.webm" controls=""></video></figure><p>cd</p>';
  const EMBED =
    '<p>ab</p><figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube"></iframe></figure><p>cd</p>';

  /** Seleciona (NodeSelection) o primeiro nó do tipo; devolve a posição. */
  function selectNode(editor: Editor, typeName: string): number {
    let found = -1;
    editor.state.doc.descendants((node, pos) => {
      if (found >= 0) return false;
      if (node.type.name === typeName) found = pos;
      return found < 0;
    });
    expect(found).toBeGreaterThanOrEqual(0);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, found),
      ),
    );
    return found;
  }

  function cursor(editor: Editor, pos: number): void {
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
    );
  }

  it.each(['image', 'video', 'embed'] as const)(
    'cursor em <p>ab</p> → %s insert {1,1}',
    (kind) => {
      const e = createTestEditor('<p>ab</p>');
      cursor(e, 1);
      expect(dialogTarget(e, kind)).toEqual({
        mode: 'insert',
        range: { from: 1, to: 1 },
      });
    },
  );

  it('seleção de texto → insert com a seleção', () => {
    const e = at('<p>abcd</p>', 'bc');
    expect(dialogTarget(e, 'image')).toEqual({
      mode: 'insert',
      range: { from: 2, to: 4 },
    });
  });

  it('NodeSelection de rtImage em pos → image edit {pos, pos+1}', () => {
    const e = createTestEditor(IMG);
    const pos = selectNode(e, 'rtImage');
    expect(dialogTarget(e, 'image')).toEqual({
      mode: 'edit',
      range: { from: pos, to: pos + 1 },
    });
  });

  it('NodeSelection de rtVideo + image → insert; video → edit', () => {
    const e = createTestEditor(VIDEO);
    const pos = selectNode(e, 'rtVideo');
    expect(dialogTarget(e, 'image')).toEqual({
      mode: 'insert',
      range: { from: pos, to: pos + 1 },
    });
    expect(dialogTarget(e, 'video')).toEqual({
      mode: 'edit',
      range: { from: pos, to: pos + 1 },
    });
  });

  it('NodeSelection de rtEmbed → embed edit; image/video insert', () => {
    const e = createTestEditor(EMBED);
    const pos = selectNode(e, 'rtEmbed');
    expect(dialogTarget(e, 'embed')).toEqual({
      mode: 'edit',
      range: { from: pos, to: pos + 1 },
    });
    expect(dialogTarget(e, 'image')?.mode).toBe('insert');
    expect(dialogTarget(e, 'video')?.mode).toBe('insert');
  });

  it('NodeSelection de rtImage + video/embed → insert', () => {
    const e = createTestEditor(IMG);
    selectNode(e, 'rtImage');
    expect(dialogTarget(e, 'video')?.mode).toBe('insert');
    expect(dialogTarget(e, 'embed')?.mode).toBe('insert');
  });

  it.each(['image', 'video', 'embed'] as const)(
    '%s: cursor em célula de tabela e em bloco de código → insert',
    (kind) => {
      const e = at(
        '<table><tbody><tr><td><p>cel</p></td></tr></tbody></table><pre><code>abc</code></pre>',
        'cel',
        1,
      );
      const inCell = e.state.selection.from;
      expect(dialogTarget(e, kind)).toEqual({
        mode: 'insert',
        range: { from: inCell, to: inCell },
      });
      selectText(e, 'abc', 1);
      const inCode = e.state.selection.from;
      expect(dialogTarget(e, kind)).toEqual({
        mode: 'insert',
        range: { from: inCode, to: inCode },
      });
    },
  );

  it('features.media: false → image e video null; embed segue', () => {
    const e = createTestEditor('<p>ab</p>', { features: { media: false } });
    cursor(e, 1);
    expect(dialogTarget(e, 'image')).toBeNull();
    expect(dialogTarget(e, 'video')).toBeNull();
    expect(dialogTarget(e, 'embed')?.mode).toBe('insert');
  });

  it('embedProviders: [] → embed null; image/video seguem', () => {
    const e = createTestEditor('<p>ab</p>', { embedProviders: [] });
    cursor(e, 1);
    expect(dialogTarget(e, 'embed')).toBeNull();
    expect(dialogTarget(e, 'image')?.mode).toBe('insert');
  });

  it('features.embeds: false → embed null', () => {
    const e = createTestEditor('<p>ab</p>', { features: { embeds: false } });
    cursor(e, 1);
    expect(dialogTarget(e, 'embed')).toBeNull();
  });
});

describe('readMediaRules (V4, pré-voo 3)', () => {
  it('lê as regras de URL e de idioma das mídias do esquema', () => {
    const schema = getHtmlSchema({});
    const rules = readMediaRules(schema);
    const el = schema.elements;
    expect(rules).toEqual({
      imageSrc: el['img']?.attributes['src']?.rule,
      videoSrc: el['video']?.attributes['src']?.rule,
      videoPoster: el['video']?.attributes['poster']?.rule,
      trackSrc: el['track']?.attributes['src']?.rule,
      trackLang: el['track']?.attributes['srclang']?.rule,
    });
    expect(rules?.imageSrc.kind).toBe('url');
    expect(rules?.trackLang.kind).toBe('pattern');
  });

  it('as regras seguem as opções (mediaHosts)', () => {
    const rules = readMediaRules(
      getHtmlSchema({ mediaHosts: ['media.example.test'] }),
    );
    expect(rules?.imageSrc).toMatchObject({
      kind: 'url',
      hosts: ['media.example.test'],
    });
  });

  it('media desligado → null', () => {
    expect(readMediaRules(getHtmlSchema({ features: { media: false } }))).toBe(
      null,
    );
  });
});
