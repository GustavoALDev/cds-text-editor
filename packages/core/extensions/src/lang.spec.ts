// @vitest-environment jsdom
import type { Content, Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

const FEATURES = {
  colors: true,
  code: false,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: true,
};

afterEach(() => destroyTestEditors());

function canonical(editor: Editor): string {
  const out = getRteHtml(editor);
  expect(validateHtml(out, editor.storage.rtContent.schema)).toEqual([]);
  return out;
}

function roundTrip(content: Content): string {
  return canonical(createTestEditor({ features: FEATURES }, content));
}

function selectAll(editor: Editor): void {
  const doc = editor.state.doc;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(doc, 1, doc.content.size - 1),
    ),
  );
}

describe('rtLang: leitura e saída', () => {
  it('lang e dir válidos são ponto fixo', () => {
    expect(roundTrip('<p><span lang="en" dir="rtl">a</span></p>')).toBe(
      '<p><span lang="en" dir="rtl">a</span></p>',
    );
    expect(roundTrip('<p><span lang="pt-BR">a</span></p>')).toBe(
      '<p><span lang="pt-BR">a</span></p>',
    );
  });

  it('dir só em minúsculas ltr/rtl', () => {
    expect(roundTrip('<p><span lang="en" dir="RTL">a</span></p>')).toBe(
      '<p><span lang="en">a</span></p>',
    );
    expect(roundTrip('<p><span lang="en" dir="auto">a</span></p>')).toBe(
      '<p><span lang="en">a</span></p>',
    );
  });

  it('lang inválido não vira marca', () => {
    expect(roundTrip('<p><span lang="x">a</span></p>')).toBe('<p>a</p>');
    expect(roundTrip('<p><span dir="rtl">a</span></p>')).toBe('<p>a</p>');
  });

  it('cor e idioma no mesmo span: duas marcas aninhadas, saída canônica', () => {
    expect(
      roundTrip('<p><span data-rt-color="red" lang="en">a</span></p>'),
    ).toBe(
      '<p><span data-rt-color="red" style="color: #b3261e"><span lang="en">a</span></span></p>',
    );
    // ordem inversa dos atributos e ponto fixo da forma aninhada
    expect(
      roundTrip(
        '<p><span data-rt-color="red" style="color: #b3261e"><span lang="en">a</span></span></p>',
      ),
    ).toBe(
      '<p><span data-rt-color="red" style="color: #b3261e"><span lang="en">a</span></span></p>',
    );
  });

  it('JSON com lang/dir inválidos: sem dir inválido; sem lang, nenhum atributo', () => {
    const json = (attrs: object) => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'rtLang', attrs }] },
          ],
        },
      ],
    });
    expect(roundTrip(json({ lang: 'en', dir: 'RTL' }))).toBe(
      '<p><span lang="en">a</span></p>',
    );
    expect(roundTrip(json({ lang: '1', dir: 'rtl' }))).toBe(
      '<p><span>a</span></p>',
    );
    // e a saída relida é texto comum (o span sem lang não é marca)
    expect(roundTrip('<p><span>a</span></p>')).toBe('<p>a</p>');
  });
});

describe('rtLang: comandos', () => {
  it('setLang valida pela regra do esquema; unsetLang remove', () => {
    const editor = createTestEditor({ features: FEATURES }, '<p>abc</p>');
    selectAll(editor);
    expect(editor.commands.setLang({ lang: '1' })).toBe(false);
    expect(editor.commands.setLang({ lang: 'en', dir: 'up' as never })).toBe(
      false,
    );
    expect(canonical(editor)).toBe('<p>abc</p>');
    expect(editor.commands.setLang({ lang: 'pt-BR' })).toBe(true);
    expect(canonical(editor)).toBe('<p><span lang="pt-BR">abc</span></p>');
    expect(editor.commands.setLang({ lang: 'ar', dir: 'rtl' })).toBe(true);
    expect(canonical(editor)).toBe(
      '<p><span lang="ar" dir="rtl">abc</span></p>',
    );
    expect(editor.commands.unsetLang()).toBe(true);
    expect(canonical(editor)).toBe('<p>abc</p>');
  });

  it('sem newsBlocks não há setLang e o lang é descartado', () => {
    const editor = createTestEditor(
      { features: { ...FEATURES, newsBlocks: false } },
      '<p><span lang="en">a</span></p>',
    );
    expect(
      (editor.commands as Record<string, unknown>)['setLang'],
    ).toBeUndefined();
    expect(canonical(editor)).toBe('<p>a</p>');
  });
});
