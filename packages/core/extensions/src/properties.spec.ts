// @vitest-environment jsdom
// Propriedades da serialização (spec 03b, §7.5): (a) segurança — nenhum
// esquema perigoso chega a `href`/`src`/`srcset`/`poster`, nenhum atributo
// `on*`/`srcdoc`, e as únicas violações aceitas são de elemento inerte;
// (b) idempotência — `serializeRteHtml(parse(serializeRteHtml(doc)))` igual a
// `serializeRteHtml(doc)`.
//
// (b) usa só documentos válidos (ruling da Task 5): elemento inerte (sem
// `href`/`src`) não é relido, então URLs inválidas ficam só em (a). A
// propriedade confere `validateHtml(saída) = []` antes de comparar, para um
// gerador que produza algo inerte falhar em vez de passar calado.
//
// Reproduzir uma falha: `FC_SEED=<n> npx vitest run extensions/src/properties.spec.ts`
// (a semente aparece na falha); `FC_RUNS` muda o número de execuções.
import { Editor, getSchema } from '@tiptap/core';
import { DOMParser as PMParser } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import * as fc from 'fast-check';
import { Parser } from 'htmlparser2';
import { describe, expect, it, vi } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { createEditorExtensions } from './factory';
import { getRteHtml, serializeRteHtml } from './serialize';
import {
  hostileDoc,
  isSpaceOrControl,
  validDoc,
} from './testing/doc-arbitraries';
import type { Json } from './testing/doc-arbitraries';

const SEED = Number(process.env['FC_SEED'] ?? 20261003);
const RUNS = Number(process.env['FC_RUNS'] ?? 500);
vi.setConfig({ testTimeout: 300_000 }); // FC_RUNS alto em execuções locais

const schema = getSchema(createEditorExtensions());
const S = getHtmlSchema();
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'poster']);
const DANGEROUS = /^(?:javascript|data|vbscript|file):/;
const stripSpaceAndControls = (value: string) =>
  [...value].filter((c) => !isSpaceOrControl(c)).join('');

// ---------------------------------------------------------------------------
// Auxiliares

/** Pares `[nome, valor]` de todos os atributos (candidatos do `srcset` à parte). */
function attributes(html: string): [string, string][] {
  const pairs: [string, string][] = [];
  const parser = new Parser(
    {
      onopentag(_tag, attrs) {
        for (const [name, value] of Object.entries(attrs)) {
          pairs.push([name, value]);
          if (name === 'srcset') {
            for (const candidate of value.split(',')) {
              pairs.push([name, candidate]);
            }
          }
        }
      },
    },
    {
      decodeEntities: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    },
  );
  parser.write(html);
  parser.end();
  return pairs;
}

/** `DOMParser.fromSchema(schema).parse` sobre um `div` do jsdom. */
function parse(html: string): ProseMirrorNode {
  const body = new window.DOMParser().parseFromString(html, 'text/html').body;
  const div = document.createElement('div');
  div.append(...Array.from(body.childNodes));
  return PMParser.fromSchema(schema).parse(div);
}

const params = { seed: SEED, numRuns: RUNS };

// ---------------------------------------------------------------------------

describe('propriedades da serialização', () => {
  it('(a) segurança: nenhum esquema perigoso; só violações de elemento inerte', () => {
    fc.assert(
      fc.property(hostileDoc, (json) => {
        const out = serializeRteHtml(schema.nodeFromJSON(json));
        for (const [name, value] of attributes(out)) {
          expect(name).not.toMatch(/^(?:on|srcdoc$)/);
          if (URL_ATTRS.has(name)) {
            expect(stripSpaceAndControls(value.toLowerCase())).not.toMatch(
              DANGEROUS,
            );
          }
        }
        for (const v of validateHtml(out, S, { mode: 'accepted' })) {
          expect(v.kind).toBe('missing-required-attribute');
          expect(['href', 'src']).toContain(v.name);
        }
      }),
      params,
    );
  });

  it('(b) idempotência com documentos válidos e textos arbitrários', () => {
    fc.assert(
      fc.property(validDoc, (json) => {
        const out = serializeRteHtml(schema.nodeFromJSON(json));
        expect(validateHtml(out, S)).toEqual([]);
        expect(serializeRteHtml(parse(out))).toBe(out);
      }),
      params,
    );
  });
});

// ---------------------------------------------------------------------------
// JSON hostil em tabelas (B9): colspan/rowspan e colwidth são normalizados na
// leitura do JSON, antes de existir estado; `TableMap`/`TableView` iteram
// sobre os atributos crus (colspan 1e6 travava `new Editor`).

describe('JSON hostil em tabelas', () => {
  const cell = (attrs: Json) => ({
    type: 'tableCell',
    attrs,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
  });
  const table = (attrs: Json): Json => ({
    type: 'table',
    content: [{ type: 'tableRow', content: [cell(attrs)] }],
  });
  const doc = (attrs: Json): Json => ({ type: 'doc', content: [table(attrs)] });
  const bare = '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>';
  const withWidth = (w: number) =>
    `<table><colgroup><col style="width: ${w}px"></colgroup><tbody><tr><td><p>a</p></td></tr></tbody></table>`;

  function cellAttrs(editor: Editor): Record<string, unknown>[] {
    const list: Record<string, unknown>[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell') list.push({ ...node.attrs });
    });
    return list;
  }

  const cases: [string, Json, Record<string, unknown>, string][] = [
    [
      'colspan 1e6',
      { colspan: 1_000_000 },
      { colspan: 1, rowspan: 1, colwidth: null },
      bare,
    ],
    [
      'rowspan 1e6',
      { rowspan: 1_000_000 },
      { colspan: 1, rowspan: 1, colwidth: null },
      bare,
    ],
    [
      'colwidth [0]',
      { colwidth: [0] },
      { colspan: 1, rowspan: 1, colwidth: null },
      bare,
    ],
    [
      'colwidth [1e5]',
      { colwidth: [100_000] },
      { colspan: 1, rowspan: 1, colwidth: [9999] },
      withWidth(9999),
    ],
    [
      'colwidth [123.5]',
      { colwidth: [123.5] },
      { colspan: 1, rowspan: 1, colwidth: [124] },
      withWidth(124),
    ],
    [
      'colwidth maior que o colspan',
      { colspan: 2, colwidth: [50, 60, 70, 80] },
      { colspan: 2, rowspan: 1, colwidth: [50, 60] },
      '<table><colgroup><col style="width: 50px"><col style="width: 60px"></colgroup><tbody><tr><td colspan="2"><p>a</p></td></tr></tbody></table>',
    ],
  ];

  it.each(cases)(
    '%s: conteúdo inicial canônico e carga rápida',
    (_name, attrs, expected, out) => {
      const editor = new Editor({
        extensions: createEditorExtensions(),
        content: doc(attrs),
      });
      try {
        // Sem vista ainda: o estado já nasce canônico.
        expect(cellAttrs(editor)).toEqual([expected]);
        const element = document.body.appendChild(
          document.createElement('div'),
        );
        const start = Date.now();
        editor.mount(element);
        expect(Date.now() - start).toBeLessThan(5000);
        expect(getRteHtml(editor)).toBe(out);
        expect(validateHtml(out, S, { mode: 'canonical' })).toEqual([]);
        element.remove();
      } finally {
        editor.destroy();
      }
    },
    10_000,
  );

  it.each(cases)(
    '%s: setContent e insertContent normalizam',
    (_name, attrs, expected) => {
      const editor = new Editor({ extensions: createEditorExtensions() });
      try {
        editor.commands.setContent(doc(attrs));
        expect(cellAttrs(editor)).toEqual([expected]);
        editor.commands.setContent('<p>x</p>');
        editor.commands.insertContentAt(editor.state.doc.content.size, [
          table(attrs),
        ]);
        expect(cellAttrs(editor)).toEqual([expected]);
      } finally {
        editor.destroy();
      }
    },
    10_000,
  );

  it('o JSON de entrada não é alterado', () => {
    const input = doc({ colspan: 1_000_000, colwidth: [123.5] });
    const before = JSON.stringify(input);
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: input,
    });
    editor.destroy();
    expect(JSON.stringify(input)).toBe(before);
  });
});
