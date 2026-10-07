// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { RTE_CONTENT_LABELS } from './labels';
import { isEmptyDoc, resolvePlaceholder } from './placeholder';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import type { RteEditorOptions } from './types';

afterEach(() => destroyTestEditors());

const NEWS = {
  colors: false,
  code: false,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: true,
};

function make(options: RteEditorOptions, content?: string): Editor {
  return createTestEditor({ features: NEWS, ...options }, content);
}

function marked(editor: Editor): Element[] {
  return [...editor.view.dom.querySelectorAll('.rte-placeholder')];
}

function touch(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta('x', 1));
}

describe('placeholder do documento', () => {
  it('decora o parágrafo vazio e põe aria-placeholder; some ao digitar', () => {
    const editor = make({ placeholder: 'Escreva aqui' });
    const p = editor.view.dom.querySelector('p.rte-placeholder');
    expect(p?.classList.contains('rte-placeholder--doc')).toBe(true);
    expect(p?.getAttribute('data-placeholder')).toBe('Escreva aqui');
    expect(editor.view.dom.getAttribute('aria-placeholder')).toBe(
      'Escreva aqui',
    );
    editor.commands.insertContent('a');
    expect(marked(editor)).toHaveLength(0);
    expect(editor.view.dom.hasAttribute('aria-placeholder')).toBe(false);
    editor.commands.clearContent();
    expect(marked(editor)).toHaveLength(1);
    expect(editor.view.dom.getAttribute('aria-placeholder')).toBe(
      'Escreva aqui',
    );
  });

  it.each([
    ['dois parágrafos vazios', { placeholder: 'x' }, '<p></p><p></p>'],
    ['título vazio', { placeholder: 'x' }, '<h2></h2>'],
    ['parágrafo com br', { placeholder: 'x' }, '<p><br></p>'],
    ['texto vazio', { placeholder: '' }, undefined],
    ['sem opção', {}, undefined],
  ] as const)('sem decoração: %s', (_n, options, content) => {
    const editor = make({ ...options }, content);
    expect(marked(editor)).toHaveLength(0);
    expect(editor.view.dom.hasAttribute('aria-placeholder')).toBe(false);
  });

  it('função é lida a cada transação', () => {
    let t = 'A';
    const editor = make({ placeholder: () => t });
    expect(marked(editor)[0]?.getAttribute('data-placeholder')).toBe('A');
    t = 'B';
    touch(editor);
    expect(marked(editor)[0]?.getAttribute('data-placeholder')).toBe('B');
    expect(editor.view.dom.getAttribute('aria-placeholder')).toBe('B');
  });

  it('função que lança vale como ausente', () => {
    const editor = make({
      placeholder: () => {
        throw new Error('falha');
      },
    });
    expect(marked(editor)).toHaveLength(0);
    expect(() => touch(editor)).not.toThrow();
    expect(resolvePlaceholder((() => 1) as never)).toBe('');
  });

  it('continua com o editor não editável', () => {
    const editor = make({ placeholder: 'x' });
    editor.setEditable(false);
    expect(marked(editor)).toHaveLength(1);
    expect(editor.view.dom.getAttribute('aria-placeholder')).toBe('x');
  });

  it('isEmptyDoc', () => {
    expect(isEmptyDoc(make({}).state.doc)).toBe(true);
    expect(isEmptyDoc(make({}, '<p>a</p>').state.doc)).toBe(false);
  });
});

describe('placeholder dos títulos de caixa', () => {
  const CALLOUT =
    '<aside class="rt-callout rt-callout--warning"><p class="rt-callout__title"></p><p>corpo</p></aside>';

  it('rótulo da variante, relido a cada transação', () => {
    let cur = RTE_CONTENT_LABELS['pt-BR'];
    const editor = make({ labels: () => cur }, CALLOUT);
    const title = editor.view.dom.querySelector('p.rt-callout__title');
    expect(title?.classList.contains('rte-placeholder')).toBe(true);
    expect(title?.classList.contains('rte-placeholder--doc')).toBe(false);
    expect(title?.getAttribute('data-placeholder')).toBe('Atenção');
    cur = RTE_CONTENT_LABELS['es'];
    touch(editor);
    expect(
      editor.view.dom
        .querySelector('p.rt-callout__title')
        ?.getAttribute('data-placeholder'),
    ).toBe('Atención');
  });

  it('labels que lança vale como ausente (en), sem exceção', () => {
    const editor = make(
      {
        labels: () => {
          throw new Error('falha');
        },
      },
      CALLOUT,
    );
    const title = () => editor.view.dom.querySelector('p.rt-callout__title');
    expect(title()?.getAttribute('data-placeholder')).toBe('Warning');
    expect(() => touch(editor)).not.toThrow();
    expect(title()?.getAttribute('data-placeholder')).toBe('Warning');
    expect(getRteHtml(editor)).toContain('Warning');
  });

  it('Leia também vazio, sem labels', () => {
    const editor = make(
      {},
      '<aside class="rt-read-also"><p class="rt-read-also__title"></p><ul class="rt-read-also__list"><li><a href="https://example.com/">a</a></li></ul></aside>',
    );
    const found = marked(editor);
    expect(found).toHaveLength(1);
    expect(found[0]?.getAttribute('data-placeholder')).toBe('Read also');
  });

  it('título com texto não é decorado', () => {
    const editor = make({}, CALLOUT.replace('title"></p>', 'title">Oi</p>'));
    expect(marked(editor)).toHaveLength(0);
  });
});

describe('placeholder não chega ao HTML (C19)', () => {
  it('getRteHtml e getHTML limpos', () => {
    const editor = make({ placeholder: 'x' });
    const a = getRteHtml(editor);
    const b = editor.getHTML();
    for (const out of [a, b]) {
      expect(out).not.toContain('rte-placeholder');
      expect(out).not.toContain('data-placeholder');
      expect(out).not.toContain('aria-placeholder');
    }
    const withTitle = make(
      {},
      '<aside class="rt-callout rt-callout--info"><p class="rt-callout__title"></p><p>c</p></aside>',
    );
    expect(withTitle.getHTML()).not.toContain('data-placeholder');
  });
});
