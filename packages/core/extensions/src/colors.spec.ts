// @vitest-environment jsdom
import type { Content } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import {
  RTE_HIGHLIGHT_COLORS,
  RTE_TEXT_COLORS,
} from '../../src/schema/palette';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

const OFF = {
  code: false,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: false,
};

afterEach(() => destroyTestEditors());

function roundTrip(content: Content, colors = true): string {
  const editor = createTestEditor({ features: { ...OFF, colors } });
  editor.commands.setContent(content);
  const html = getRteHtml(editor);
  expect(validateHtml(html, editor.storage.rtContent.schema)).toEqual([]);
  return html;
}

describe('rtTextColor: leitura', () => {
  it('regenera o style da paleta e ignora o de entrada', () => {
    expect(
      roundTrip('<span data-rt-color="red" style="color: blue">a</span>'),
    ).toBe('<p><span data-rt-color="red" style="color: #b3261e">a</span></p>');
  });

  it('style sem data-rt-color não vira cor', () => {
    expect(roundTrip('<span style="color: red">a</span>')).toBe('<p>a</p>');
  });

  it.each(['constructor', '__proto__', 'toString', 'magenta', 'yellow'])(
    'nome %s não resolve para cor',
    (name) => {
      expect(roundTrip(`<span data-rt-color="${name}">a</span>`)).toBe(
        '<p>a</p>',
      );
    },
  );

  it('atributo color solto no span não é lido', () => {
    expect(roundTrip('<span color="red">a</span>')).toBe('<p>a</p>');
  });

  it.each(RTE_TEXT_COLORS)('cor de texto $name valida em canonical', (c) => {
    expect(roundTrip(`<span data-rt-color="${c.name}">a</span>`)).toBe(
      `<p><span data-rt-color="${c.name}" style="color: ${c.light}">a</span></p>`,
    );
  });

  it('colors: false remove a marca e os comandos', () => {
    const editor = createTestEditor({ features: { ...OFF, colors: false } });
    expect(editor.commands['setTextColor' as never]).toBeUndefined();
    expect(roundTrip('<span data-rt-color="red">a</span>', false)).toBe(
      '<p>a</p>',
    );
  });
});

describe('rtHighlight: leitura', () => {
  it('mark simples vira yellow', () => {
    expect(roundTrip('<mark>a</mark>')).toBe(
      '<p><mark data-rt-color="yellow" style="background-color: #fff3a3">a</mark></p>',
    );
  });

  it.each([
    '<mark data-color="#ff0">a</mark>',
    '<mark data-rt-color="constructor">a</mark>',
    '<mark data-rt-color="__proto__">a</mark>',
    '<mark data-rt-color="red">a</mark>',
  ])('%s vira yellow', (html) => {
    expect(roundTrip(html)).toBe(
      '<p><mark data-rt-color="yellow" style="background-color: #fff3a3">a</mark></p>',
    );
  });

  it('mantém green e ignora style de entrada', () => {
    expect(
      roundTrip('<mark data-rt-color="green" style="background: red">a</mark>'),
    ).toBe(
      '<p><mark data-rt-color="green" style="background-color: #ccf2d1">a</mark></p>',
    );
  });

  it.each(RTE_HIGHLIGHT_COLORS)('marca-texto $name valida', (c) => {
    expect(roundTrip(`<mark data-rt-color="${c.name}">a</mark>`)).toBe(
      `<p><mark data-rt-color="${c.name}" style="background-color: ${c.light}">a</mark></p>`,
    );
  });
});

describe('cores: JSON e comandos', () => {
  it('color inválido no JSON sai sem atributos', () => {
    const doc = (type: string) => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'a',
              marks: [{ type, attrs: { color: 'evil' } }],
            },
          ],
        },
      ],
    });
    expect(roundTrip(doc('rtTextColor'))).toBe('<p><span>a</span></p>');
    expect(roundTrip(doc('rtHighlight'))).toBe('<p><mark>a</mark></p>');
  });

  it('comandos aceitam só nomes da paleta', () => {
    const editor = createTestEditor({ features: { ...OFF, colors: true } });
    editor.commands.setContent('<p>abc</p>');
    editor.commands.selectAll();
    expect(editor.commands.setTextColor('red')).toBe(true);
    expect(getRteHtml(editor)).toBe(
      '<p><span data-rt-color="red" style="color: #b3261e">abc</span></p>',
    );
    expect(editor.commands.setTextColor('magenta')).toBe(false);
    expect(editor.commands.setTextColor('constructor')).toBe(false);
    expect(editor.commands.unsetTextColor()).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>abc</p>');
    expect(editor.commands.setHighlight('blue')).toBe(true);
    expect(getRteHtml(editor)).toBe(
      '<p><mark data-rt-color="blue" style="background-color: #d3e8ff">abc</mark></p>',
    );
    expect(editor.commands.setHighlight('red')).toBe(false);
    expect(editor.commands.unsetHighlight()).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>abc</p>');
  });
});
