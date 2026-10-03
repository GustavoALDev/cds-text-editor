// @vitest-environment jsdom
// Parser do editor: o texto que nasce depois de um bloco que dividiu o pai
// perde o espaço colapsável inicial (ponto fixo da releitura, spec 03b, A1).
import { DOMParser as PMParser } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

afterEach(() => destroyTestEditors());

const IMG = '<img src="https://example.com/a.png" alt="">';
const FIG =
  '<figure class="rt-figure rt-figure--center"><img src="https://example.com/a.png" alt="" loading="lazy" decoding="async"></figure>';

function paste(html: string): string {
  const editor = createTestEditor();
  editor.commands.focus('end');
  editor.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
  return getRteHtml(editor);
}

describe('parser do editor (espaço depois de bloco)', () => {
  it('conteúdo inicial, setContent e colagem dão <p>b</p>', () => {
    const input = `<p>a <img src="https://example.com/a.png" alt=""> b</p>`;
    const expected = `<p>a</p>${FIG}<p>b</p>`;
    expect(getRteHtml(createTestEditor({}, input))).toBe(expected);
    const editor = createTestEditor();
    editor.commands.setContent(input);
    expect(getRteHtml(editor)).toBe(expected);
    expect(paste(input)).toBe(expected);
  });

  it('vale dentro de item de lista e com marca', () => {
    expect(
      getRteHtml(
        createTestEditor({}, `<ul><li><p>a ${IMG} <b>b</b></p></li></ul>`),
      ),
    ).toBe(`<ul><li><p>a</p>${FIG}<p><strong>b</strong></p></li></ul>`);
  });

  it('só espaço depois do bloco: nenhum parágrafo vazio a mais', () => {
    expect(paste(`<p>a ${IMG} </p>`)).toBe(`<p>a</p>${FIG}`);
  });

  it('NBSP inicial e código ficam', () => {
    expect(getRteHtml(createTestEditor({}, `<p>a ${IMG} &nbsp;b</p>`))).toBe(
      `<p>a</p>${FIG}<p>&nbsp;b</p>`,
    );
    expect(
      getRteHtml(createTestEditor({}, '<pre><code>  x</code></pre>')),
    ).toBe('<pre><code>  x</code></pre>');
  });

  it('preserveWhitespace: o parser não mexe', () => {
    const editor = createTestEditor();
    const parser = PMParser.fromSchema(editor.schema);
    const dom = document.createElement('div');
    dom.append(
      new window.DOMParser().parseFromString(`<p>a ${IMG} b</p>`, 'text/html')
        .body.firstChild!,
    );
    const doc = parser.parse(dom, { preserveWhitespace: true });
    expect(doc.lastChild?.textContent).toBe(' b');
    expect(parser.parse(dom).lastChild?.textContent).toBe('b');
  });

  it('sem bloco no meio do texto, igual ao parser do ProseMirror', () => {
    const editor = createTestEditor({}, '<p>a</p>');
    const rte = PMParser.fromSchema(editor.schema);
    const base = new PMParser(editor.schema, rte.rules);
    const context = editor.state.doc.resolve(2);
    for (const html of [
      '<span> b</span>',
      '<p> x</p><p>y <b> z</b></p>',
      '<ul><li> a</li></ul>',
      '<blockquote> q <p> r</p></blockquote>',
    ]) {
      const dom = document.createElement('div');
      dom.append(
        ...Array.from(
          new window.DOMParser().parseFromString(html, 'text/html').body
            .childNodes,
        ),
      );
      expect(rte.parseSlice(dom, { context }).toJSON(), html).toEqual(
        base.parseSlice(dom, { context }).toJSON(),
      );
      expect(rte.parse(dom).toJSON(), html).toEqual(base.parse(dom).toJSON());
    }
  });
});
