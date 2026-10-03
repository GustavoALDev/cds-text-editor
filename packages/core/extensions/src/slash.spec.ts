// @vitest-environment jsdom
// Menu `/` (spec 03c, C13, C14, C18): gatilho só por digitação, consulta,
// regras de fechamento, disponibilidade por `editor.can()`, estado puro,
// execução (C15) e teclado (C16).
// Reproduzir uma falha da propriedade: `FC_SEED=<n> npx vitest run
// extensions/src/slash.spec.ts`; `FC_RUNS` muda o número de execuções.
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { getSlashMenuState, SLASH_QUERY_MAX, slashKey } from './slash';
import type { RteSlashMenuState } from './slash';
import { RTE_SLASH_ITEMS } from './slash-items';
import { getRteHtml } from './serialize';
import { validDoc } from './testing/doc-arbitraries';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import { pressKey } from './testing/press-key';
import { typeText } from './testing/type-text';
import type { RteEditorOptions } from './types';

const SEED = Number(process.env['FC_SEED'] ?? 20261003);
const RUNS = Number(process.env['FC_RUNS'] ?? 200);

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
    ['depois de NBSP', '\u00A0'],
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

/** Índice do item `id` entre os visíveis do menu aberto (`-1` se ausente). */
const indexOf = (editor: Editor, id: string): number => ids(editor).indexOf(id);

const canonical = (editor: Editor) =>
  validateHtml(getRteHtml(editor), editor.storage.rtContent.schema, {
    mode: 'canonical',
  });

/** Embutidos com comando (o `paragraph` nunca aparece: o menu só abre em `p`). */
const WITH_COMMAND = RTE_SLASH_ITEMS.filter((i) => i.command).map((i) => i.id);

describe('execução (C15)', () => {
  it('"/tab" + Enter: só a tabela 3×3 com cabeçalho; um undo volta a "/tab"', () => {
    const editor = make();
    typeText(editor, '/tab');
    expect(pressKey(editor, 'Enter')).toBe(true);
    const { doc } = editor.state;
    expect(doc.childCount).toBe(1);
    const table = doc.firstChild;
    expect(table?.type.name).toBe('table');
    expect(table?.childCount).toBe(3);
    table?.forEach((row, _offset, r) => {
      expect(row.childCount).toBe(3);
      row.forEach((cell) => {
        expect(cell.type.name).toBe(r === 0 ? 'tableHeader' : 'tableCell');
      });
    });
    expect(menu(editor).open).toBe(false);
    expect(canonical(editor)).toEqual([]);
    // A digitação veio há menos de 500 ms: sem `closeHistory`, fundiria.
    expect(editor.commands.undo()).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>/tab</p>');
  });

  it('"abc /heading" + Enter: título 2 com "abc "; um undo volta ao texto', () => {
    const editor = make('<p>abc</p>');
    cursorAfter(editor, 'abc');
    typeText(editor, ' /heading');
    expect(pressKey(editor, 'Enter')).toBe(true);
    const block = editor.state.doc.firstChild;
    expect(block?.type.name).toBe('heading');
    expect(block?.attrs['level']).toBe(2);
    expect(block?.textContent).toBe('abc ');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(editor.state.doc.textContent).toBe('abc /heading');
  });

  it('item de UI: apaga "/ima", fecha e chama onUiItem uma vez depois do estado', () => {
    const seen: string[] = [];
    const onUiItem = vi.fn((_id: string, ed: Editor) => {
      seen.push(ed.state.doc.textContent);
      expect(getSlashMenuState(ed).open).toBe(false);
    });
    const editor = make('<p></p>', { slash: { onUiItem } });
    typeText(editor, '/ima');
    expect(ids(editor)[0]).toBe('image');
    expect(pressKey(editor, 'Enter')).toBe(true);
    expect(editor.state.doc.textContent).toBe('');
    expect(menu(editor).open).toBe(false);
    expect(onUiItem).toHaveBeenCalledTimes(1);
    expect(onUiItem).toHaveBeenCalledWith('image', editor);
    expect(seen).toEqual(['']);
    // Transações seguintes não repetem a chamada.
    typeText(editor, 'a');
    editor.commands.setTextSelection(1);
    expect(onUiItem).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['só de meta', false],
    ['que muda o documento', true],
  ])(
    'onUiItem chamado uma vez com appendTransaction %s em toda transação',
    (_name, changesDoc) => {
      const onUiItem = vi.fn();
      const editor = make('<p></p>', { slash: { onUiItem } });
      const key = new PluginKey('appendAlways');
      editor.registerPlugin(
        new Plugin({
          key,
          appendTransaction(trs, _old, state) {
            if (trs.some((t) => t.getMeta(key))) return null;
            const tr = state.tr.setMeta(key, true);
            // Passo de documento sem efeito visível (AttrStep no 1º bloco).
            if (changesDoc) tr.setNodeAttribute(0, 'textAlign', null);
            return tr;
          },
        }),
      );
      typeText(editor, '/ima');
      expect(pressKey(editor, 'Enter')).toBe(true);
      expect(onUiItem).toHaveBeenCalledTimes(1);
      expect(onUiItem).toHaveBeenCalledWith('image', editor);
      expect(menu(editor).open).toBe(false);
      typeText(editor, 'a');
      expect(onUiItem).toHaveBeenCalledTimes(1);
    },
  );

  it('onUiItem que lança não interrompe a entrada', () => {
    const editor = make('<p></p>', {
      slash: {
        onUiItem: () => {
          throw new Error('x');
        },
      },
    });
    typeText(editor, '/ima');
    expect(pressKey(editor, 'Enter')).toBe(true);
    expect(getRteHtml(editor)).toBe('<p></p>');
    expect(menu(editor).open).toBe(false);
  });

  it('item de UI sem onUiItem: só apaga e fecha', () => {
    const editor = make();
    typeText(editor, '/ima');
    expect(editor.commands.runSlashItem()).toBe(true);
    expect(getRteHtml(editor)).toBe('<p></p>');
    expect(menu(editor).open).toBe(false);
  });

  it('item do consumidor com comando', () => {
    const editor = make('<p></p>', {
      slash: {
        items: (defaults) => [
          ...defaults,
          { id: 'x', title: 'X', command: (c) => c.insertContent('X') },
        ],
      },
    });
    typeText(editor, '/x');
    const index = indexOf(editor, 'x');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(editor.commands.runSlashItem(index)).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>X</p>');
  });

  it('runSlashItem fora da faixa ou com o menu fechado; índices inválidos', () => {
    const editor = make();
    expect(editor.commands.runSlashItem()).toBe(false);
    expect(editor.commands.runSlashItem(0)).toBe(false);
    typeText(editor, '/ta');
    expect(editor.commands.runSlashItem(99)).toBe(false);
    expect(editor.commands.runSlashItem(-1)).toBe(false);
    expect(editor.commands.runSlashItem(0.5)).toBe(false);
    expect(editor.commands.setSlashActiveIndex(-1)).toBe(false);
    expect(editor.commands.setSlashActiveIndex(1.5)).toBe(false);
    expect(getRteHtml(editor)).toBe('<p>/ta</p>');
    expect(menu(editor).open).toBe(true);
    typeText(editor, 'zzz');
    expect(editor.commands.runSlashItem()).toBe(false);
    expect(getRteHtml(editor)).toBe('<p>/tazzz</p>');
  });

  it('runSlashItem lê o estado da cadeia (seleção movida antes do "/")', () => {
    const editor = make();
    typeText(editor, '/tab');
    expect(editor.chain().setTextSelection(1).runSlashItem().run()).toBe(false);
    expect(editor.state.doc.textContent).toBe('/tab');
  });

  it('can().runSlashItem() não muda nada', () => {
    const editor = make();
    typeText(editor, '/tab');
    expect(editor.can().runSlashItem()).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>/tab</p>');
    expect(menu(editor).open).toBe(true);
  });

  it('dentro de uma lista: a do mesmo tipo some; a outra troca o tipo', () => {
    const editor = make('<ol><li><p>x</p></li></ol>');
    cursorAfter(editor, 'x');
    typeText(editor, ' /');
    expect(ids(editor)).not.toContain('orderedList');
    expect(editor.commands.runSlashItem(indexOf(editor, 'bulletList'))).toBe(
      true,
    );
    expect(getRteHtml(editor)).toBe('<ul><li><p>x </p></li></ul>');
  });

  it('paragraph: indisponível num parágrafo (o menu só abre em parágrafo)', () => {
    const editor = make();
    typeText(editor, '/');
    expect(ids(editor)).not.toContain('paragraph');
  });

  const firstChildType: Record<string, string> = {
    table: 'table',
    horizontalRule: 'horizontalRule',
    readAlso: 'rtReadAlso',
    callout: 'rtCallout',
    pullquote: 'rtPullquote',
  };

  it.each(WITH_COMMAND.filter((id) => id !== 'paragraph'))(
    '%s num parágrafo vazio único: documento válido',
    (id) => {
      const editor = make();
      typeText(editor, '/');
      const index = indexOf(editor, id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(editor.commands.runSlashItem(index)).toBe(true);
      const { doc } = editor.state;
      expect(() => doc.check()).not.toThrow();
      expect(canonical(editor)).toEqual([]);
      expect(doc.textContent).not.toContain('/');
      const expected = firstChildType[id];
      if (expected !== undefined) {
        expect(doc.firstChild?.type.name).toBe(expected);
      }
    },
  );
});

describe('teclado (C16)', () => {
  it('ArrowDown/ArrowUp circulares', () => {
    const editor = make();
    typeText(editor, '/ta');
    expect(ids(editor)).toEqual(['taskList', 'table']);
    expect(pressKey(editor, 'ArrowDown')).toBe(true);
    expect(menu(editor).activeIndex).toBe(1);
    expect(pressKey(editor, 'ArrowDown')).toBe(true);
    expect(menu(editor).activeIndex).toBe(0);
    expect(pressKey(editor, 'ArrowUp')).toBe(true);
    expect(menu(editor).activeIndex).toBe(1);
    expect(pressKey(editor, 'ArrowUp')).toBe(true);
    expect(menu(editor).activeIndex).toBe(0);
  });

  it('sem itens: setas e Enter seguem o padrão (Enter divide), Escape fecha', () => {
    const editor = make();
    typeText(editor, '/zzz');
    expect(menu(editor).items).toEqual([]);
    expect(pressKey(editor, 'ArrowDown')).toBe(false);
    expect(pressKey(editor, 'ArrowUp')).toBe(false);
    editor.commands.keyboardShortcut('Enter');
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.firstChild?.textContent).toBe('/zzz');

    const other = make();
    typeText(other, '/zzz');
    expect(pressKey(other, 'Escape')).toBe(true);
    expect(menu(other).open).toBe(false);
  });

  // Com itens, a tecla vai por `pressKey`: o `keyboardShortcut` do Tiptap
  // remapeia cada passo capturado pelo mapeamento já acumulado e perde o
  // segundo passo de uma transação de vários (aqui, `deleteRange` + o item).
  it('com itens: Enter executa sem dividir', () => {
    const editor = make();
    typeText(editor, '/heading');
    expect(pressKey(editor, 'Enter')).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.type.name).toBe('heading');
  });

  it('Escape fecha; Tab nunca é capturado; menu fechado: teclas livres', () => {
    const editor = make();
    typeText(editor, '/ta');
    expect(pressKey(editor, 'Tab')).toBe(false);
    expect(pressKey(editor, 'Tab', true)).toBe(false);
    expect(menu(editor).open).toBe(true);
    expect(pressKey(editor, 'Escape')).toBe(true);
    expect(menu(editor).open).toBe(false);
    expect(pressKey(editor, 'Escape')).toBe(false);
    expect(pressKey(editor, 'ArrowDown')).toBe(false);
    expect(getRteHtml(editor)).toBe('<p>/ta</p>');
  });

  it('não editável: nada é capturado', () => {
    const editor = make();
    typeText(editor, '/ta');
    editor.setEditable(false);
    expect(pressKey(editor, 'ArrowDown')).toBe(false);
    expect(pressKey(editor, 'Escape')).toBe(false);
    expect(editor.commands.runSlashItem()).toBe(false);
  });

  it('prioridade 1000: em item de lista, Enter insere a tabela em vez de dividir o item', () => {
    const editor = make('<ul><li><p>x</p></li></ul>');
    cursorAfter(editor, 'x');
    typeText(editor, ' /tab');
    expect(ids(editor)).toEqual(['table']);
    expect(pressKey(editor, 'Enter')).toBe(true);
    const items: string[] = [];
    let tables = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'listItem') items.push(node.textContent);
      if (node.type.name === 'table') tables += 1;
      return true;
    });
    expect(tables).toBe(1);
    expect(items).toHaveLength(1);
    expect(editor.state.doc.textContent).not.toContain('/tab');
    // Com prioridade empatada, o Tiptap dá precedência a quem foi registrado
    // depois; o valor explícito não depende da ordem de registro.
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === 'rtSlashCommand',
    );
    expect(ext?.config.priority).toBe(1000);
  });
});

describe('propriedade (§6.2)', () => {
  // Tempo por teste: FC_RUNS alto em execuções locais.
  it(
    'item com comando num parágrafo de documento válido: documento e HTML válidos',
    { timeout: 300_000 },
    () => {
      const editor = createTestEditor({}, '<p></p>');
      const S = editor.storage.rtContent.schema;
      fc.assert(
        fc.property(
          validDoc,
          fc.constantFrom(...WITH_COMMAND),
          fc.nat(),
          (json, id, pick) => {
            editor.commands.setContent(json);
            const ends: number[] = [];
            editor.state.doc.descendants((node, pos) => {
              if (node.type.name === 'paragraph') {
                ends.push(pos + node.nodeSize - 1);
              }
              return true;
            });
            fc.pre(ends.length > 0);
            editor.commands.setTextSelection(
              ends[pick % ends.length] as number,
            );
            typeText(editor, ' /');
            const index = indexOf(editor, id);
            if (index >= 0) {
              expect(editor.commands.runSlashItem(index)).toBe(true);
              expect(menu(editor).open).toBe(false);
            }
            expect(() => editor.state.doc.check()).not.toThrow();
            expect(
              validateHtml(getRteHtml(editor), S, { mode: 'canonical' }),
            ).toEqual([]);
          },
        ),
        { seed: SEED, numRuns: RUNS },
      );
    },
  );
});
