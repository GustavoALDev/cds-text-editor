// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { LanguageFn } from 'highlight.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineCodeLanguage } from '../../code-languages/src/index';
import type { RteCodeLanguage } from '../../code-languages/src/index';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

type Lowlight = ReturnType<typeof import('lowlight').createLowlight>;

// Cada createLowlight() do plugin fica registrado aqui, com highlightAuto espionado.
const instances = vi.hoisted(() => [] as Lowlight[]);

vi.mock('lowlight', async (importOriginal) => {
  const mod = await importOriginal<typeof import('lowlight')>();
  return {
    ...mod,
    createLowlight: (...args: Parameters<typeof mod.createLowlight>) => {
      const instance = mod.createLowlight(...args);
      vi.spyOn(instance, 'highlightAuto');
      instances.push(instance);
      return instance;
    },
  };
});

const ONLY_CODE = {
  colors: false,
  code: true,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: false,
};

const grammar: LanguageFn = () => ({
  name: 'fake',
  contains: [{ className: 'keyword', begin: /\bfoo\b/ }],
});

function fakeCatalog(load: () => Promise<LanguageFn>): RteCodeLanguage[] {
  return [
    defineCodeLanguage({ id: 'fake', name: 'Fake', aliases: ['fk'], load }),
  ];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const TWO_BLOCKS =
  '<pre><code class="language-fake">foo bar</code></pre>' +
  '<pre><code class="language-fk">x foo</code></pre>';

function editorWith(
  content: string,
  codeLanguages: readonly RteCodeLanguage[],
) {
  return createTestEditor({ features: ONLY_CODE, codeLanguages }, content);
}

function keywords(editor: Editor): string[] {
  return [...editor.view.dom.querySelectorAll('.hljs-keyword')].map(
    (el) => el.textContent ?? '',
  );
}

afterEach(() => {
  destroyTestEditors();
  instances.splice(0);
  vi.restoreAllMocks();
});

describe('realce: carga sob demanda', () => {
  it('carrega uma vez e realça todos os blocos da linguagem', async () => {
    const load = vi.fn(async () => grammar);
    const editor = editorWith(TWO_BLOCKS, fakeCatalog(load));
    const metas: { history: unknown; docChanged: boolean }[] = [];
    editor.on('transaction', ({ transaction }) => {
      metas.push({
        history: transaction.getMeta('addToHistory'),
        docChanged: transaction.docChanged,
      });
    });
    await vi.waitFor(() => expect(keywords(editor)).toEqual(['foo', 'foo']));
    expect(load).toHaveBeenCalledTimes(1);
    // Uma única transação de realce, só com meta e fora do histórico.
    expect(metas).toEqual([{ history: false, docChanged: false }]);
    const before = editor.state.doc;
    expect(editor.commands.undo()).toBe(false);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(keywords(editor)).toEqual(['foo', 'foo']);
  });

  it('pedidos concorrentes (edições durante a carga) chamam load uma vez', async () => {
    const pending = deferred<LanguageFn>();
    const load = vi.fn(() => pending.promise);
    const editor = editorWith(TWO_BLOCKS, fakeCatalog(load));
    editor.commands.setTextSelection(1);
    editor.commands.insertContent('foo ');
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: 'codeBlock',
      attrs: { language: 'fake' },
      content: [{ type: 'text', text: 'foo' }],
    });
    expect(load).toHaveBeenCalledTimes(1);
    pending.resolve(grammar);
    await vi.waitFor(() => expect(keywords(editor)).toHaveLength(4));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('edição recalcula o bloco alterado', async () => {
    const editor = editorWith(
      '<pre><code class="language-fake">bar</code></pre>',
      fakeCatalog(async () => grammar),
    );
    await vi.waitFor(() => expect(instances[0]?.registered('fake')).toBe(true));
    expect(keywords(editor)).toEqual([]);
    editor.commands.setTextSelection(1);
    editor.commands.insertContent('foo ');
    expect(keywords(editor)).toEqual(['foo']);
    editor.commands.setCodeBlockLanguage(null);
    expect(keywords(editor)).toEqual([]);
    editor.commands.setCodeBlockLanguage('fk');
    expect(keywords(editor)).toEqual(['foo']);
  });

  it.each([
    ['setParagraph', (e: Editor) => e.commands.setParagraph()],
    ['clearNodes', (e: Editor) => e.commands.clearNodes()],
    ['toggleCodeBlock', (e: Editor) => e.commands.toggleCodeBlock()],
    ['setHeading', (e: Editor) => e.commands.setHeading({ level: 2 })],
  ])('%s tira o realce do bloco que deixou de ser código', async (_n, run) => {
    const editor = editorWith(
      TWO_BLOCKS,
      fakeCatalog(async () => grammar),
    );
    await vi.waitFor(() => expect(keywords(editor)).toHaveLength(2));
    editor.commands.setTextSelection(2);
    expect(run(editor)).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).not.toBe('codeBlock');
    expect(keywords(editor)).toEqual(['foo']);
    expect(
      editor.view.dom.firstElementChild?.querySelector('[class*="hljs"]'),
    ).toBeNull();
  });

  it('linguagem fora do catálogo: sem decoração e sem highlightAuto', async () => {
    const load = vi.fn(async () => grammar);
    const editor = editorWith(
      '<pre><code class="language-outra">foo</code></pre>' +
        '<pre><code>foo</code></pre>' +
        '<pre><code class="language-fake">foo</code></pre>',
      fakeCatalog(load),
    );
    await vi.waitFor(() => expect(keywords(editor)).toEqual(['foo']));
    expect(editor.view.dom.querySelectorAll('[class^="hljs"]')).toHaveLength(1);
    expect(instances).toHaveLength(1);
    expect(instances[0]?.highlightAuto).not.toHaveBeenCalled();
  });

  it('load rejeitado não lança e não é tentado de novo', async () => {
    const load = vi.fn(() => Promise.reject(new Error('rede')));
    const editor = editorWith(TWO_BLOCKS, fakeCatalog(load));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    editor.commands.setTextSelection(2);
    editor.commands.insertContent('foo ');
    editor.commands.setContent(TWO_BLOCKS);
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledTimes(1);
    expect(keywords(editor)).toEqual([]);
  });

  it('load que lança de forma síncrona não quebra o editor', async () => {
    const load = vi.fn((): Promise<LanguageFn> => {
      throw new Error('síncrono');
    });
    const editor = editorWith(TWO_BLOCKS, fakeCatalog(load));
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledTimes(1);
    expect(keywords(editor)).toEqual([]);
    expect(getRteHtml(editor)).toContain('language-fake');
  });

  it('gramática resolvida depois de destroy não toca a vista', async () => {
    const pending = deferred<LanguageFn>();
    const load = vi.fn(() => pending.promise);
    const editor = editorWith(TWO_BLOCKS, fakeCatalog(load));
    const dispatch = vi.spyOn(editor.view, 'dispatch');
    const errors = vi.spyOn(console, 'error');
    destroyTestEditors();
    pending.resolve(grammar);
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatch).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(instances[0]?.registered('fake')).toBe(false);
  });
  it('reconfigurar plugins (registerPlugin) não desliga o realce', async () => {
    const pending = deferred<LanguageFn>();
    const editor = editorWith(
      TWO_BLOCKS,
      fakeCatalog(() => pending.promise),
    );
    editor.registerPlugin(new Plugin({ key: new PluginKey('extra') }));
    pending.resolve(grammar);
    await vi.waitFor(() => expect(keywords(editor)).toEqual(['foo', 'foo']));
  });
});

describe('realce: isolamento entre editores', () => {
  it('a gramática registrada em A não realça B (sem catálogo)', async () => {
    const a = editorWith(
      TWO_BLOCKS,
      fakeCatalog(async () => grammar),
    );
    const b = editorWith(TWO_BLOCKS, []);
    await vi.waitFor(() => expect(keywords(a)).toEqual(['foo', 'foo']));
    expect(keywords(b)).toEqual([]);
    expect(instances).toHaveLength(2);
    expect(instances[0]).not.toBe(instances[1]);
    expect(instances[1]?.listLanguages()).toEqual([]);
  });

  it('dois editores com o mesmo catálogo carregam cada um a sua gramática', async () => {
    const load = vi.fn(async () => grammar);
    const catalog = fakeCatalog(load);
    const a = editorWith(TWO_BLOCKS, catalog);
    const b = editorWith(TWO_BLOCKS, catalog);
    await vi.waitFor(() => {
      expect(keywords(a)).toHaveLength(2);
      expect(keywords(b)).toHaveLength(2);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('cada lowlight começa vazio e recebe id e aliases', async () => {
    const editor = editorWith(
      TWO_BLOCKS,
      fakeCatalog(async () => grammar),
    );
    await vi.waitFor(() => expect(keywords(editor)).toHaveLength(2));
    expect(instances[0]?.registered('fake')).toBe(true);
    expect(instances[0]?.registered('fk')).toBe(true);
    expect(instances[0]?.listLanguages()).toEqual(['fake']);
  });
});

describe('realce: nada é serializado', () => {
  it('getRteHtml e getHTML não contêm hljs', async () => {
    const editor = editorWith(
      TWO_BLOCKS,
      fakeCatalog(async () => grammar),
    );
    await vi.waitFor(() => expect(keywords(editor)).toHaveLength(2));
    expect(getRteHtml(editor)).toBe(
      '<pre><code class="language-fake">foo bar</code></pre>' +
        '<pre><code class="language-fake">x foo</code></pre>',
    );
    expect(editor.getHTML()).not.toContain('hljs');
    expect(JSON.stringify(editor.getJSON())).not.toContain('hljs');
  });
});
