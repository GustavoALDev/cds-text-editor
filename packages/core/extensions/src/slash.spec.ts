// @vitest-environment jsdom
// Menu `/` (spec 03c, C13, C14, C18): gatilho só por digitação, consulta,
// regras de fechamento, disponibilidade por `editor.can()` e estado puro.
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { getSlashMenuState, SLASH_QUERY_MAX, slashKey } from './slash';
import type { RteSlashMenuState } from './slash';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import { pressKey } from './testing/press-key';
import { typeText } from './testing/type-text';
import type { RteEditorOptions } from './types';

afterEach(() => {
  destroyTestEditors();
});

const menu = (editor: Editor): RteSlashMenuState => getSlashMenuState(editor);
const ids = (editor: Editor) => menu(editor).items.map((i) => i.id);
const queryEls = (editor: Editor) =>
  editor.view.dom.querySelectorAll('.rte-slash-query');

/** Apaga o caractere antes do cursor (o `Backspace` nativo no meio do texto). */
function backspace(editor: Editor): void {
  const { state } = editor;
  const head = state.selection.head;
  editor.view.dispatch(state.tr.delete(head - 1, head));
}

/** Põe o cursor logo depois da primeira ocorrência de `needle`. */
function cursorAfter(editor: Editor, needle: string): void {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isText) {
      const i = (node.text ?? '').indexOf(needle);
      if (i !== -1) found = pos + i + needle.length;
    }
    return true;
  });
  if (found === -1) throw new Error(`sem "${needle}"`);
  editor.commands.setTextSelection(found);
}

function make(html = '<p></p>', options: RteEditorOptions = {}): Editor {
  const editor = createTestEditor(options, html);
  editor.commands.setTextSelection(1);
  return editor;
}

describe('abertura (C13)', () => {
  it('"/" digitado em parágrafo vazio abre com consulta vazia', () => {
    const editor = make();
    typeText(editor, '/');
    const s = menu(editor);
    expect(s.open).toBe(true);
    expect(s.query).toBe('');
    expect(s.range).toEqual({ from: 1, to: 2 });
    expect(s.activeIndex).toBe(0);
    expect(s.items.length).toBeGreaterThan(0);
    const els = queryEls(editor);
    expect(els).toHaveLength(1);
    expect(els[0]?.textContent).toBe('/');
  });

  it.each([
    ['depois de espaço', ' '],
    ['depois de NBSP', ' '],
  ])('abre %s', (_name, space) => {
    const editor = make('<p>abc</p>');
    cursorAfter(editor, 'abc');
    typeText(editor, space + '/');
    expect(editor.state.doc.textContent).toBe(`abc${space}/`);
    expect(menu(editor).open).toBe(true);
  });

  it.each([
    ['item de lista', '<ul><li><p>x</p></li></ul>'],
    ['citação', '<blockquote><p>x</p></blockquote>'],
    [
      'corpo de caixa',
      '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">T</p><p>x</p></aside>',
    ],
    ['célula', '<table><tbody><tr><td><p>x</p></td></tr></tbody></table>'],
  ])('abre em parágrafo dentro de %s', (_name, html) => {
    const editor = make(html);
    cursorAfter(editor, 'x');
    typeText(editor, ' /');
    expect(menu(editor).open).toBe(true);
  });
});

describe('não abre (C13)', () => {
  it('depois de letra', () => {
    const editor = make('<p>abc</p>');
    cursorAfter(editor, 'abc');
    typeText(editor, '/');
    expect(menu(editor).open).toBe(false);
    expect(queryEls(editor)).toHaveLength(0);
  });

  it('depois de <br>', () => {
    const editor = make('<p>a<br>b</p>');
    editor.commands.setTextSelection(3);
    typeText(editor, '/');
    expect(editor.state.doc.textContent).toBe('a/b');
    expect(menu(editor).open).toBe(false);
  });

  it.each([
    ['heading', '<h2>x</h2>'],
    ['codeBlock', '<pre><code>x</code></pre>'],
    [
      'rtTaskItem',
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">x</label></li></ul>',
    ],
    [
      'título de caixa',
      '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">x</p><p>c</p></aside>',
    ],
    [
      'item de "Leia também"',
      '<aside class="rt-read-also" role="note"><p class="rt-read-also__title">T</p><ul><li><a href="https://example.com/a">x</a></li></ul></aside>',
    ],
  ])('em %s', (_name, html) => {
    const editor = make(html);
    cursorAfter(editor, 'x');
    typeText(editor, ' /');
    expect(editor.state.doc.textContent).toContain('x /');
    expect(menu(editor).open).toBe(false);
  });

  it('com a marca code armazenada', () => {
    const editor = make();
    editor.commands.toggleCode();
    typeText(editor, '/');
    expect(editor.state.doc.textContent).toBe('/');
    expect(menu(editor).open).toBe(false);
  });

  it('por transação programática, conteúdo ou colagem', () => {
    const editor = make();
    editor.view.dispatch(editor.state.tr.insertText('/'));
    expect(menu(editor).open).toBe(false);
    editor.commands.setContent('<p></p>');
    editor.commands.insertContent('/');
    expect(menu(editor).open).toBe(false);
    editor.commands.setContent('<p>/</p>');
    editor.commands.setTextSelection(2);
    expect(menu(editor).open).toBe(false);
    editor.commands.setContent('<p></p>');
    editor.commands.setTextSelection(1);
    editor.view.pasteText('/', new Event('paste') as ClipboardEvent);
    expect(editor.state.doc.textContent).toBe('/');
    expect(menu(editor).open).toBe(false);
  });

  it('handleTextInput sem despacho seguido de outra transação', () => {
    const editor = make();
    const { view } = editor;
    const deflt = () => view.state.tr.insertText('/', 1, 1);
    view.someProp('handleTextInput', (f) => f(view, 1, 1, '/', deflt));
    // Outra transação (só seleção) zera o pendente.
    view.dispatch(view.state.tr.setMeta('x', true));
    view.dispatch(view.state.tr.insertText('/', 1, 1));
    expect(editor.state.doc.textContent).toBe('/');
    expect(menu(editor).open).toBe(false);
  });

  it('cursor movido para depois de um "/x" existente', () => {
    const editor = make('<p>/tab</p>');
    editor.commands.setTextSelection(4);
    expect(menu(editor).open).toBe(false);
    expect(queryEls(editor)).toHaveLength(0);
  });
});

describe('consulta', () => {
  it('filtra pelos itens e volta o ativo a 0 quando muda', () => {
    const editor = make();
    typeText(editor, '/ta');
    const s = menu(editor);
    expect(s.query).toBe('ta');
    expect(s.range).toEqual({ from: 1, to: 4 });
    expect(s.items.map((i) => i.id)).toEqual(['taskList', 'table']);
    expect(s.items[1]).toEqual({
      id: 'table',
      title: 'Table',
      group: 'blocks',
    });
    expect(queryEls(editor)[0]?.textContent).toBe('/ta');
    expect(editor.commands.setSlashActiveIndex(1)).toBe(true);
    expect(menu(editor).activeIndex).toBe(1);
    typeText(editor, 'b');
    expect(menu(editor).query).toBe('tab');
    expect(menu(editor).activeIndex).toBe(0);
  });

  it('setSlashActiveIndex fora da faixa ou com o menu fechado devolve false', () => {
    const editor = make();
    expect(editor.commands.setSlashActiveIndex(0)).toBe(false);
    typeText(editor, '/ta');
    expect(editor.commands.setSlashActiveIndex(2)).toBe(false);
    expect(editor.commands.setSlashActiveIndex(-1)).toBe(false);
    expect(editor.commands.setSlashActiveIndex(0.5)).toBe(false);
    expect(menu(editor).activeIndex).toBe(0);
  });

  it('sem itens: activeIndex -1', () => {
    const editor = make();
    typeText(editor, '/zzz');
    const s = menu(editor);
    expect(s.open).toBe(true);
    expect(s.items).toEqual([]);
    expect(s.activeIndex).toBe(-1);
  });
});

describe('fechamento (C13)', () => {
  it('espaço na consulta', () => {
    const editor = make();
    typeText(editor, '/ta ');
    expect(menu(editor).open).toBe(false);
    expect(queryEls(editor)).toHaveLength(0);
  });

  it(`consulta acima de ${SLASH_QUERY_MAX} caracteres`, () => {
    expect(SLASH_QUERY_MAX).toBe(30);
    const editor = make();
    typeText(editor, '/' + 'é'.repeat(29) + '😀');
    expect(menu(editor).open).toBe(true);
    expect([...menu(editor).query]).toHaveLength(30);
    typeText(editor, 'a');
    expect(menu(editor).open).toBe(false);
  });

  it('cursor antes do "/" ou em outro bloco', () => {
    const editor = make('<p></p><p>outro</p>');
    typeText(editor, '/ta');
    editor.commands.setTextSelection(2);
    expect(menu(editor).open).toBe(true);
    editor.commands.setTextSelection(1);
    expect(menu(editor).open).toBe(false);

    const other = make('<p></p><p>outro</p>');
    typeText(other, '/ta');
    cursorAfter(other, 'out');
    expect(menu(other).open).toBe(false);
  });

  it('seleção não vazia', () => {
    const editor = make();
    typeText(editor, '/ta');
    editor.commands.setTextSelection({ from: 2, to: 4 });
    expect(menu(editor).open).toBe(false);
  });

  it('"/" apagado com Backspace', () => {
    const editor = make();
    typeText(editor, '/t');
    // No meio do texto o keymap deixa o Backspace para o navegador.
    expect(pressKey(editor, 'Backspace')).toBe(false);
    backspace(editor);
    expect(menu(editor).open).toBe(true);
    expect(menu(editor).query).toBe('');
    backspace(editor);
    expect(editor.state.doc.textContent).toBe('');
    expect(menu(editor).open).toBe(false);
  });

  it('closeSlashMenu: o mesmo "/" não reabre', () => {
    const editor = make();
    expect(editor.commands.closeSlashMenu()).toBe(false);
    typeText(editor, '/');
    expect(editor.commands.closeSlashMenu()).toBe(true);
    expect(menu(editor).open).toBe(false);
    typeText(editor, 'b');
    expect(menu(editor).open).toBe(false);
    expect(queryEls(editor)).toHaveLength(0);
  });

  it('editor deixa de ser editável e não reabre ao voltar', () => {
    const editor = make();
    typeText(editor, '/');
    editor.setEditable(false);
    expect(menu(editor).open).toBe(false);
    expect(slashKey.getState(editor.state)?.open).toBe(false);
    editor.setEditable(true);
    expect(menu(editor).open).toBe(false);
  });

  it('setContent com o menu aberto fecha', () => {
    const editor = make();
    typeText(editor, '/');
    editor.commands.setContent('<p>x</p>');
    expect(menu(editor).open).toBe(false);
    editor.commands.setContent('<p>/</p>');
    editor.commands.setTextSelection(2);
    expect(menu(editor).open).toBe(false);
  });
});

describe('disponibilidade (C14)', () => {
  it('"/" em parágrafo de célula: sem table', () => {
    const editor = make(
      '<table><tbody><tr><td><p>x</p></td></tr></tbody></table>',
    );
    cursorAfter(editor, 'x');
    typeText(editor, ' /');
    expect(menu(editor).open).toBe(true);
    expect(ids(editor)).not.toContain('table');
    expect(ids(editor)).toContain('heading2');
  });

  it('fora da tabela: com table', () => {
    const editor = make();
    typeText(editor, '/');
    expect(ids(editor)).toContain('table');
  });

  it('features.media false: sem image nem video', () => {
    const editor = make('<p></p>', { features: { media: false } });
    typeText(editor, '/');
    expect(ids(editor)).not.toContain('image');
    expect(ids(editor)).not.toContain('video');
    expect(ids(editor)).toContain('embed');
  });

  it('comando que lança ou devolve false fica indisponível; sem comando, sempre', () => {
    const editor = make('<p></p>', {
      slash: {
        items: [
          { id: 'ok', command: (c) => c },
          { id: 'no', command: (c) => c.command(() => false) },
          {
            id: 'boom',
            command: () => {
              throw new Error('x');
            },
          },
          { id: 'ui' },
        ],
      },
    });
    typeText(editor, '/');
    expect(ids(editor)).toEqual(['ok', 'ui']);
    expect(menu(editor).items[0]).toEqual({ id: 'ok', title: 'ok' });
  });

  it('rótulos por função lidos a cada uso', () => {
    let lang: 'pt' | 'en' = 'en';
    const editor = make('<p></p>', {
      slash: {
        labels: () =>
          lang === 'pt' ? { table: { title: 'Tabela', keywords: [] } } : {},
      },
    });
    typeText(editor, '/tabela');
    expect(ids(editor)).toEqual([]);
    lang = 'pt';
    typeText(editor, 'x');
    backspace(editor);
    expect(ids(editor)).toEqual(['table']);
  });
});

describe('estado (C18)', () => {
  it('mesmo EditorState, mesmo objeto congelado', () => {
    const editor = make();
    const closed = menu(editor);
    expect(Object.isFrozen(closed)).toBe(true);
    expect(closed).toEqual({
      open: false,
      query: '',
      range: null,
      items: [],
      activeIndex: -1,
    });
    typeText(editor, '/');
    const a = menu(editor);
    expect(menu(editor)).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.items)).toBe(true);
    expect(Object.isFrozen(a.range)).toBe(true);
  });

  it('transações do menu: addToHistory false e sem mudar o documento', () => {
    const editor = make();
    typeText(editor, '/ta');
    const seen: Transaction[] = [];
    editor.on('transaction', ({ transaction }) => {
      seen.push(transaction);
    });
    editor.commands.setSlashActiveIndex(1);
    editor.commands.closeSlashMenu();
    expect(seen).toHaveLength(2);
    for (const tr of seen) {
      expect(tr.getMeta('addToHistory')).toBe(false);
      expect(tr.docChanged).toBe(false);
    }
  });

  it('features.slashCommands false: fechado e sem comandos', () => {
    const editor = make('<p></p>', { features: { slashCommands: false } });
    typeText(editor, '/');
    expect(menu(editor).open).toBe(false);
    expect(slashKey.getState(editor.state)).toBeUndefined();
    const commands = editor.commands as unknown as Record<string, unknown>;
    expect(commands['setSlashActiveIndex']).toBeUndefined();
    expect(commands['closeSlashMenu']).toBeUndefined();
  });

  it('editor não editável: fechado', () => {
    const editor = make();
    editor.setEditable(false);
    typeText(editor, '/');
    expect(menu(editor).open).toBe(false);
  });
});
