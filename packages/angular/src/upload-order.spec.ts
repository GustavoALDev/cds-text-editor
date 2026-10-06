// @vitest-environment jsdom
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { insertUploaded } from './upload/insert';
import { RTE_UPLOAD_KEY, type RteUploadMeta } from './upload/markers';
import { validDoc } from './testing-support/core-docs';
import { destroyTestEditors } from './testing-support/editors';
import { FC_RUNS, fcOptions } from './testing-support/media-urls';
import {
  addGesture,
  dispatchMeta,
  markersEditor,
  mediaSrcs,
  uploadState,
} from './testing-support/upload-markers';

// Spec 05c2a, Tarefa 5: propriedade da ordem do gesto (R6, E11; Ruling 7).

afterEach(() => destroyTestEditors());

type Edit =
  | { op: 'event' }
  | { op: 'insertText'; at: number }
  | { op: 'deleteRange'; a: number; b: number }
  | { op: 'splitBlock'; at: number }
  | { op: 'undo' }
  | { op: 'redo' }
  | { op: 'paste'; at: number; html: string };

const editArb: fc.Arbitrary<Edit> = fc.oneof(
  { weight: 4, arbitrary: fc.constant({ op: 'event' as const }) },
  fc.record({ op: fc.constant('insertText' as const), at: fc.nat() }),
  fc.record({
    op: fc.constant('deleteRange' as const),
    a: fc.nat(),
    b: fc.nat(),
  }),
  fc.record({ op: fc.constant('splitBlock' as const), at: fc.nat() }),
  fc.constant({ op: 'undo' as const }),
  fc.constant({ op: 'redo' as const }),
  fc.record({
    op: fc.constant('paste' as const),
    at: fc.nat(),
    html: fc.constantFrom('<p>p</p>', '<b>q</b>', '<p>r</p><p>s</p>'),
  }),
);

const caseArb = fc.integer({ min: 1, max: 5 }).chain((n) =>
  fc.record({
    doc: validDoc as fc.Arbitrary<JSONContent>,
    point: fc.nat(),
    n: fc.constant(n),
    videos: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
    // permutação das chegadas e o destino de cada arquivo
    order: fc.shuffledSubarray(
      Array.from({ length: n }, (_, i) => i),
      { minLength: n, maxLength: n },
    ),
    arrives: fc.array(
      fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, fc.constant(false)),
      {
        minLength: n,
        maxLength: n,
      },
    ),
    selects: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
    script: fc.array(editArb, { maxLength: 14 }),
  }),
);

const SRC = /^\/up-(\d+)\.(png|webm)$/;

function caretAt(editor: Editor, at: number): void {
  const { state } = editor;
  const pos = at % (state.doc.content.size + 1);
  editor.view.dispatch(
    state.tr.setSelection(TextSelection.near(state.doc.resolve(pos))),
  );
}

function runEdit(editor: Editor, e: Exclude<Edit, { op: 'event' }>): void {
  switch (e.op) {
    case 'insertText':
      caretAt(editor, e.at);
      editor.commands.insertContent('t');
      return;
    case 'deleteRange': {
      const size = editor.state.doc.content.size + 1;
      const a = e.a % size;
      const b = e.b % size;
      try {
        editor.commands.deleteRange({
          from: Math.min(a, b),
          to: Math.max(a, b),
        });
      } catch (err) {
        if (
          !(err instanceof Error) ||
          err.constructor.name !== 'TransformError'
        ) {
          throw err;
        }
      }
      return;
    }
    case 'splitBlock':
      caretAt(editor, e.at);
      editor.commands.splitBlock();
      return;
    case 'undo':
      editor.commands.undo();
      return;
    case 'redo':
      editor.commands.redo();
      return;
    case 'paste':
      caretAt(editor, e.at);
      editor.view.pasteHTML(e.html, new Event('paste') as ClipboardEvent);
      return;
  }
}

const emptyParagraphs = (doc: ProseMirrorNode) => {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === 'paragraph' && node.content.size === 0) n += 1;
  });
  return n;
};

/** Ids dos outros marcadores que estão num parágrafo vazio. */
function inEmptyParagraph(editor: Editor, except: string): string[] {
  const { doc } = editor.state;
  return uploadState(editor)
    .markers.filter((m) => {
      if (m.id === except) return false;
      const $m = doc.resolve(m.pos);
      return (
        $m.parent.type.name === 'paragraph' && $m.parent.content.size === 0
      );
    })
    .map((m) => m.id);
}

describe('ordem do gesto: propriedade (R6, E11)', () => {
  it(
    'mídias do gesto na ordem dos arquivos; marcadores fora do documento',
    () => {
      fc.assert(
        fc.property(caseArb, (c) => {
          destroyTestEditors();
          const editor = markersEditor('');
          editor.commands.setContent(c.doc, { emitUpdate: false });
          caretAt(editor, c.point);
          const origin = editor.state.doc.resolve(editor.state.selection.to);
          const parent = origin.depth > 0 ? origin.node(-1) : null;
          const index = origin.depth > 0 ? origin.index(-1) : 0;
          const image = editor.state.schema.nodes['rtImage'];
          const originEmpty =
            origin.parent.type.name === 'paragraph' &&
            origin.parent.content.size === 0 &&
            !!parent &&
            !!image &&
            parent.canReplaceWith(index, index + 1, image);
          const emptyBefore = emptyParagraphs(editor.state.doc);
          const markerTrs: Transaction[] = [];
          editor.on('transaction', ({ transaction }) => {
            const meta = transaction.getMeta(RTE_UPLOAD_KEY) as
              RteUploadMeta | undefined;
            if (meta && !meta.placed) markerTrs.push(transaction);
          });
          const markers = addGesture(editor, c.n, { prefix: 'up-' });
          let edited = false;
          let arrived = 0;
          const pending = [...c.order];
          const event = () => {
            const i = pending.shift();
            if (i === undefined) return;
            const id = markers[i]?.id as string;
            if (!c.arrives[i]) {
              dispatchMeta(editor, { remove: [id] });
              return;
            }
            const guarded = inEmptyParagraph(editor, id);
            const video = c.videos[i] === true;
            const src = `/up-${i}.${video ? 'webm' : 'png'}`;
            const ok = video
              ? insertUploaded(editor, {
                  id,
                  type: 'video',
                  attrs: { src },
                  select: c.selects[i] === true,
                })
              : insertUploaded(editor, {
                  id,
                  type: 'image',
                  attrs: { src, alt: null },
                  select: c.selects[i] === true,
                });
            expect(ok).toBe(true);
            arrived += 1;
            // R6: o parágrafo vazio só some quando não resta marcador nele
            expect(inEmptyParagraph(editor, id)).toEqual(guarded);
          };
          for (const step of c.script) {
            if (step.op === 'event') event();
            else {
              runEdit(editor, step);
              edited = true;
            }
          }
          while (pending.length) event();
          // nada de estado transitório no documento nem no HTML canônico
          const html = getRteHtml(editor);
          expect(html).not.toContain('rte-upload-marker');
          expect(html).not.toMatch(/(?:blob|data):/i);
          expect(uploadState(editor).markers).toEqual([]);
          expect(markerTrs.every((tr) => !tr.docChanged)).toBe(true);
          // ordem do gesto = ordem dos arquivos
          const indices = mediaSrcs(editor.state.doc)
            .map((src) => SRC.exec(src)?.[1])
            .filter((x): x is string => x !== undefined)
            .map(Number);
          expect(indices).toEqual([...indices].sort((a, b) => a - b));
          if (!edited) {
            expect(indices).toHaveLength(arrived);
            // Ruling 7: só sem edições, e com todos chegando
            if (arrived === c.n && originEmpty) {
              expect(emptyParagraphs(editor.state.doc)).toBe(emptyBefore - 1);
            }
          }
        }),
        fcOptions(),
      );
    },
    120_000 * Math.max(1, FC_RUNS / 100),
  );
});
