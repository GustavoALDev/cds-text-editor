import {
  ChangeDetectionStrategy,
  Component,
  effect,
  signal,
  type Signal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteToolbarConfig } from '@cds/rte-angular';
import { getRteEditor } from '@cds/rte-angular/testing';
import type { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { createRteBridge } from './editor/bridge';
import type {
  RteFloatingMenuKind,
  RteFloatingMenusConfig,
} from './floating/types';
import {
  createTestEditor,
  destroyTestEditors,
  selectText,
} from './testing-support/editors';
import { RTE_TOOLBAR_ITEMS, type RteToolbarItemId } from './toolbar/items';
import {
  createToolbarState,
  readItemState,
  RTE_MIXED,
  sameItemState,
  toolbarStateProbe,
  type RteItemState,
  type RteToolbarState,
} from './toolbar/state';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import { installPopoverShim, isPopoverOpen } from './testing-support/popover';
import { renderHost, settle } from './testing-support/render';
import { readTableMenuState } from './toolbar/table-guard';

afterEach(() => {
  destroyTestEditors();
  vi.restoreAllMocks();
});
beforeEach(() => {
  toolbarStateProbe.computations = 0;
});

const ALL_IDS = Object.keys(RTE_TOOLBAR_ITEMS) as RteToolbarItemId[];

function stateOf(
  doc: string,
  select: [string, number?, number?],
  id: RteToolbarItemId,
): RteItemState {
  const editor = createTestEditor(doc);
  selectText(editor, ...select);
  return readItemState(editor, id);
}

describe('readItemState (§4)', () => {
  it('cursor em negrito → bold ativo', () => {
    expect(stateOf('<p>a<strong>bc</strong></p>', ['bc', 1], 'bold')).toEqual({
      active: true,
      enabled: true,
      value: null,
    });
    expect(stateOf('<p>abc</p>', ['bc', 1], 'bold').active).toBe(false);
  });

  it.each([
    ['italic', '<p><em>ab</em></p>'],
    ['underline', '<p><u>ab</u></p>'],
    ['strike', '<p><s>ab</s></p>'],
    ['code', '<p><code>ab</code></p>'],
    ['superscript', '<p><sup>ab</sup></p>'],
    ['subscript', '<p><sub>ab</sub></p>'],
    ['bulletList', '<ul><li><p>ab</p></li></ul>'],
    ['orderedList', '<ol><li><p>ab</p></li></ol>'],
    [
      'taskList',
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">ab</label></li></ul>',
    ],
    ['blockquote', '<blockquote><p>ab</p></blockquote>'],
    ['codeBlock', '<pre><code>ab</code></pre>'],
    [
      'pullquote',
      '<figure class="rt-pullquote"><blockquote><p>ab</p></blockquote></figure>',
    ],
  ] as const)('%s ativo dentro do próprio contexto', (id, doc) => {
    const state = stateOf(doc, ['ab', 1], id);
    expect(state.active).toBe(true);
    expect(stateOf('<p>ab</p>', ['ab', 1], id).active).toBe(false);
  });

  it.each([
    ['<p>ab</p>', 'paragraph'],
    ['<h2>ab</h2>', 'heading2'],
    ['<h3>ab</h3>', 'heading3'],
    ['<h4>ab</h4>', 'heading4'],
    ['<pre><code>ab</code></pre>', null],
  ] as const)('blockType em %s → %s', (doc, value) => {
    const state = stateOf(doc, ['ab', 1], 'blockType');
    expect(state.value).toBe(value);
    expect(state.enabled).toBe(true);
  });

  it('blockType de seleção sobre parágrafo e título → null', () => {
    const editor = createTestEditor('<p>ab</p><h2>cd</h2>');
    editor.commands.setTextSelection({ from: 2, to: 7 });
    expect(readItemState(editor, 'blockType').value).toBe(null);
  });

  it('textColor/highlight: nome da paleta, null sem cor, sentinela na seleção mista', () => {
    const doc =
      '<p><span data-rt-color="red">ab</span><span data-rt-color="blue">cd</span>ef<mark data-rt-color="green">gh</mark></p>';
    const editor = createTestEditor(doc);
    selectText(editor, 'ab', 1);
    expect(readItemState(editor, 'textColor')).toEqual({
      active: true,
      enabled: true,
      value: 'red',
    });
    selectText(editor, 'ab');
    expect(readItemState(editor, 'textColor').value).toBe('red');
    // duas cores: nenhum item casa, o botão fica ativo (K5)
    selectText(editor, 'abcd');
    expect(readItemState(editor, 'textColor')).toEqual({
      active: true,
      enabled: true,
      value: RTE_MIXED,
    });
    // cor e texto sem cor: também mista ("Cor padrão" não fica marcada)
    selectText(editor, 'cdef');
    expect(readItemState(editor, 'textColor').value).toBe(RTE_MIXED);
    // texto todo sem cor
    selectText(editor, 'ef');
    expect(readItemState(editor, 'textColor').value).toBe(null);
    selectText(editor, 'ef', 1);
    expect(readItemState(editor, 'textColor')).toEqual({
      active: false,
      enabled: true,
      value: null,
    });
    selectText(editor, 'gh', 1);
    expect(readItemState(editor, 'highlight').value).toBe('green');
    expect(readItemState(editor, 'textColor').value).toBe(null);
  });

  it.each([
    ['<p>ab</p>', null],
    ['<p style="text-align: left">ab</p>', 'left'],
    ['<p style="text-align: center">ab</p>', 'center'],
    ['<h3 style="text-align: right">ab</h3>', 'right'],
    ['<p style="text-align: justify">ab</p>', 'justify'],
  ] as const)('align em %s → %s', (doc, value) => {
    expect(stateOf(doc, ['ab', 1], 'align').value).toBe(value);
  });

  it('codeLanguage: id, plain sem linguagem, null e desabilitado fora', () => {
    expect(
      stateOf(
        '<pre><code class="language-javascript">ab</code></pre>',
        ['ab', 1],
        'codeLanguage',
      ),
    ).toEqual({ active: true, enabled: true, value: 'javascript' });
    expect(
      stateOf('<pre><code>ab</code></pre>', ['ab', 1], 'codeLanguage'),
    ).toEqual({ active: true, enabled: true, value: 'plain' });
    expect(stateOf('<p>ab</p>', ['ab', 1], 'codeLanguage')).toEqual({
      active: false,
      enabled: false,
      value: null,
    });
  });

  it('callout: variante do cursor ou null', () => {
    const doc =
      '<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title">Atenção</p><p>ab</p></aside><p>cd</p>';
    const editor = createTestEditor(doc);
    selectText(editor, 'ab', 1);
    expect(readItemState(editor, 'callout')).toEqual({
      active: true,
      enabled: true,
      value: 'warning',
    });
    selectText(editor, 'cd', 1);
    expect(readItemState(editor, 'callout')).toEqual({
      active: false,
      enabled: true,
      value: null,
    });
  });

  it('undo habilitado só depois de uma edição; redo depois de desfazer', () => {
    const editor = createTestEditor('<p>ab</p>');
    selectText(editor, 'ab', 2);
    expect(readItemState(editor, 'undo').enabled).toBe(false);
    expect(readItemState(editor, 'redo').enabled).toBe(false);
    editor.commands.insertContent('c');
    expect(readItemState(editor, 'undo').enabled).toBe(true);
    editor.commands.undo();
    expect(readItemState(editor, 'redo').enabled).toBe(true);
  });

  it('indent/outdent só em item de lista ou de tarefa', () => {
    const editor = createTestEditor(
      '<ul><li><p>a</p></li><li><p>b</p></li></ul><p>c</p>',
    );
    selectText(editor, 'b', 1);
    expect(readItemState(editor, 'indent').enabled).toBe(true);
    expect(readItemState(editor, 'outdent').enabled).toBe(true);
    selectText(editor, 'a', 1);
    expect(readItemState(editor, 'indent').enabled).toBe(false);
    selectText(editor, 'c', 1);
    expect(readItemState(editor, 'indent').enabled).toBe(false);
    expect(readItemState(editor, 'outdent').enabled).toBe(false);
  });

  it('table: insertTable desabilitado dentro de tabela', () => {
    const editor = createTestEditor(
      '<p>ab</p><table><tbody><tr><td><p>x</p></td></tr></tbody></table>',
    );
    selectText(editor, 'ab', 1);
    expect(readItemState(editor, 'table')).toEqual({
      active: false,
      enabled: true,
      value: null,
    });
    expect(readTableMenuState(editor).insertTable.enabled).toBe(true);
    expect(readTableMenuState(editor).addRowAfter.enabled).toBe(false);
    selectText(editor, 'x', 1);
    expect(readItemState(editor, 'table').active).toBe(true);
    expect(readTableMenuState(editor).insertTable.enabled).toBe(false);
    expect(readTableMenuState(editor).addRowAfter.enabled).toBe(true);
  });

  it('clearFormatting: marcas no cursor, guardadas ou na seleção', () => {
    const editor = createTestEditor('<p>ab<em>cd</em></p>');
    selectText(editor, 'ab', 1);
    expect(readItemState(editor, 'clearFormatting').enabled).toBe(false);
    selectText(editor, 'cd', 1);
    expect(readItemState(editor, 'clearFormatting').enabled).toBe(true);
    selectText(editor, 'ab', 1);
    editor.commands.setMark('bold');
    expect(readItemState(editor, 'clearFormatting').enabled).toBe(true);
    selectText(editor, 'ab');
    expect(readItemState(editor, 'clearFormatting').enabled).toBe(false);
    selectText(editor, 'bc');
    expect(readItemState(editor, 'clearFormatting').enabled).toBe(true);
  });

  it('todo item tem estado (sem lançar) em qualquer contexto', () => {
    const editor = createTestEditor('<p>ab</p>');
    selectText(editor, 'ab', 1);
    for (const id of ALL_IDS) {
      expect(() => readItemState(editor, id)).not.toThrow();
    }
  });
});

describe('seleção mista (Review Focus 5)', () => {
  it('<b>a</b>b selecionado: bold coerente com isActive e clearFormatting habilitado', () => {
    const editor = createTestEditor('<p><strong>a</strong>b</p>');
    selectText(editor, 'ab');
    const bold = readItemState(editor, 'bold');
    expect(bold.active).toBe(editor.isActive('bold'));
    expect(readItemState(editor, 'clearFormatting').enabled).toBe(true);
  });

  it('CellSelection de duas células: mergeCells habilitado, blockType coerente', () => {
    const editor = createTestEditor(
      '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
    );
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos);
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(editor.state.doc, cells[0] ?? 0, cells[1] ?? 0),
      ),
    );
    expect(readTableMenuState(editor).mergeCells).toEqual({
      enabled: true,
      spanLimited: false,
    });
    expect(readItemState(editor, 'blockType').value).toBe('paragraph');
    expect(readItemState(editor, 'table').active).toBe(true);
  });
});

describe('sameItemState', () => {
  it('compara por campo', () => {
    const a = { active: true, enabled: false, value: 'x' };
    expect(sameItemState(a, { ...a })).toBe(true);
    expect(sameItemState(a, { ...a, active: false })).toBe(false);
    expect(sameItemState(a, { ...a, enabled: true })).toBe(false);
    expect(sameItemState(a, { ...a, value: null })).toBe(false);
  });
});

describe('createToolbarState (U5, R6)', () => {
  function setup(doc: string, ids: readonly RteToolbarItemId[] = ALL_IDS) {
    const editor = createTestEditor(doc);
    const instance = signal<Editor | null>(editor);
    const bridge = createRteBridge(instance, () => true);
    bridge.connect(editor);
    const interactive = signal(true);
    const items = signal<readonly RteToolbarItemId[]>(ids);
    const toolbar = createToolbarState({
      editor: instance,
      version: bridge.version,
      items,
      interactive,
    });
    return { editor, instance, interactive, items, toolbar, bridge };
  }

  /** Um `effect` por item; conta as notificações de cada um. */
  function watch(
    toolbar: ReturnType<typeof createToolbarState>,
    ids: readonly RteToolbarItemId[],
  ): Map<RteToolbarItemId, number> {
    const counts = new Map<RteToolbarItemId, number>();
    for (const id of ids) {
      const item: Signal<RteItemState> = toolbar.item(id);
      counts.set(id, 0);
      TestBed.runInInjectionContext(() =>
        effect(() => {
          item();
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }),
      );
    }
    TestBed.tick();
    return counts;
  }

  const zero = (counts: Map<RteToolbarItemId, number>) => {
    for (const id of counts.keys()) counts.set(id, 0);
  };
  const notified = (counts: Map<RteToolbarItemId, number>) =>
    [...counts].filter(([, n]) => n > 0).map(([id]) => id);

  it('digitar sem mudar marca nem bloco não notifica nenhum item', () => {
    const { editor, toolbar } = setup('<p>ab</p>');
    selectText(editor, 'ab', 2);
    editor.commands.insertContent('c'); // undo passa a habilitado
    const counts = watch(toolbar, ALL_IDS);
    zero(counts);
    editor.commands.insertContent('d');
    TestBed.tick();
    editor.commands.insertContent('e');
    TestBed.tick();
    expect(notified(counts)).toEqual([]);
  });

  it('cursor entrando num negrito: só bold notifica', () => {
    const { editor, toolbar } = setup('<p><em>ab<strong>cd</strong></em></p>');
    selectText(editor, 'ab', 1);
    const counts = watch(toolbar, ALL_IDS);
    zero(counts);
    selectText(editor, 'cd', 1);
    TestBed.tick();
    expect(notified(counts)).toEqual(['bold']);
  });

  it('um cálculo por transação lida', () => {
    const { editor, toolbar } = setup('<p>ab</p>');
    toolbar.all();
    const start = toolbarStateProbe.computations;
    for (let i = 0; i < 3; i += 1) {
      editor.view.dispatch(editor.state.tr.setMeta('x', i));
      toolbar.all();
      toolbar.all();
    }
    expect(toolbarStateProbe.computations - start).toBe(3);
  });

  it('item(id) devolve sempre o mesmo Signal', () => {
    const { toolbar } = setup('<p>ab</p>');
    expect(toolbar.item('bold')).toBe(toolbar.item('bold'));
  });

  it('ler all() 50× não serializa o documento', () => {
    const { editor, toolbar } = setup('<p>ab</p>');
    editor.view.dispatch(editor.state.tr.insertText('x', 1));
    const spy = vi.spyOn(DOMSerializer, 'fromSchema');
    spy.mockClear();
    for (let i = 0; i < 50; i += 1) toolbar.all();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sem editor ou não interativo: nada habilitado, ativo/valor do editor', () => {
    const { editor, toolbar, interactive, instance } = setup(
      '<h2><strong>ab</strong></h2>',
    );
    selectText(editor, 'ab', 1);
    interactive.set(false);
    expect(toolbar.item('bold')()).toEqual({
      active: true,
      enabled: false,
      value: null,
    });
    expect(toolbar.item('blockType')()).toEqual({
      active: true,
      enabled: false,
      value: 'heading2',
    });
    instance.set(null);
    expect(toolbar.item('bold')()).toEqual({
      active: false,
      enabled: false,
      value: null,
    });
  });

  it('só os itens visíveis entram no cálculo', () => {
    const { toolbar, items } = setup('<p>ab</p>', ['bold']);
    expect([...toolbar.all().keys()]).toEqual(['bold']);
    expect(toolbar.item('italic')().enabled).toBe(false);
    items.set(['bold', 'italic']);
    expect(toolbar.item('italic')().enabled).toBe(true);
  });

  it('transação de seleção sem mudança de estado não troca o valor do item', () => {
    const { editor, toolbar } = setup('<p>abcd</p>');
    selectText(editor, 'abcd', 1);
    const before = toolbar.item('bold')();
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)),
    );
    expect(toolbar.item('bold')()).toBe(before);
  });
});

describe('itens de diálogo (G11)', () => {
  const LINK = '<p>x<a href="https://a.example/">ab</a>cd</p>';
  const LANG = '<p>x<span lang="pt">ab</span>cd</p>';
  const PULL =
    '<figure class="rt-pullquote"><blockquote><p>ab</p></blockquote></figure>';

  it('link: habilitado em parágrafo (cursor e seleção), inativo', () => {
    expect(stateOf('<p>abcd</p>', ['abcd', 1], 'link')).toEqual({
      active: false,
      enabled: true,
      value: null,
    });
    expect(stateOf('<p>abcd</p>', ['bc'], 'link').enabled).toBe(true);
  });

  it('link: desabilitado em bloco de código; ativo dentro de link', () => {
    expect(stateOf('<pre><code>ab</code></pre>', ['ab', 1], 'link')).toEqual({
      active: false,
      enabled: false,
      value: null,
    });
    expect(stateOf(LINK, ['ab', 1], 'link')).toEqual({
      active: true,
      enabled: true,
      value: null,
    });
  });

  it('lang: desabilitado com cursor fora de idioma; habilitado com seleção; ativo dentro de span[lang]', () => {
    expect(stateOf('<p>abcd</p>', ['abcd', 1], 'lang').enabled).toBe(false);
    expect(stateOf('<p>abcd</p>', ['bc'], 'lang')).toEqual({
      active: false,
      enabled: true,
      value: null,
    });
    expect(stateOf(LANG, ['ab', 1], 'lang')).toEqual({
      active: true,
      enabled: true,
      value: null,
    });
  });

  it('link e lang: na borda inicial o estado segue o alvo do diálogo (editar)', () => {
    expect(stateOf(LINK, ['xab', 1], 'link')).toEqual({
      active: true,
      enabled: true,
      value: null,
    });
    expect(stateOf(LANG, ['xab', 1], 'lang')).toEqual({
      active: true,
      enabled: true,
      value: null,
    });
  });

  it('quoteAuthor: habilitado só em rt-pullquote, nunca ativo', () => {
    expect(stateOf('<p>ab</p>', ['ab', 1], 'quoteAuthor').enabled).toBe(false);
    expect(stateOf(PULL, ['ab', 1], 'quoteAuthor')).toEqual({
      active: false,
      enabled: true,
      value: null,
    });
  });
});

@Component({
  selector: 'rte-test-observed-full-toolbar',
  imports: [RteEditor],
  template: `<rte-editor [value]="value" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ObservedFullHost {
  readonly value =
    '<p><strong>abcd <a href="https://a.example/">link</a></strong></p>';
}

describe('MutationObserver na barra full com os itens de diálogo', () => {
  afterEach(() => TestBed.resetTestingModule());

  function type(editor: Editor, text: string): void {
    const { view } = editor;
    const { from, to } = view.state.selection;
    const deflt = () => view.state.tr.insertText(text, from, to);
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, text, deflt),
    );
    if (!handled) view.dispatch(deflt());
  }

  async function setupObserved() {
    const fixture = await renderHost(ObservedFullHost);
    const el = fixture.nativeElement as HTMLElement;
    const editor = getRteEditor(
      el.querySelector('rte-editor') as Element,
    ) as Editor;
    const toolbar = el.querySelector('.rte-toolbar') as HTMLElement;
    selectText(editor, 'abcd', 1);
    type(editor, 'x'); // undo habilitado antes de observar
    await settle(fixture);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(toolbar, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    const flush = async () => {
      await settle(fixture);
      records.push(...observer.takeRecords());
    };
    return { editor, toolbar, records, flush, observer };
  }

  it('20 teclas num parágrafo com a barra full → 0 mutações', async () => {
    const { editor, records, flush, observer } = await setupObserved();
    for (let i = 0; i < 20; i += 1) {
      type(editor, 'y');
      await flush();
    }
    observer.disconnect();
    expect(records).toEqual([]);
  });

  it('cursor entrando num link → mutações só no botão link', async () => {
    const { editor, toolbar, records, flush, observer } = await setupObserved();
    selectText(editor, 'link', 1);
    await flush();
    observer.disconnect();
    expect(records.length).toBeGreaterThan(0);
    const link = toolbar.querySelector('[aria-label="Edit link"]');
    expect(link).not.toBeNull();
    for (const record of records) {
      expect(record.target).toBe(link);
      expect(record.type).toBe('attributes');
    }
    expect(new Set(records.map((r) => r.attributeName))).toEqual(
      new Set(['aria-label', 'title', 'class']),
    );
  });
});

@Component({
  selector: 'rte-test-observed-toolbar',
  imports: [RteEditor],
  template: `<rte-editor [value]="value" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ObservedHost {
  readonly value = '<p><em>ab<strong>cd</strong></em></p>';
}

describe('MutationObserver na barra do componente (R6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** Digita pelo `handleTextInput` (como o navegador), com recuo para `insertText`. */
  function type(editor: Editor, text: string): void {
    const { view } = editor;
    const { from, to } = view.state.selection;
    const deflt = () => view.state.tr.insertText(text, from, to);
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, text, deflt),
    );
    if (!handled) view.dispatch(deflt());
  }

  async function setupObserved() {
    const fixture = await renderHost(ObservedHost);
    const el = fixture.nativeElement as HTMLElement;
    const editor = getRteEditor(
      el.querySelector('rte-editor') as Element,
    ) as Editor;
    const toolbar = el.querySelector('.rte-toolbar') as HTMLElement;
    selectText(editor, 'ab', 1);
    type(editor, 'x'); // undo habilitado antes de observar
    await settle(fixture);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(toolbar, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    const flush = async () => {
      await settle(fixture);
      records.push(...observer.takeRecords());
    };
    return { fixture, editor, toolbar, records, flush, observer };
  }

  it('20 teclas num trecho sem mudar marca nem bloco → 0 mutações', async () => {
    const { editor, records, flush, observer } = await setupObserved();
    for (let i = 0; i < 20; i += 1) {
      type(editor, 'y');
      await flush();
    }
    observer.disconnect();
    expect(records).toEqual([]);
  });

  it('cursor entrando num negrito → mutações só no botão bold', async () => {
    const { editor, toolbar, records, flush, observer } = await setupObserved();
    selectText(editor, 'cd', 1);
    await flush();
    observer.disconnect();
    expect(records.length).toBeGreaterThan(0);
    const bold = toolbar.querySelector('[aria-label="Bold"]') as HTMLElement;
    for (const record of records) {
      expect(record.target).toBe(bold);
      expect(record.type).toBe('attributes');
    }
    expect(new Set(records.map((r) => r.attributeName))).toEqual(
      new Set(['aria-pressed', 'class']),
    );
  });
});

/** Campos protegidos do `RteEditor` lidos pelos testes (M15, M17). */
interface EditorInternals {
  readonly toolbarState: RteToolbarState;
  readonly floatingKinds: Signal<readonly RteFloatingMenuKind[]>;
}

function internals(fixture: ComponentFixture<unknown>): EditorInternals {
  return fixture.debugElement.query(By.directive(RteEditor))
    .componentInstance as unknown as EditorInternals;
}

@Component({
  selector: 'rte-test-shared-state',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value"
    [toolbar]="toolbar()"
    [floatingMenus]="floatingMenus()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SharedStateHost {
  readonly value = '<p>ab<strong>cd</strong></p>';
  readonly toolbar = signal<RteToolbarConfig | undefined>('full');
  readonly floatingMenus = signal<RteFloatingMenusConfig | undefined>(
    undefined,
  );
}

describe('estado único da barra e dos menus (M15, R12)', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(
    toolbar: RteToolbarConfig,
    floatingMenus?: RteFloatingMenusConfig,
  ) {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(SharedStateHost);
    fixture.componentInstance.toolbar.set(toolbar);
    fixture.componentInstance.floatingMenus.set(floatingMenus);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const editor = getRteEditor(
      el.querySelector('rte-editor') as Element,
    ) as Editor;
    return { fixture, el, editor, state: internals(fixture).toolbarState };
  }

  it('barra full e menus padrão: uma transação → um cálculo', async () => {
    const { fixture, editor } = await setup('full');
    toolbarStateProbe.computations = 0;
    editor.view.dispatch(editor.state.tr.setMeta('x', 1));
    await settle(fixture);
    expect(toolbarStateProbe.computations).toBe(1);
  });

  it('itens = união sem repetição da barra e do menu de texto', async () => {
    const { state } = await setup([['undo', 'bold']]);
    expect([...state.all().keys()]).toEqual([
      'undo',
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'link',
    ]);
  });

  it('toolbar: false com menus padrão: um cálculo por transação e bold reflete <strong>', async () => {
    const { fixture, el, editor, state } = await setup(false);
    expect(el.querySelector('.rte-toolbar')).toBeNull();
    selectText(editor, 'ab', 1);
    expect(state.item('bold')().active).toBe(false);
    toolbarStateProbe.computations = 0;
    selectText(editor, 'cd', 1);
    await settle(fixture);
    expect(state.item('bold')()).toEqual({
      active: true,
      enabled: true,
      value: null,
    });
    state.all();
    expect(toolbarStateProbe.computations).toBe(1);
  });

  it('toolbar: false e floatingMenus: false → nenhum item', async () => {
    const { state } = await setup(false, false);
    expect(state.all().size).toBe(0);
  });
});

describe('floatingMenus ao vivo (M17, R11)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('{ text: false } ao vivo: tipo sai, sem recriar o editor nem emitir valor', async () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(RteEditor);
    const ready: Editor[] = [];
    let changes = 0;
    fixture.componentInstance.editorReady.subscribe((e) => ready.push(e));
    fixture.componentInstance.value.subscribe(() => (changes += 1));
    fixture.componentRef.setInput('value', '<p>ab</p>');
    fixture.componentRef.setInput('toolbar', false);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const cmp = fixture.componentInstance as unknown as EditorInternals;
    // 05c1 (V10): os menus de vídeo e de embed entram na lista
    expect(cmp.floatingKinds()).toEqual([
      'image',
      'video',
      'embed',
      'link',
      'text',
      'table',
    ]);
    expect([...cmp.toolbarState.all().keys()]).toContain('bold');
    changes = 0;
    fixture.componentRef.setInput('floatingMenus', { text: false });
    await fixture.whenStable();
    expect(cmp.floatingKinds()).toEqual([
      'image',
      'video',
      'embed',
      'link',
      'table',
    ]);
    expect(cmp.toolbarState.all().size).toBe(0);
    expect(ready).toHaveLength(1);
    expect(changes).toBe(0);
  });
});

@Component({
  selector: 'rte-test-observed-floating',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value"
    [toolbar]="toolbar"
    [options]="options"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ObservedFloatingHost {
  // Só o `bold` na barra: outros itens (ex.: limpar formatação) mudam de estado com a seleção.
  readonly toolbar: RteToolbarConfig = [['bold']];
  readonly options = { features: { tables: true } };
  readonly value =
    '<p>ab<strong>cd</strong>ef</p>' +
    '<table><tbody><tr><td><p>c1</p></td><td><p>c2</p></td></tr></tbody></table>';
}

describe('MutationObserver nos menus flutuantes (R12)', () => {
  let restorePopover: () => void;
  let restoreGeometry: () => void;
  let restoreCoords: () => void;
  beforeEach(() => {
    restorePopover = installPopoverShim();
    restoreGeometry = installGeometry({
      viewport: { width: 1000, height: 800 },
      rects: (el) =>
        el.classList.contains('rte-floating')
          ? null
          : { top: 100, left: 100, right: 900, bottom: 700 },
      size: (el) =>
        el.classList.contains('rte-floating')
          ? { width: 200, height: 40 }
          : { width: 800, height: 600 },
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    restoreCoords?.();
    restoreGeometry();
    restorePopover();
  });

  async function setupObserved(select: [string, number?, number?]) {
    const fixture = await renderHost(ObservedFloatingHost);
    const el = fixture.nativeElement as HTMLElement;
    const editor = getRteEditor(
      el.querySelector('rte-editor') as Element,
    ) as Editor;
    // Geometria fixa: a posição do menu não muda entre as transações.
    restoreCoords = fakeCoords(editor, () => ({
      top: 200,
      bottom: 220,
      left: 300,
      right: 300,
    }));
    editor.view.dom.focus();
    selectText(editor, ...select);
    await settle(fixture);
    return { fixture, el, editor };
  }

  function observe(targets: Element[]) {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    for (const target of targets)
      observer.observe(target, {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      });
    return { records, observer };
  }

  it('menu de tabela visível: 20 insertText numa célula → 0 registros', async () => {
    const { fixture, el, editor } = await setupObserved(['c1', 1]);
    const table = el.querySelector('.rte-floating--table') as HTMLElement;
    expect(isPopoverOpen(table)).toBe(true);
    const { records, observer } = observe([
      el.querySelector('rte-floating-menus') as Element,
    ]);
    for (let i = 0; i < 20; i += 1) {
      const { from, to } = editor.state.selection;
      editor.view.dispatch(editor.state.tr.insertText('y', from, to));
      await settle(fixture);
      records.push(...observer.takeRecords());
    }
    observer.disconnect();
    expect(records).toEqual([]);
  });

  it('estender a seleção para dentro de <strong> → registros só nos Bold do menu e da barra', async () => {
    const { fixture, el, editor } = await setupObserved(['ab', 0, 1]);
    const text = el.querySelector('.rte-floating--text') as HTMLElement;
    expect(isPopoverOpen(text)).toBe(true);
    const toolbar = el.querySelector('.rte-toolbar') as HTMLElement;
    const { records, observer } = observe([
      el.querySelector('rte-floating-menus') as Element,
      toolbar,
    ]);
    selectText(editor, 'cd', 0, 2);
    await settle(fixture);
    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records.length).toBeGreaterThan(0);
    const boldMenu = text.querySelector('[aria-label="Bold"]');
    const boldBar = toolbar.querySelector('[aria-label="Bold"]');
    expect(boldMenu).not.toBeNull();
    for (const record of records) {
      expect([boldMenu, boldBar]).toContain(record.target);
      expect(record.type).toBe('attributes');
    }
  });
});

const MEDIA_DOC =
  '<p>abcd</p>' +
  '<figure class="rt-figure rt-figure--center"><img src="/a.png" alt="A"></figure>' +
  '<figure class="rt-figure rt-figure--video"><video src="/v.webm" controls=""></video></figure>' +
  '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube"></iframe></figure>' +
  '<p>efgh</p>';

/** NodeSelection no primeiro nó do tipo. */
function selectMediaNode(editor: Editor, typeName: string): void {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === typeName) found = pos;
    return found < 0;
  });
  expect(found).toBeGreaterThanOrEqual(0);
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, found)),
  );
}

const MEDIA_ITEMS = [
  ['image', 'rtImage', 'Edit image', 'Insert image'],
  ['video', 'rtVideo', 'Edit video', 'Insert video'],
  ['embed', 'rtEmbed', 'Edit embedded content', 'Insert embedded content'],
] as const;

describe('itens de mídia (V2)', () => {
  it.each(MEDIA_ITEMS)(
    '%s: ativo com o próprio nó selecionado; inativo e habilitado no texto',
    (id, typeName) => {
      const editor = createTestEditor(MEDIA_DOC);
      selectMediaNode(editor, typeName);
      expect(readItemState(editor, id)).toEqual({
        active: true,
        enabled: true,
        value: null,
      });
      selectText(editor, 'abcd', 1);
      expect(readItemState(editor, id)).toEqual({
        active: false,
        enabled: true,
        value: null,
      });
    },
  );

  it('outro nó de mídia selecionado: item inativo e habilitado', () => {
    const editor = createTestEditor(MEDIA_DOC);
    selectMediaNode(editor, 'rtVideo');
    expect(readItemState(editor, 'image')).toEqual({
      active: false,
      enabled: true,
      value: null,
    });
  });

  it('sem o nó no esquema: desabilitado', () => {
    const editor = createTestEditor('<p>ab</p>', {
      features: { media: false },
      embedProviders: [],
    });
    selectText(editor, 'ab', 1);
    for (const id of ['image', 'video', 'embed'] as const)
      expect(readItemState(editor, id)).toEqual({
        active: false,
        enabled: false,
        value: null,
      });
  });
});

@Component({
  selector: 'rte-test-media-toolbar',
  imports: [RteEditor],
  template: `<rte-editor [value]="value" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MediaToolbarHost {
  readonly value = MEDIA_DOC;
}

describe('botões de mídia na barra (V2, R2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setupMedia() {
    const fixture = await renderHost(MediaToolbarHost);
    const el = fixture.nativeElement as HTMLElement;
    const editor = getRteEditor(
      el.querySelector('rte-editor') as Element,
    ) as Editor;
    const toolbar = el.querySelector('.rte-toolbar') as HTMLElement;
    return { fixture, editor, toolbar };
  }

  it.each(MEDIA_ITEMS)(
    '%s: nó selecionado → item ativo, botão "Edit …" com --active; cursor no texto → "Insert …"',
    async (id, typeName, edit, insert) => {
      const { fixture, editor, toolbar } = await setupMedia();
      const host = fixture.debugElement.query(By.directive(RteEditor));
      const state = (
        host.componentInstance as { toolbarState: RteToolbarState }
      ).toolbarState;
      selectMediaNode(editor, typeName);
      await settle(fixture);
      expect(state.item(id)()).toEqual({
        active: true,
        enabled: true,
        value: null,
      });
      const active = toolbar.querySelector(`[aria-label="${edit}"]`);
      expect(active).not.toBeNull();
      expect(active?.classList.contains('rte-toolbar__button--active')).toBe(
        true,
      );
      selectText(editor, 'abcd', 1);
      await settle(fixture);
      const idle = toolbar.querySelector(`[aria-label="${insert}"]`);
      expect(idle).not.toBeNull();
      expect(idle?.classList.contains('rte-toolbar__button--active')).toBe(
        false,
      );
      expect(idle?.getAttribute('aria-haspopup')).toBe('dialog');
    },
  );

  it('20 insertText num parágrafo com os itens de mídia → 0 registros', async () => {
    const { fixture, editor, toolbar } = await setupMedia();
    expect(toolbar.querySelector('[aria-label="Insert image"]')).not.toBeNull();
    selectText(editor, 'abcd', 1);
    editor.view.dispatch(editor.state.tr.insertText('x'));
    await settle(fixture);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(toolbar, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    for (let i = 0; i < 20; i += 1) {
      editor.view.dispatch(editor.state.tr.insertText('y'));
      await settle(fixture);
      records.push(...observer.takeRecords());
    }
    observer.disconnect();
    expect(records).toEqual([]);
  });
});
