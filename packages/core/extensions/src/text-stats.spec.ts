// @vitest-environment jsdom
// Contagem do editor (spec 03c, C5, C7, R2): `getRteTextStats` é igual a
// `countCharacters`/`countWords` de `htmlToText(serializeRteHtml(doc))` e só
// recalcula os blocos de topo alterados.
//
// Reproduzir uma falha da propriedade: `FC_SEED=<n> npx vitest run
// extensions/src/text-stats.spec.ts`; `FC_RUNS` muda o número de execuções.
import { getSchema } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RTE_CODE_LANGUAGES } from '../../code-languages/src/index';
import { htmlToText } from '../../html/src/html-to-text';
import { countCharacters, countWords } from '../../src/text';
import { createEditorExtensions } from './factory';
import { RTE_CONTENT_LABELS } from './labels';
import { serializeRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import {
  NBSP,
  hostileDoc,
  validDoc,
  type Json,
} from './testing/doc-arbitraries';
import { readFixture } from './testing/fixtures';
import { getRteTextStats, textStatsProbe } from './text-stats';
import type { RteContentLabelsSource } from './types';

const SEED = Number(process.env['FC_SEED'] ?? 20261003);
const RUNS = Number(process.env['FC_RUNS'] ?? 300);
vi.setConfig({ testTimeout: 300_000 });

afterEach(() => destroyTestEditors());

const PT = RTE_CONTENT_LABELS['pt-BR'];
const ES = RTE_CONTENT_LABELS.es;

const withLabels = (labels?: RteContentLabelsSource) =>
  labels === undefined ? {} : { labels };

function ref(doc: ProseMirrorNode, labels?: RteContentLabelsSource) {
  const t = htmlToText(serializeRteHtml(doc, withLabels(labels)));
  return { characters: countCharacters(t), words: countWords(t) };
}

const docOf = (html: string) => createTestEditor({}, html).state.doc;

describe('getRteTextStats', () => {
  it('fixture all-features: igual a htmlToText(serializeRteHtml)', () => {
    const doc = createTestEditor(
      { codeLanguages: RTE_CODE_LANGUAGES },
      readFixture('all-features.html'),
    ).state.doc;
    expect(getRteTextStats(doc)).toEqual(ref(doc));
    expect(getRteTextStats(doc, { labels: PT })).toEqual(ref(doc, PT));
    expect(getRteTextStats(doc).words).toBeGreaterThan(0);
  });

  it.each([
    ['vazio', '', 0, 0],
    ['só espaços e NBSP', `<p> ${NBSP} ${NBSP} </p>`, 0, 0],
    ['quebra de linha', '<p>a<br>b</p>', 2, 2],
    ['emoji', '<p>😀 a</p>', 3, null],
    ['emoji com ZWJ', '<p>👨‍👩‍👧</p>', 5, null],
    ['marca no meio da palavra', '<p>no<strong>tícia</strong></p>', 7, 1],
    ['código', '<pre><code>a\n\tb</code></pre>', 3, null],
  ] as const)('%s', (_name, html, characters, words) => {
    const doc = docOf(html);
    const stats = getRteTextStats(doc);
    expect(stats.characters).toBe(characters);
    if (words !== null) expect(stats.words).toBe(words);
    expect(stats).toEqual(ref(doc));
  });

  it('legenda e crédito da imagem contam', () => {
    const editor = createTestEditor({});
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'rtImage',
          attrs: {
            src: 'https://example.com/a.png',
            caption: 'Legenda',
            credit: 'Foto: Ana',
          },
        },
      ],
    });
    const doc = editor.state.doc;
    expect(getRteTextStats(doc).characters).toBe(17);
    expect(getRteTextStats(doc)).toEqual(ref(doc));
  });

  it('título vazio de caixa conta com o rótulo', () => {
    const callout = (title: string) =>
      docOf(
        `<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title">${title}</p><p>x</p></aside>`,
      );
    for (const doc of [callout(''), callout('<br>')]) {
      expect(getRteTextStats(doc, { labels: ES }).characters).toBe(9);
      expect(getRteTextStats(doc, { labels: PT }).characters).toBe(8);
      expect(getRteTextStats(doc)).toEqual(ref(doc));
      expect(getRteTextStats(doc, { labels: ES })).toEqual(ref(doc, ES));
      expect(getRteTextStats(doc, { labels: PT })).toEqual(ref(doc, PT));
    }
  });

  it('cache por bloco de topo: só o bloco alterado é recalculado', () => {
    const html = Array.from(
      { length: 500 },
      (_, i) => `<p>palavra ${i + 1}</p>`,
    ).join('');
    const editor = createTestEditor({}, html);
    const doc = editor.state.doc;
    expect(getRteTextStats(doc).words).toBe(1000);

    let pos = 0;
    for (let i = 0; i < 249; i++) pos += doc.child(i).nodeSize;
    const next = editor.state.tr.insertText('x', pos + 2).doc;
    expect(next.child(249).textContent).toBe('pxalavra 250');

    textStatsProbe.blocks = 0;
    expect(getRteTextStats(next)).toEqual(ref(next));
    expect(textStatsProbe.blocks).toBe(1);

    textStatsProbe.blocks = 0;
    getRteTextStats(next);
    expect(textStatsProbe.blocks).toBe(0);

    textStatsProbe.blocks = 0;
    getRteTextStats(next, { labels: ES });
    expect(textStatsProbe.blocks).toBe(0);
  });
});

describe('propriedade: igual a htmlToText(serializeRteHtml) (R2)', () => {
  const schema = getSchema(createEditorExtensions());
  const whitespaceDoc: fc.Arbitrary<Json> = fc
    .array(
      fc.string({
        unit: fc.constantFrom(
          ' ',
          '\t',
          '\r',
          '\n',
          NBSP,
          ' ',
          '　',
          '\0',
          'a',
          'é',
          '😀',
        ),
        minLength: 1,
      }),
      { minLength: 1, maxLength: 4 },
    )
    .map((texts) => ({
      type: 'doc',
      content: texts.map((text) => ({
        type: 'paragraph',
        content: [{ type: 'text', text }],
      })),
    }));
  const labels = fc.constantFrom<RteContentLabelsSource | undefined>(
    undefined,
    PT,
    ES,
    { readAlsoTitle: '  ' },
  );

  it('documentos válidos, hostis e de espaços × rótulos', () => {
    fc.assert(
      fc.property(
        fc.oneof(validDoc, hostileDoc, whitespaceDoc),
        labels,
        (json, source) => {
          const doc = schema.nodeFromJSON(json);
          expect(getRteTextStats(doc, withLabels(source))).toEqual(
            ref(doc, source),
          );
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});
