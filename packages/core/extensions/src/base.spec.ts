// @vitest-environment jsdom
import type { Content } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import { pressKey } from './testing/press-key';

const OFF = {
  colors: false,
  code: false,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: false,
};

afterEach(() => destroyTestEditors());

/** `setContent(content)` → `getRteHtml`, conferindo a saída no esquema. */
function roundTrip(content: Content): string {
  const editor = createTestEditor({ features: OFF });
  editor.commands.setContent(content);
  const html = getRteHtml(editor);
  expect(validateHtml(html, editor.storage.rtContent.schema)).toEqual([]);
  return html;
}

describe('base: títulos', () => {
  it('h1→h2, h5/h6→h4, id de entrada ignorado, alinhamento mantido', () => {
    expect(
      roundTrip(
        '<h1 id="evil">A</h1><h5>B</h5><h6>C</h6><h3 style="text-align: right">D</h3>',
      ),
    ).toBe(
      '<h2 id="rt-a">A</h2><h4 id="rt-b">B</h4><h4 id="rt-c">C</h4><h3 id="rt-d" style="text-align: right">D</h3>',
    );
  });

  it('nível fora de 2–4 vindo de JSON é limitado na renderização', () => {
    expect(
      roundTrip({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'A' }],
          },
          {
            type: 'heading',
            attrs: { level: 6 },
            content: [{ type: 'text', text: 'B' }],
          },
        ],
      }),
    ).toBe('<h2 id="rt-a">A</h2><h4 id="rt-b">B</h4>');
  });
});

describe('base: alinhamento', () => {
  it('valor fora da lista é ignorado', () => {
    expect(roundTrip('<p style="text-align: start">a</p>')).toBe('<p>a</p>');
  });

  it('justify sai igual', () => {
    const html = '<p style="text-align: justify">a</p>';
    expect(roundTrip(html)).toBe(html);
  });
});

describe('base: lista ordenada', () => {
  it('só start; type e list-style-type descartados', () => {
    expect(
      roundTrip(
        '<ol start="3" type="a" style="list-style-type: lower-alpha"><li>a</li></ol>',
      ),
    ).toBe('<ol start="3"><li><p>a</p></li></ol>');
  });

  it.each(['1', '0', '100001', 'x', '-2'])('start="%s" → sem start', (v) => {
    expect(roundTrip(`<ol start="${v}"><li>a</li></ol>`)).toBe(
      '<ol><li><p>a</p></li></ol>',
    );
  });

  it('start inválido vindo de JSON é omitido na renderização', () => {
    const json = (start: unknown) => ({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start },
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
              ],
            },
          ],
        },
      ],
    });
    expect(roundTrip(json(2.5))).toBe('<ol><li><p>a</p></li></ol>');
    expect(roundTrip(json(100000))).toBe(
      '<ol start="100000"><li><p>a</p></li></ol>',
    );
  });
});

describe('base: marcas e blocos', () => {
  it('marcas oficiais com as regras de leitura do Tiptap', () => {
    expect(
      roundTrip(
        '<p><b>a</b><i>b</i><u>c</u><del>d</del><code>e</code><sup>f</sup><sub>g</sub><b style="font-weight:normal">h</b></p>',
      ),
    ).toBe(
      '<p><strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code><sup>f</sup><sub>g</sub>h</p>',
    );
  });

  it('blockquote, hr e br saem iguais', () => {
    const html = '<blockquote><p>a</p></blockquote><hr><p>a<br>b</p>';
    expect(roundTrip(html)).toBe(html);
  });

  it('lista com marcadores', () => {
    const html = '<ul><li><p>a</p></li></ul>';
    expect(roundTrip(html)).toBe(html);
  });
});

describe('base: Tab nas listas (§6, WCAG 2.1.2)', () => {
  it('Tab aninha o item quando pode; no 1º item devolve false', () => {
    const editor = createTestEditor(
      { features: OFF },
      '<ul><li><p>a</p></li><li><p>b</p></li></ul>',
    );
    editor.commands.setTextSelection(4);
    const before = editor.state.doc;
    expect(pressKey(editor, 'Tab')).toBe(false);
    expect(editor.state.doc.eq(before)).toBe(true);
    editor.commands.setTextSelection(9);
    expect(editor.state.selection.$from.parent.textContent).toBe('b');
    expect(pressKey(editor, 'Tab')).toBe(true);
    expect(getRteHtml(editor)).toBe(
      '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>',
    );
    // Já aninhado sob o único irmão anterior: não aninha mais.
    expect(pressKey(editor, 'Tab')).toBe(false);
  });

  it('fora de lista e de tabela, Tab não é tratado', () => {
    const editor = createTestEditor({ features: OFF }, '<p>a</p>');
    editor.commands.setTextSelection(2);
    expect(pressKey(editor, 'Tab')).toBe(false);
    expect(pressKey(editor, 'Tab', true)).toBe(false);
  });
});
