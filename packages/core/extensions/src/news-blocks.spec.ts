// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { DOMParser as PMParser } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { createEditorExtensions } from './factory';
import { RTE_CONTENT_LABELS } from './labels';
import { itemsToParagraphs } from './item-keymap';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import type { RteEditorOptions } from './types';

const ONLY_NEWS = {
  colors: false,
  code: false,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: true,
};

const PT = { labels: RTE_CONTENT_LABELS['pt-BR'] };

afterEach(() => destroyTestEditors());

function editorWith(
  content?: string | object,
  options: RteEditorOptions = {},
): Editor {
  return createTestEditor(
    { features: ONLY_NEWS, ...options },
    content as string | undefined,
  );
}

function canonical(editor: Editor): string {
  const out = getRteHtml(editor);
  expect(
    validateHtml(out, editor.storage.rtContent.schema, { mode: 'canonical' }),
  ).toEqual([]);
  return out;
}

function html(content: string | object, options?: RteEditorOptions): string {
  return canonical(editorWith(content, options));
}

/** Cursor no deslocamento `offset` do primeiro bloco de texto igual a `text`. */
function cursorIn(editor: Editor, text: string, offset: number): void {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isTextblock && node.textContent === text) {
      target = pos + 1 + offset;
    }
    return target < 0;
  });
  if (target < 0) throw new Error(`bloco "${text}" não encontrado`);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, target),
    ),
  );
}

/** Tecla pelo `handleKeyDown` da vista, como um `keydown` real. */
function press(editor: Editor, key: string): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  return (
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, event)) === true
  );
}

/** Tipo e texto do bloco de texto do cursor. */
function cursorBlock(editor: Editor): [string, string, number] {
  const { $from } = editor.state.selection;
  return [$from.parent.type.name, $from.parent.textContent, $from.parentOffset];
}

const PULLQUOTE =
  '<figure class="rt-pullquote"><blockquote><p>Frase</p></blockquote><figcaption><cite>Ana</cite>, editora</figcaption></figure>';
const CALLOUT =
  '<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title">Atenção</p><p>Texto</p></aside>';
const READ_ALSO =
  '<aside class="rt-read-also" role="note"><p class="rt-read-also__title">Leia também</p><ul><li><a href="https://a.com/">A</a></li></ul></aside>';

describe('blocos de notícia: saída canônica', () => {
  it('citação em destaque com autor e cargo', () => {
    expect(html(PULLQUOTE)).toBe(PULLQUOTE);
  });

  it('citação: só autor, só cargo e nenhum', () => {
    const json = (attrs: object) => ({
      type: 'doc',
      content: [
        {
          type: 'rtPullquote',
          attrs,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'F' }] },
          ],
        },
      ],
    });
    const quote =
      '<figure class="rt-pullquote"><blockquote><p>F</p></blockquote>';
    expect(html(json({ author: 'Ana' }))).toBe(
      `${quote}<figcaption><cite>Ana</cite></figcaption></figure>`,
    );
    expect(html(json({ role: 'editora' }))).toBe(
      `${quote}<figcaption>editora</figcaption></figure>`,
    );
    expect(html(json({}))).toBe(`${quote}</figure>`);
    // JSON com valores não texto: tratados como ausentes na renderização
    expect(html(json({ author: 1, role: { x: 1 } }))).toBe(`${quote}</figure>`);
  });

  it('caixa de destaque com rótulo pt-BR', () => {
    expect(html(CALLOUT, PT)).toBe(CALLOUT);
  });

  it('as 4 variantes', () => {
    for (const variant of ['info', 'success', 'warning', 'danger']) {
      const box = `<aside class="rt-callout rt-callout--${variant}" role="note"><p class="rt-callout__title">T</p><p>X</p></aside>`;
      expect(html(box)).toBe(box);
    }
  });

  it('caixa com listas', () => {
    const box =
      '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">T</p><ul><li><p>a</p></li></ul><ol><li><p>b</p></li></ol></aside>';
    expect(html(box)).toBe(box);
  });

  it('Leia também', () => {
    expect(html(READ_ALSO, PT)).toBe(READ_ALSO);
  });

  it('variante inválida vinda de JSON sai como info', () => {
    expect(
      html({
        type: 'doc',
        content: [
          {
            type: 'rtCallout',
            attrs: { variant: 'evil' },
            content: [
              { type: 'rtCalloutTitle' },
              { type: 'paragraph', content: [{ type: 'text', text: 'X' }] },
            ],
          },
        ],
      }),
    ).toBe(
      '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">Information</p><p>X</p></aside>',
    );
  });
});

describe('blocos de notícia: leitura', () => {
  it('autor e cargo do figcaption', () => {
    const editor = editorWith(PULLQUOTE);
    expect(editor.state.doc.firstChild?.attrs).toEqual({
      author: 'Ana',
      role: 'editora',
    });
  });

  it('autor e cargo com espaços colapsados; cargo sem cite', () => {
    const a = editorWith(
      '<figure class="rt-pullquote"><blockquote><p>F</p></blockquote><figcaption>  <cite> Ana  Lu </cite> ,  editora\n chefe </figcaption></figure>',
    );
    expect(a.state.doc.firstChild?.attrs).toEqual({
      author: 'Ana Lu',
      role: 'editora chefe',
    });
    const b = editorWith(
      '<figure class="rt-pullquote"><blockquote><p>F</p></blockquote><figcaption>editora</figcaption></figure>',
    );
    expect(b.state.doc.firstChild?.attrs).toEqual({
      author: '',
      role: 'editora',
    });
  });

  it('figure.rt-pullquote fora da estrutura: o texto fica', () => {
    const out = html(
      '<figure class="rt-pullquote"><p>Solto</p><blockquote><p>F</p></blockquote><figcaption>Leg</figcaption></figure>',
    );
    expect(out).not.toContain('rt-pullquote');
    expect(out).toContain('Solto');
    expect(out).toContain('<blockquote><p>F</p></blockquote>');
    expect(out).toContain('Leg');
  });

  it('caixa sem título: título sintetizado vazio, preenchido na saída', () => {
    const editor = editorWith(
      '<aside class="rt-callout rt-callout--danger"><p>X</p></aside>',
    );
    const box = editor.state.doc.firstChild;
    expect(box?.type.name).toBe('rtCallout');
    expect(box?.attrs).toEqual({ variant: 'danger' });
    expect(box?.firstChild?.type.name).toBe('rtCalloutTitle');
    expect(box?.firstChild?.textContent).toBe('');
    expect(canonical(editor)).toBe(
      '<aside class="rt-callout rt-callout--danger" role="note"><p class="rt-callout__title">Danger</p><p>X</p></aside>',
    );
  });

  it('caixa sem classe de variante: info', () => {
    expect(html('<aside class="rt-callout"><p>X</p></aside>')).toBe(
      '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">Information</p><p>X</p></aside>',
    );
  });

  it('título da caixa lido do p.rt-callout__title', () => {
    expect(
      html(
        '<aside class="rt-callout rt-callout--success"><p class="rt-callout__title">Meu</p><p>X</p></aside>',
      ),
    ).toBe(
      '<aside class="rt-callout rt-callout--success" role="note"><p class="rt-callout__title">Meu</p><p>X</p></aside>',
    );
  });

  it('p.rt-callout__title fora da caixa é parágrafo comum', () => {
    expect(html('<p class="rt-callout__title">T</p>')).toBe('<p>T</p>');
  });

  it('caixa fora da estrutura (texto solto, título fora do lugar): o texto fica', () => {
    const a = html('<aside class="rt-callout">Solto<p>X</p></aside>');
    expect(a).not.toContain('rt-callout');
    expect(a).toContain('Solto');
    expect(a).toContain('X');
    const b = html(
      '<aside class="rt-callout"><p>X</p><p class="rt-callout__title">T</p></aside>',
    );
    expect(b).toBe('<p>X</p><p>T</p>');
    const c = html(
      '<aside class="rt-callout"><ul class="rt-tasks"><li>a</li></ul></aside>',
    );
    expect(c).not.toContain('rt-callout');
    expect(c).toContain('a');
  });

  it('Leia também com li > p: título sintetizado e item sem p', () => {
    const editor = editorWith(
      '<aside class="rt-read-also"><ul><li><p>A</p></li></ul></aside>',
    );
    const box = editor.state.doc.firstChild;
    expect(box?.type.name).toBe('rtReadAlso');
    expect(box?.firstChild?.textContent).toBe('');
    expect(canonical(editor)).toBe(
      '<aside class="rt-read-also" role="note"><p class="rt-read-also__title">Read also</p><ul><li>A</li></ul></aside>',
    );
  });

  it('Leia também fora da estrutura (duas listas): o texto fica', () => {
    const out = html(
      '<aside class="rt-read-also"><ul><li>A</li></ul><ul><li>B</li></ul></aside>',
    );
    expect(out).not.toContain('rt-read-also');
    expect(out).toContain('A');
    expect(out).toContain('B');
  });

  it('Leia também com li de tarefa ou li com dois p: o texto fica, sem caixa', () => {
    for (const li of [
      '<li class="rt-task">A</li>',
      '<li data-type="taskItem"><p>A</p></li>',
      '<li><p>A</p><p>B</p></li>',
      '<li>A<ul><li>B</li></ul></li>',
    ]) {
      const out = html(`<aside class="rt-read-also"><ul>${li}</ul></aside>`);
      expect(out).not.toContain('rt-read-also');
      expect(out).toContain('A');
    }
    expect(
      html(
        '<aside class="rt-read-also"><ul><li><p>A</p><p>B</p></li></ul></aside>',
      ),
    ).toContain('B');
  });

  it('Leia também com li inline com marcas e li > p único com espaços', () => {
    expect(
      html(
        '<aside class="rt-read-also"><ul><li><a href="https://a.com/"><strong>A</strong></a></li><li> <p>B</p> </li></ul></aside>',
      ),
    ).toBe(
      '<aside class="rt-read-also" role="note"><p class="rt-read-also__title">Read also</p><ul><li><a href="https://a.com/"><strong>A</strong></a></li><li>B</li></ul></aside>',
    );
  });

  it('ul e li fora do Leia também continuam listas comuns', () => {
    expect(html('<ul><li><p>a</p></li></ul>')).toBe(
      '<ul><li><p>a</p></li></ul>',
    );
  });

  it('a leitura não muta o DOM e é idempotente (elemento vivo lido duas vezes)', () => {
    const editor = editorWith();
    const element = document.createElement('div');
    const callout = document.createElement('aside');
    callout.setAttribute('class', 'rt-callout rt-callout--warning');
    const p = document.createElement('p');
    p.append('X');
    callout.append(p);
    const readAlso = document.createElement('aside');
    readAlso.setAttribute('class', 'rt-read-also');
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    const inner = document.createElement('p');
    inner.append('A');
    li.append(inner);
    ul.append(li);
    readAlso.append(ul);
    const figure = document.createElement('figure');
    figure.setAttribute('class', 'rt-pullquote');
    const quote = document.createElement('blockquote');
    const q = document.createElement('p');
    q.append('F');
    quote.append(q);
    const caption = document.createElement('figcaption');
    const cite = document.createElement('cite');
    cite.append('Ana');
    caption.append(cite, ', editora');
    figure.append(quote, caption);
    element.append(callout, readAlso, figure);
    const before = element.outerHTML;
    const parser = PMParser.fromSchema(editor.schema);
    const first = parser.parse(element).toJSON();
    expect(element.outerHTML).toBe(before);
    expect(parser.parse(element).toJSON()).toEqual(first);
    expect(element.outerHTML).toBe(before);
    expect(
      (first.content as { type: string }[]).map((node) => node.type),
    ).toEqual(['rtCallout', 'rtReadAlso', 'rtPullquote']);
  });
});

describe('blocos de notícia: comandos', () => {
  it('setCallout usa o rótulo atual sem recriar extensões (lição 4)', () => {
    let lang: 'pt-BR' | 'en' = 'pt-BR';
    const editor = editorWith('<p>A</p><p>B</p>', {
      labels: () => RTE_CONTENT_LABELS[lang],
    });
    cursorIn(editor, 'A', 0);
    expect(editor.commands.setCallout('warning')).toBe(true);
    lang = 'en';
    cursorIn(editor, 'B', 0);
    expect(editor.commands.setCallout('warning')).toBe(true);
    const titles: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'rtCalloutTitle') titles.push(node.textContent);
    });
    expect(titles).toEqual(['Atenção', 'Warning']);
    // o cursor continua no texto
    expect(cursorBlock(editor)).toEqual(['paragraph', 'B', 0]);
    expect(canonical(editor)).toBe(
      '<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title">Atenção</p><p>A</p></aside><aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title">Warning</p><p>B</p></aside>',
    );
  });

  it('setCallout envolve vários blocos selecionados; variante inválida → false', () => {
    const editor = editorWith('<p>A</p><ul><li><p>b</p></li></ul><p>C</p>');
    const doc = editor.state.doc;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(doc, 1, doc.content.size - 1),
      ),
    );
    expect(editor.commands.setCallout('evil' as never)).toBe(false);
    expect(editor.commands.setCallout('info')).toBe(true);
    expect(canonical(editor)).toBe(
      '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">Information</p><p>A</p><ul><li><p>b</p></li></ul><p>C</p></aside>',
    );
  });

  it('setCallout se desfaz com undo e refaz com redo (K3)', () => {
    const editor = editorWith('<p>A</p><p>B</p>');
    const before = canonical(editor);
    cursorIn(editor, 'A', 0);
    expect(editor.commands.setCallout('info')).toBe(true);
    const after = canonical(editor);
    expect(after).not.toBe(before);
    expect(editor.commands.undo()).toBe(true);
    expect(canonical(editor)).toBe(before);
    expect(editor.commands.redo()).toBe(true);
    expect(canonical(editor)).toBe(after);
  });

  it('setCallout dentro de uma caixa devolve false', () => {
    const editor = editorWith(CALLOUT, PT);
    cursorIn(editor, 'Texto', 0);
    expect(editor.commands.setCallout('info')).toBe(false);
  });

  it('setCalloutVariant troca o título padrão e mantém o editado', () => {
    const editor = editorWith(
      `${CALLOUT}<aside class="rt-callout rt-callout--warning"><p class="rt-callout__title">Meu</p><p>Outro</p></aside>`,
      PT,
    );
    cursorIn(editor, 'Texto', 0);
    expect(editor.commands.setCalloutVariant('danger')).toBe(true);
    cursorIn(editor, 'Outro', 0);
    expect(editor.commands.setCalloutVariant('danger')).toBe(true);
    expect(editor.commands.setCalloutVariant('x' as never)).toBe(false);
    expect(canonical(editor)).toBe(
      '<aside class="rt-callout rt-callout--danger" role="note"><p class="rt-callout__title">Perigo</p><p>Texto</p></aside><aside class="rt-callout rt-callout--danger" role="note"><p class="rt-callout__title">Meu</p><p>Outro</p></aside>',
    );
  });

  it('setCalloutVariant fora de uma caixa devolve false', () => {
    const editor = editorWith('<p>A</p>');
    expect(editor.commands.setCalloutVariant('info')).toBe(false);
  });

  it('unsetCallout descarta título igual ao rótulo e transforma outro em parágrafo', () => {
    const a = editorWith(CALLOUT, PT);
    cursorIn(a, 'Texto', 2);
    expect(a.commands.unsetCallout()).toBe(true);
    expect(canonical(a)).toBe('<p>Texto</p>');
    expect(cursorBlock(a)).toEqual(['paragraph', 'Texto', 2]);

    const b = editorWith(
      '<aside class="rt-callout rt-callout--warning"><p class="rt-callout__title">Meu</p><p>Texto</p><ul><li><p>c</p></li></ul></aside>',
      PT,
    );
    cursorIn(b, 'Meu', 1);
    expect(b.commands.unsetCallout()).toBe(true);
    expect(canonical(b)).toBe(
      '<p>Meu</p><p>Texto</p><ul><li><p>c</p></li></ul>',
    );
    expect(cursorBlock(b)).toEqual(['paragraph', 'Meu', 1]);

    // título vazio também é descartado
    const c = editorWith('<aside class="rt-callout"><p>X</p></aside>');
    cursorIn(c, 'X', 0);
    expect(c.commands.unsetCallout()).toBe(true);
    expect(canonical(c)).toBe('<p>X</p>');

    const d = editorWith('<p>A</p>');
    expect(d.commands.unsetCallout()).toBe(false);
  });

  it('insertReadAlso: título + um item vazio com o cursor no item', () => {
    const editor = editorWith('<p>A</p><p></p>', PT);
    const doc = editor.state.doc;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(doc, doc.content.size - 1),
      ),
    );
    expect(editor.commands.insertReadAlso()).toBe(true);
    expect(cursorBlock(editor)).toEqual(['rtReadAlsoItem', '', 0]);
    editor.commands.insertContent('Link');
    // o parágrafo vazio foi substituído (lição 14)
    expect(canonical(editor)).toBe(
      '<p>A</p><aside class="rt-read-also" role="note"><p class="rt-read-also__title">Leia também</p><ul><li>Link</li></ul></aside>',
    );
  });

  it('insertReadAlso com cursor em texto entra depois do bloco', () => {
    const editor = editorWith('<p>A</p>');
    cursorIn(editor, 'A', 1);
    expect(editor.commands.insertReadAlso()).toBe(true);
    expect(cursorBlock(editor)).toEqual(['rtReadAlsoItem', '', 0]);
    expect(canonical(editor)).toBe(
      '<p>A</p><aside class="rt-read-also" role="note"><p class="rt-read-also__title">Read also</p><ul><li></li></ul></aside>',
    );
  });

  it('setPullquote envolve os parágrafos selecionados; unsetPullquote os devolve', () => {
    const editor = editorWith('<p>A</p><p>B</p><p>C</p>');
    const a = 1;
    const b = 5;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, a, b),
      ),
    );
    expect(editor.commands.setPullquote({ author: '  Ana ' })).toBe(true);
    expect(canonical(editor)).toBe(
      '<figure class="rt-pullquote"><blockquote><p>A</p><p>B</p></blockquote><figcaption><cite>Ana</cite></figcaption></figure><p>C</p>',
    );
    // atributo guardado na forma canônica
    expect(editor.state.doc.firstChild?.attrs).toEqual({
      author: 'Ana',
      role: '',
    });
    expect(editor.commands.updatePullquote({ role: 'editora' })).toBe(true);
    expect(editor.commands.updatePullquote({ role: 1 as never })).toBe(false);
    expect(canonical(editor)).toContain(
      '<figcaption><cite>Ana</cite>, editora</figcaption>',
    );
    cursorIn(editor, 'B', 1);
    expect(editor.commands.unsetPullquote()).toBe(true);
    expect(canonical(editor)).toBe('<p>A</p><p>B</p><p>C</p>');
    expect(cursorBlock(editor)).toEqual(['paragraph', 'B', 1]);
    expect(editor.commands.unsetPullquote()).toBe(false);
    expect(editor.commands.updatePullquote({ author: 'X' })).toBe(false);
  });

  it('cargo com vírgula/espaços iniciais é guardado sem eles (ponto fixo)', () => {
    const editor = editorWith(PULLQUOTE);
    cursorIn(editor, 'Frase', 0);
    expect(editor.commands.updatePullquote({ author: '', role: ' , ,x' })).toBe(
      true,
    );
    expect(editor.state.doc.firstChild?.attrs['role']).toBe('x');
    const out = canonical(editor);
    expect(out).toContain('<figcaption>x</figcaption>');
    expect(html(out)).toBe(out);
    // JSON com o cargo cru: a saída já sai canônica e é ponto fixo
    const fromJson = html({
      type: 'doc',
      content: [
        {
          type: 'rtPullquote',
          attrs: { author: 'Ana', role: ',x' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'F' }] },
          ],
        },
      ],
    });
    expect(fromJson).toContain('<figcaption><cite>Ana</cite>, x</figcaption>');
    expect(html(fromJson)).toBe(fromJson);
    // leitura: vírgulas repetidas antes do cargo
    const read = editorWith(
      '<figure class="rt-pullquote"><blockquote><p>F</p></blockquote><figcaption><cite>Ana</cite>, , editora</figcaption></figure>',
    );
    expect(read.state.doc.firstChild?.attrs['role']).toBe('editora');
  });

  it('setPullquote recusa entrada inválida e blocos que não são parágrafos', () => {
    const editor = editorWith('<ul><li><p>a</p></li></ul>');
    expect(editor.commands.setPullquote({ author: 1 as never })).toBe(false);
    editor.commands.selectAll();
    expect(editor.commands.setPullquote({})).toBe(false);
  });
});

describe('blocos de notícia: teclado', () => {
  it('Enter no fim do título da caixa vai para o primeiro bloco', () => {
    const editor = editorWith(CALLOUT, PT);
    cursorIn(editor, 'Atenção', 'Atenção'.length);
    expect(press(editor, 'Enter')).toBe(true);
    expect(cursorBlock(editor)).toEqual(['paragraph', 'Texto', 0]);
    expect(canonical(editor)).toBe(CALLOUT);
  });

  it('Enter no fim do título do Leia também vai para o primeiro item', () => {
    const editor = editorWith(READ_ALSO, PT);
    cursorIn(editor, 'Leia também', 'Leia também'.length);
    expect(press(editor, 'Enter')).toBe(true);
    expect(cursorBlock(editor)).toEqual(['rtReadAlsoItem', 'A', 0]);
  });

  const BOX = (items: string, title = 'Leia também') =>
    `<aside class="rt-read-also" role="note"><p class="rt-read-also__title">${title}</p><ul>${items}</ul></aside>`;

  it('Enter divide o item; Enter no início mantém o item', () => {
    const editor = editorWith(BOX('<li>AB</li>'), PT);
    cursorIn(editor, 'AB', 1);
    expect(press(editor, 'Enter')).toBe(true);
    expect(canonical(editor)).toBe(BOX('<li>A</li><li>B</li>'));
    expect(cursorBlock(editor)).toEqual(['rtReadAlsoItem', 'B', 0]);
  });

  it('Enter em item vazio no fim sai da caixa para um parágrafo depois dela', () => {
    const editor = editorWith(BOX('<li>A</li><li></li>'), PT);
    const box = editor.state.doc.firstChild;
    const end = (box?.nodeSize ?? 0) - 3;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)),
    );
    expect(cursorBlock(editor)).toEqual(['rtReadAlsoItem', '', 0]);
    expect(press(editor, 'Enter')).toBe(true);
    expect(canonical(editor)).toBe(`${BOX('<li>A</li>')}<p></p>`);
    expect(cursorBlock(editor)).toEqual(['paragraph', '', 0]);
  });

  it('Backspace no início do último item: parágrafo depois da caixa', () => {
    const editor = editorWith(BOX('<li>A</li><li>B</li>'), PT);
    cursorIn(editor, 'B', 0);
    expect(press(editor, 'Backspace')).toBe(true);
    expect(canonical(editor)).toBe(`${BOX('<li>A</li>')}<p>B</p>`);
    expect(cursorBlock(editor)).toEqual(['paragraph', 'B', 0]);
  });

  it('Backspace no item do meio divide a caixa (a 2ª com título vazio → rótulo)', () => {
    const editor = editorWith(BOX('<li>A</li><li>B</li><li>C</li>'), PT);
    cursorIn(editor, 'B', 0);
    expect(press(editor, 'Backspace')).toBe(true);
    expect(canonical(editor)).toBe(
      `${BOX('<li>A</li>')}<p>B</p>${BOX('<li>C</li>')}`,
    );
    expect(cursorBlock(editor)).toEqual(['paragraph', 'B', 0]);
  });

  it('Backspace no primeiro item: parágrafo antes, o título fica com o resto', () => {
    const editor = editorWith(BOX('<li>A</li><li>B</li>', 'Meu'), PT);
    cursorIn(editor, 'A', 0);
    expect(press(editor, 'Backspace')).toBe(true);
    expect(canonical(editor)).toBe(`<p>A</p>${BOX('<li>B</li>', 'Meu')}`);
    expect(cursorBlock(editor)).toEqual(['paragraph', 'A', 0]);
  });

  it('Backspace no único item: a caixa some; título padrão descartado, outro vira parágrafo', () => {
    const a = editorWith(BOX('<li>A</li>'), PT);
    cursorIn(a, 'A', 0);
    expect(press(a, 'Backspace')).toBe(true);
    expect(canonical(a)).toBe('<p>A</p>');
    expect(cursorBlock(a)).toEqual(['paragraph', 'A', 0]);

    const b = editorWith(BOX('<li>A</li>', 'Meu'), PT);
    cursorIn(b, 'A', 0);
    expect(press(b, 'Backspace')).toBe(true);
    expect(canonical(b)).toBe('<p>Meu</p><p>A</p>');
    expect(cursorBlock(b)).toEqual(['paragraph', 'A', 0]);
  });

  it('sem splitContainer, itemsToParagraphs não divide o contêiner', () => {
    const editor = editorWith(BOX('<li>A</li><li>B</li>'), PT);
    cursorIn(editor, 'B', 0);
    const { $from } = editor.state.selection;
    const depth = $from.depth - 1;
    const index = $from.index(depth);
    const tr = editor.state.tr;
    expect(itemsToParagraphs(tr, $from, depth, index, index)).toBeNull();
    expect(tr.docChanged).toBe(false);
    expect(
      itemsToParagraphs(tr, $from, depth, index, index, {
        splitContainer: true,
      }),
    ).not.toBeNull();
  });

  it('Enter no único item vazio: a caixa vira um parágrafo vazio', () => {
    const editor = editorWith('<p>X</p>', PT);
    cursorIn(editor, 'X', 1);
    editor.commands.insertReadAlso();
    expect(press(editor, 'Enter')).toBe(true);
    expect(canonical(editor)).toBe('<p>X</p><p></p>');
    expect(cursorBlock(editor)).toEqual(['paragraph', '', 0]);
  });
});

describe('blocos de notícia: recurso desligado', () => {
  it('newsBlocks: false → sem nós rt* desta tarefa e sem comandos', () => {
    const names = createEditorExtensions({
      features: { ...ONLY_NEWS, newsBlocks: false },
    }).map((e) => e.name);
    for (const name of [
      'rtPullquote',
      'rtCallout',
      'rtCalloutTitle',
      'rtReadAlso',
      'rtReadAlsoTitle',
      'rtReadAlsoList',
      'rtReadAlsoItem',
      'rtLang',
    ]) {
      expect(names).not.toContain(name);
    }
    const editor = editorWith('<p>A</p>', {
      features: { ...ONLY_NEWS, newsBlocks: false },
    });
    expect(
      (editor.commands as Record<string, unknown>)['setCallout'],
    ).toBeUndefined();
    expect(
      html(CALLOUT, { features: { ...ONLY_NEWS, newsBlocks: false } }),
    ).toBe('<p>Atenção</p><p>Texto</p>');
  });
});
