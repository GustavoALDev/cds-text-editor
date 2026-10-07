// @vitest-environment jsdom
import { Editor, Extension } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_EMBED_PROVIDERS } from '../../src/embeds/providers';
import { RTE_CONTENT_LABELS } from './labels';
import { createEditorExtensions } from './factory';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

const OFF = {
  colors: false,
  code: false,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: false,
};

// Nomes oficiais do Tiptap 3.31.4 para Dropcursor/Gapcursor (B19).
const BASE_NAMES = [
  'rtContent',
  'doc',
  'paragraph',
  'text',
  'heading',
  'blockquote',
  'horizontalRule',
  'hardBreak',
  'bulletList',
  'orderedList',
  'listItem',
  'listKeymap',
  'textAlign',
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'subscript',
  'superscript',
  'link',
  'undoRedo',
  'dropCursor',
  'gapCursor',
];

const editors: Editor[] = [];

afterEach(() => {
  destroyTestEditors();
  for (const editor of editors.splice(0)) editor.destroy();
});

/**
 * Cópia profunda das opções. O getter `options` do Tiptap 3 recria a cada
 * acesso os objetos e funções literais do `addOptions` (Extendable.ts), então
 * `Object.is` só vale para primitivos: objetos são copiados em profundidade
 * (detecta mutação, inclusive de objetos guardados em closures) e funções
 * viram o seu código-fonte.
 */
function snapshot(value: unknown): unknown {
  if (typeof value === 'function') return `fn:${String(value)}`;
  if (Array.isArray(value)) return value.map(snapshot);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, snapshot(v)]),
    );
  }
  return value;
}

describe('createEditorExtensions: lista e ordem', () => {
  it('recursos desligados: só a base, na ordem da spec §6', () => {
    const names = createEditorExtensions({ features: OFF }).map((e) => e.name);
    expect(names).toEqual(BASE_NAMES);
  });

  it('recursos ligados entram depois da base, na ordem da spec §6', () => {
    const names = createEditorExtensions({
      features: {
        ...OFF,
        colors: true,
        code: true,
        tables: true,
        tasks: true,
        media: true,
        embeds: true,
        newsBlocks: true,
      },
    }).map((e) => e.name);
    expect(names).toEqual([
      ...BASE_NAMES,
      'rtTextColor',
      'rtHighlight',
      'codeBlock',
      'table',
      'tableRow',
      'tableHeader',
      'tableCell',
      'rtTaskList',
      'rtTaskItem',
      'rtImage',
      'rtVideo',
      'rtEmbed',
      'rtPullquote',
      'rtCallout',
      'rtCalloutTitle',
      'rtReadAlso',
      'rtReadAlsoTitle',
      'rtReadAlsoList',
      'rtReadAlsoItem',
      'rtLang',
    ]);
  });

  it('extensões do consumidor entram por último', () => {
    const extra = Extension.create({ name: 'extra' });
    const list = createEditorExtensions({ features: OFF, extensions: [extra] });
    expect(list.map((e) => e.name)).toEqual([...BASE_NAMES, 'extra']);
    expect(list[list.length - 1]).toBe(extra);
  });

  it('search e slashCommands são aceitos e ignorados', () => {
    const names = createEditorExtensions({
      features: { ...OFF, search: true, slashCommands: true },
    }).map((e) => e.name);
    expect(names).toEqual(BASE_NAMES);
  });
});

describe('createEditorExtensions: erros', () => {
  it('nome repetido entre as nossas e as do consumidor lança TypeError', () => {
    expect(() => createEditorExtensions({ extensions: [Paragraph] })).toThrow(
      TypeError,
    );
    expect(() => createEditorExtensions({ extensions: [Paragraph] })).toThrow(
      /"paragraph"/,
    );
  });

  it('nome repetido entre as do consumidor lança TypeError', () => {
    const call = () =>
      createEditorExtensions({
        extensions: [
          Extension.create({ name: 'x' }),
          Extension.create({ name: 'x' }),
        ],
      });
    expect(call).toThrow(TypeError);
    expect(call).toThrow(/"x"/);
  });

  it('idPrefix inválido lança RangeError (como getHtmlSchema)', () => {
    expect(() => createEditorExtensions({ idPrefix: 'X' })).toThrow(RangeError);
  });

  it('provedor com host inválido lança TypeError', () => {
    const base = DEFAULT_EMBED_PROVIDERS[0];
    if (!base) throw new Error('sem provedor padrão');
    const bad = { ...base, hosts: ['localhost'] };
    expect(() => createEditorExtensions({ embedProviders: [bad] })).toThrow(
      TypeError,
    );
  });
});

describe('createEditorExtensions: instâncias e opções (lição 4)', () => {
  it('duas chamadas não compartilham instâncias', () => {
    const a = createEditorExtensions({ features: OFF });
    const b = createEditorExtensions({ features: OFF });
    expect(a).toHaveLength(b.length);
    a.forEach((ext, i) => expect(ext).not.toBe(b[i]));
  });

  it('criar, editar e destruir um editor não muda as opções das extensões', () => {
    let lang: 'pt-BR' | 'en' = 'pt-BR';
    const list = createEditorExtensions({
      features: OFF,
      labels: () => RTE_CONTENT_LABELS[lang],
    });
    const before = list.map((ext) => snapshot(ext.options));
    const editor = new Editor({
      element: document.body.appendChild(document.createElement('div')),
      extensions: list,
      content: '<h2>A</h2><ol start="3"><li>b</li></ol>',
    });
    editor.commands.setTextSelection(2);
    editor.commands.insertContent('xyz');
    editor.commands.setTextAlign('center');
    editor.commands.toggleBold();
    lang = 'en';
    getRteHtml(editor);
    editor.destroy();
    list.forEach((ext: AnyExtension, i) => {
      const after = ext.options as Record<string, unknown>;
      const prev = before[i] as Record<string, unknown>;
      expect(Object.keys(after)).toEqual(Object.keys(prev));
      for (const key of Object.keys(prev)) {
        const value = after[key];
        if (
          value !== null &&
          typeof value !== 'object' &&
          typeof value !== 'function'
        ) {
          expect(Object.is(value, prev[key])).toBe(true);
        } else {
          expect(snapshot(value)).toStrictEqual(prev[key]);
        }
      }
    });
  });
});

describe('getRteHtml', () => {
  it('editor criado sem a fábrica lança TypeError', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text],
      content: '<p>a</p>',
    });
    editors.push(editor);
    expect(() => getRteHtml(editor)).toThrow(TypeError);
  });

  it('ids de título presentes logo após a criação, sem transação (lição 10)', () => {
    const element = document.body.appendChild(document.createElement('div'));
    const editor = new Editor({
      element,
      extensions: createEditorExtensions({ features: OFF }),
      content: '<h2>A</h2>',
    });
    editors.push(editor);
    expect(getRteHtml(editor)).toBe('<h2 id="rt-a">A</h2>');
  });

  it('usa o idPrefix e os rótulos guardados pela fábrica', () => {
    const editor = createTestEditor(
      { features: OFF, idPrefix: 'doc-' },
      '<h3>Olá mundo</h3>',
    );
    expect(getRteHtml(editor)).toBe('<h3 id="doc-ola-mundo">Olá mundo</h3>');
    expect(editor.storage.rtContent.idPrefix).toBe('doc-');
    expect(editor.storage.rtContent.schema.idPrefix).toBe('doc-');
  });

  it('rótulos por função são lidos a cada uso', () => {
    let lang: 'pt-BR' | 'en' = 'pt-BR';
    const editor = createTestEditor({
      features: OFF,
      labels: () => RTE_CONTENT_LABELS[lang],
    });
    expect(editor.storage.rtContent.labels().readAlsoTitle).toBe('Leia também');
    lang = 'en';
    expect(editor.storage.rtContent.labels().readAlsoTitle).toBe('Read also');
  });

  it('editor sem montar (sem element) também serializa', () => {
    const editor = new Editor({
      extensions: createEditorExtensions({ features: OFF }),
      content: '<h1>T</h1><p>a</p>',
    });
    editors.push(editor);
    expect(getRteHtml(editor)).toBe('<h2 id="rt-t">T</h2><p>a</p>');
  });

  it('Heading oficial cru ainda vira duplicado ao lado da fábrica', () => {
    expect(() => createEditorExtensions({ extensions: [Heading] })).toThrow(
      /"heading"/,
    );
  });
});
