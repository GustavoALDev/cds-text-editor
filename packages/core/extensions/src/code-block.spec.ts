// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RTE_CODE_LANGUAGES,
  defineCodeLanguage,
} from '../../code-languages/src/index';
import type { RteCodeLanguage } from '../../code-languages/src/index';
import { validateHtml } from '../../html/src/validate-html';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { resolveCodeLanguage } from './code-block';
import { createEditorExtensions } from './factory';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

const ONLY_CODE = {
  colors: false,
  code: true,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: false,
};

afterEach(() => destroyTestEditors());

const codeSpec = getHtmlSchema().elements['code']!;

function editorWith(
  content: string,
  codeLanguages: readonly RteCodeLanguage[] = [],
) {
  return createTestEditor({ features: ONLY_CODE, codeLanguages }, content);
}

function html(content: string, codeLanguages?: readonly RteCodeLanguage[]) {
  const editor = editorWith(content, codeLanguages);
  const out = getRteHtml(editor);
  expect(
    validateHtml(out, editor.storage.rtContent.schema, { mode: 'canonical' }),
  ).toEqual([]);
  return out;
}

describe('resolveCodeLanguage', () => {
  it('minúsculas ASCII e alias do catálogo → id', () => {
    expect(resolveCodeLanguage('JS', RTE_CODE_LANGUAGES, codeSpec)).toBe(
      'javascript',
    );
    expect(resolveCodeLanguage('c++', RTE_CODE_LANGUAGES, codeSpec)).toBe(
      'cpp',
    );
    expect(resolveCodeLanguage('Python', RTE_CODE_LANGUAGES, codeSpec)).toBe(
      'python',
    );
  });

  it('sem catálogo devolve o nome em minúsculas, se o esquema aceitar', () => {
    expect(resolveCodeLanguage('JS', [], codeSpec)).toBe('js');
  });

  it('nomes herdados de Object não são aliases', () => {
    const cases: [string, string | null][] = [
      ['constructor', 'constructor'],
      ['toString', 'tostring'],
      ['hasOwnProperty', 'hasownproperty'],
      ['__proto__', null],
    ];
    for (const [name, expected] of cases) {
      expect(resolveCodeLanguage(name, RTE_CODE_LANGUAGES, codeSpec)).toBe(
        expected,
      );
    }
  });

  it('fora do padrão do esquema → null', () => {
    expect(resolveCodeLanguage('Bad_Id', [], codeSpec)).toBeNull();
    expect(resolveCodeLanguage('', [], codeSpec)).toBeNull();
    expect(resolveCodeLanguage('a b', [], codeSpec)).toBeNull();
    // Só minúsculas ASCII: o "K" de Kelvin não vira "k".
    expect(resolveCodeLanguage('Kotlin', [], codeSpec)).toBeNull();
  });
});

describe('codeBlock: leitura e saída', () => {
  it('alias do catálogo vira o id e hljs é descartada', () => {
    expect(
      html(
        '<pre><code class="hljs language-JS">a &lt; b</code></pre>',
        RTE_CODE_LANGUAGES,
      ),
    ).toBe('<pre><code class="language-javascript">a &lt; b</code></pre>');
  });

  it('sem catálogo guarda o nome em minúsculas', () => {
    expect(html('<pre><code class="language-JS">x</code></pre>')).toBe(
      '<pre><code class="language-js">x</code></pre>',
    );
  });

  it('language-constructor com catálogo não chama load', () => {
    const load = vi.fn(async () => () => ({ name: 'x', contains: [] }));
    const catalog = [
      defineCodeLanguage({ id: 'fake', name: 'F', aliases: [], load }),
    ];
    expect(
      html('<pre><code class="language-constructor">x</code></pre>', catalog),
    ).toBe('<pre><code class="language-constructor">x</code></pre>');
    expect(load).not.toHaveBeenCalled();
  });

  it('classe fora do padrão → bloco sem linguagem', () => {
    expect(html('<pre><code class="language-Bad_Id">x</code></pre>')).toBe(
      '<pre><code>x</code></pre>',
    );
  });

  it('preserva espaços e tabulações', () => {
    expect(html('<pre><code>  a\n\tb</code></pre>')).toBe(
      '<pre><code>  a\n\tb</code></pre>',
    );
  });

  it('atributos do pre não são guardados', () => {
    expect(html('<pre class="x" style="color: red"><code>x</code></pre>')).toBe(
      '<pre><code>x</code></pre>',
    );
  });

  it('linguagem inválida vinda de JSON não é renderizada', () => {
    const editor = editorWith('');
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'x" onclick="y' },
          content: [{ type: 'text', text: 'a' }],
        },
      ],
    });
    expect(getRteHtml(editor)).toBe('<pre><code>a</code></pre>');
  });
});

describe('codeBlock: comandos', () => {
  it('toggleCodeBlock({ language: "ts" }) guarda typescript', () => {
    const editor = editorWith('<p>x</p>', RTE_CODE_LANGUAGES);
    expect(editor.commands.toggleCodeBlock({ language: 'ts' })).toBe(true);
    expect(editor.state.doc.firstChild?.attrs['language']).toBe('typescript');
    expect(getRteHtml(editor)).toBe(
      '<pre><code class="language-typescript">x</code></pre>',
    );
  });

  it('setCodeBlock sem linguagem e com linguagem inválida', () => {
    const editor = editorWith('<p>x</p>');
    expect(editor.commands.setCodeBlock({ language: 'Bad_Id' })).toBe(false);
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(editor.commands.setCodeBlock()).toBe(true);
    expect(getRteHtml(editor)).toBe('<pre><code>x</code></pre>');
  });

  it('toggleCodeBlock com linguagem inválida devolve false', () => {
    const editor = editorWith('<p>x</p>');
    expect(editor.commands.toggleCodeBlock({ language: 'nope!' })).toBe(false);
    expect(getRteHtml(editor)).toBe('<p>x</p>');
  });

  it('setCodeBlockLanguage resolve, recusa e remove', () => {
    const editor = editorWith('<pre><code>x</code></pre>', RTE_CODE_LANGUAGES);
    editor.commands.setTextSelection(2);
    expect(editor.commands.setCodeBlockLanguage('PY')).toBe(true);
    expect(getRteHtml(editor)).toBe(
      '<pre><code class="language-python">x</code></pre>',
    );
    expect(editor.commands.setCodeBlockLanguage('nope!')).toBe(false);
    expect(editor.state.doc.firstChild?.attrs['language']).toBe('python');
    expect(editor.commands.setCodeBlockLanguage(null)).toBe(true);
    expect(getRteHtml(editor)).toBe('<pre><code>x</code></pre>');
  });

  it('setCodeBlockLanguage fora de um bloco de código devolve false', () => {
    const editor = editorWith('<p>x</p>');
    editor.commands.setTextSelection(1);
    expect(editor.commands.setCodeBlockLanguage('js')).toBe(false);
    expect(getRteHtml(editor)).toBe('<p>x</p>');
  });

  it('Tab dentro do bloco não muda o documento (WCAG 2.1.2)', () => {
    const editor = editorWith('<pre><code>ab</code></pre>');
    editor.commands.setTextSelection(2);
    const before = editor.state.doc;
    editor.commands.keyboardShortcut('Tab');
    editor.commands.keyboardShortcut('Shift-Tab');
    expect(editor.state.doc.eq(before)).toBe(true);
  });

  it('regra de entrada ``` resolve o alias', () => {
    const editor = editorWith('<p></p>', RTE_CODE_LANGUAGES);
    editor.commands.insertContent('```js');
    // Digitação do espaço pelo handleTextInput da vista (regra de entrada).
    const { view } = editor;
    const at = view.state.selection.from;
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, at, at, ' ', () => view.state.tr.insertText(' ', at, at)),
    );
    expect(handled).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe('codeBlock');
    expect(editor.state.doc.firstChild?.attrs['language']).toBe('javascript');
  });
});

describe('codeBlock: fábrica', () => {
  it('entra depois das cores e só com o recurso ligado', () => {
    const on = createEditorExtensions({
      features: { ...ONLY_CODE, colors: true },
    }).map((e) => e.name);
    expect(on.indexOf('codeBlock')).toBe(on.indexOf('rtHighlight') + 1);
    const off = createEditorExtensions({
      features: { ...ONLY_CODE, code: false },
    }).map((e) => e.name);
    expect(off).not.toContain('codeBlock');
  });
});
